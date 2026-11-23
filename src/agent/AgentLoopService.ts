import type {
    ChatCompletionMessageParam,
    ChatCompletionTool
} from 'openai/resources/chat/completions';
import { AGENT_MAX_STEPS } from './motabixTools';
import { ToolExecutor } from './ToolExecutor';
import { ChatService, ChatToolCall, ChatWithToolsResult } from '../services/ChatService';
import { isEditAutomatically } from '../utils/isAskMode';

export type AgentLoopStepInfo = {
    step: number;
    toolName: string;
    toolCallId: string;
    argsPreview: string;
    resultPreview: string;
    result: string;
};

export type AgentLoopResult = {
    finalText: string;
    steps: number;
    stopped: boolean;
    hitMaxSteps: boolean;
};

export class AgentLoopService {
    constructor(
        private readonly chatService: ChatService,
        private readonly toolExecutor: ToolExecutor
    ) {}

    async run(options: {
        messages: ChatCompletionMessageParam[];
        model: string;
        tools: ChatCompletionTool[];
        agentMode?: string;
        signal?: AbortSignal;
        onStep?: (info: AgentLoopStepInfo) => void;
        onHitMaxSteps?: (maxSteps: number) => void;
    }): Promise<AgentLoopResult> {
        // Hard-coded per PLAN — not configurable in MVP.
        const maxSteps = AGENT_MAX_STEPS;
        const messages = [...options.messages];
        let steps = 0;
        let nudgedForMissingTools = false;
        /** One-shot: force a tool call on the next completion only. */
        let forceToolsNextRound = true;
        const initialUserWantsEdit = userAskedForFileEdit(latestUserText(messages));

        console.log(
            `[Motabix][agent] start model=${options.model} agent=${options.agentMode ?? '(none)'} ` +
                `maxSteps=${maxSteps} tools=${options.tools.length} wantsEdit=${initialUserWantsEdit}`
        );

        for (let step = 1; step <= maxSteps; step++) {
            if (options.signal?.aborted) {
                console.log(`[Motabix][agent] aborted before step ${step} (stepsDone=${steps})`);
                return {
                    finalText: 'Stopped by user.',
                    steps,
                    stopped: true,
                    hitMaxSteps: false
                };
            }

            // Local models (qwen etc.) often ignore tools / paste markdown to replace manually.
            // When the user asked for an edit, force edit_file specifically on the first/nudge round.
            const toolChoice = !forceToolsNextRound
                ? ('auto' as const)
                : initialUserWantsEdit
                  ? ({ type: 'function' as const, function: { name: 'edit_file' } })
                  : ('required' as const);
            forceToolsNextRound = false;
            console.log(
                `[Motabix][agent] round ${step}/${maxSteps} requesting completion… ` +
                    `tool_choice=${JSON.stringify(toolChoice)}`
            );

            let completion: ChatWithToolsResult;
            try {
                completion = await this.chatService.completeWithTools(
                    messages,
                    options.model,
                    options.tools,
                    options.signal,
                    toolChoice
                );
            } catch (error) {
                if (options.signal?.aborted) {
                    console.log(`[Motabix][agent] aborted during round ${step}`);
                    return {
                        finalText: 'Stopped by user.',
                        steps,
                        stopped: true,
                        hitMaxSteps: false
                    };
                }
                throw error;
            }

            console.log(
                `[Motabix][agent] round ${step} finishReason=${completion.finishReason} ` +
                    `toolCalls.length=${completion.toolCalls.length} ` +
                    `contentLength=${completion.content?.length ?? 0}`
            );

            if (!completion.toolCalls.length) {
                const prose = completion.content?.trim() || '';
                const latestUser = latestUserText(messages);
                const wantsEdit =
                    userAskedForFileEdit(latestUser) || looksLikeCodeDumpInsteadOfTool(prose);

                // qwen often pastes a full file in markdown instead of calling edit_file.
                const recovered = wantsEdit
                    ? recoverEditFileFromMarkdown(prose, latestUser)
                    : null;
                if (recovered) {
                    let recoveredPath = '(unknown)';
                    try {
                        recoveredPath = String(
                            (JSON.parse(recovered.arguments) as { path?: string }).path ?? '(unknown)'
                        );
                    } catch {
                        // ignore
                    }
                    console.log(
                        `[Motabix][agent] recovered edit_file from markdown fence path=${recoveredPath}`
                    );
                    completion = {
                        content: null,
                        toolCalls: [recovered],
                        finishReason: completion.finishReason
                    };
                } else if (steps === 0 && !nudgedForMissingTools && wantsEdit) {
                    nudgedForMissingTools = true;
                    forceToolsNextRound = true;
                    console.log(
                        `[Motabix][agent] round ${step}: no tools but user asked for a file edit — nudging once` +
                            (isEditAutomatically(options.agentMode) ? ' (Edit Automatically)' : '')
                    );
                    if (prose) {
                        messages.push({
                            role: 'assistant',
                            content: prose
                        });
                    }
                    messages.push({
                        role: 'user',
                        content:
                            'SYSTEM: Do NOT paste code for the user to copy/replace. ' +
                            'Call edit_file NOW with the full fixed file content. ' +
                            'Arguments: {"path":"<file path>","content":"<entire file>"}. ' +
                            'If an attached file path is in the user message, use that path.'
                    });
                    step -= 1;
                    continue;
                } else {
                    console.log(
                        `[Motabix][agent] no tool calls — ending loop. stepsDone=${steps} wantsEdit=${wantsEdit}`
                    );
                    return {
                        finalText: sanitizeAssistantProse(prose),
                        steps,
                        stopped: false,
                        hitMaxSteps: false
                    };
                }
            }

            steps = step;

            messages.push({
                role: 'assistant',
                content: completion.content,
                tool_calls: completion.toolCalls.map((call) => ({
                    id: call.id,
                    type: 'function' as const,
                    function: {
                        name: call.name,
                        arguments: call.arguments
                    }
                }))
            });

            // PLAN: many read_file calls are allowed; at most one edit_file per step.
            const readFileCount = completion.toolCalls.filter((c) => c.name === 'read_file').length;
            if (readFileCount > 1) {
                console.log(
                    `[Motabix][agent] step ${step}: ${readFileCount} read_file calls in this round (allowed)`
                );
            }

            let editFileSeen = false;
            for (const call of completion.toolCalls) {
                if (options.signal?.aborted) {
                    console.log(`[Motabix][agent] aborted while running tools at step ${step}`);
                    return {
                        finalText: 'Stopped by user.',
                        steps,
                        stopped: true,
                        hitMaxSteps: false
                    };
                }

                let result: string;
                if (call.name === 'edit_file' && editFileSeen) {
                    result = JSON.stringify({
                        ok: false,
                        stub: true,
                        tool: 'edit_file',
                        message: 'At most one edit_file per agent step. Extra edit_file was skipped.'
                    });
                } else {
                    if (call.name === 'edit_file') {
                        editFileSeen = true;
                    }
                    // read_file: no per-step cap — every call is executed.
                    result = await this.toolExecutor.execute(call.name, call.arguments, {
                        agentMode: options.agentMode
                    });
                }

                console.log(
                    `[Motabix][step ${step}] ${call.name}(${truncate(call.arguments, 200)})\n` +
                        `  → ${truncate(result, 300)}`
                );

                options.onStep?.({
                    step,
                    toolName: call.name,
                    toolCallId: call.id,
                    argsPreview: truncate(call.arguments, 200),
                    resultPreview: truncate(result, 300),
                    result
                });

                messages.push({
                    role: 'tool',
                    tool_call_id: call.id,
                    content: result
                });
            }
        }

        console.log(`[Motabix][agent] hit max steps (${maxSteps})`);
        options.onHitMaxSteps?.(maxSteps);
        return {
            finalText:
                `Agent stopped: reached the hard limit of ${maxSteps} steps.\n` +
                `No more tool calls will run in this turn. Send a new message to continue.`,
            steps: maxSteps,
            stopped: false,
            hitMaxSteps: true
        };
    }
}

function truncate(text: string, max: number): string {
    if (text.length <= max) {
        return text;
    }
    return `${text.slice(0, max)}…`;
}

/** Detect chat prose that pretends a file change was proposed without tool calls. */
function looksLikeFakeEditClaim(text: string): boolean {
    if (!text) {
        return false;
    }
    const claimsEdit =
        /ایجاد شده|ساخته شد|نوشته شد|اعمال این تغییر|تصویرت را تأیید|لطفاً تأیید|please confirm|please accept|file (?:has been )?created|created (?:the )?file|written to disk|to apply (?:this|the) change/i.test(
            text
        );
    const mentionsFile =
        /فایل|file\b|index\.js|\.[a-z]{1,5}\b|edit_file|وب‌?سرور|web\s*server/i.test(text);
    return claimsEdit && mentionsFile;
}

function latestUserText(messages: ChatCompletionMessageParam[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.role !== 'user') {
            continue;
        }
        const content = typeof msg.content === 'string' ? msg.content.trim() : '';
        if (!content || content.startsWith('SYSTEM:')) {
            continue;
        }
        return content;
    }
    return '';
}

function userAskedForFileEdit(userText: string): boolean {
    if (!userText) {
        return false;
    }
    // How-to-run / explain questions must not trigger edit nudges.
    // Strip attached-files dump when checking intent.
    const intent = userText.split(/\nAttached files:/)[0] ?? userText;
    const asksEdit =
        /اضافه|بساز|ایجاد|درست|اصلاح|رفع|فیکس|تغییر|بنویس|اعمال|عوض|سینتکس|syntax|error|bug|باگ|غلط|خراب|create\b|add (?:a )?file|new file|write (?:a )?file|edit\b|modify\b|update\b|refactor|fix\b|patch\b/i.test(
            intent
        );
    if (
        /چ(ی|ه)?\s*کار|چیکار|چطور اجرا|اجراش|run\b|how (?:do|can|to)|explain|توضیح بده/i.test(
            intent
        ) &&
        !asksEdit
    ) {
        return false;
    }
    // Attached source file usually means the user wants work on that file in Edit modes.
    if (/\nFile:\s*.+\.[A-Za-z0-9]+\s*\n/.test(userText) && asksEdit) {
        return true;
    }
    return asksEdit;
}

function looksLikeCodeDumpInsteadOfTool(text: string): boolean {
    if (!text || text.length < 80) {
        return false;
    }
    const hasFence = /```[\s\S]{40,}```/.test(text);
    const replacey =
        /replace|ریپلیس|جایگزین|کپی کن|paste|copy (?:this|the)|entire (?:file|code)|کل (?:فایل|کد)|به جاش|این کد رو/i.test(
            text
        );
    return hasFence && (replacey || text.length > 400);
}

function attachedFilePathFromUser(userText: string): string | undefined {
    const matches = [...userText.matchAll(/^File:\s*(.+)\s*$/gm)];
    if (matches.length === 0) {
        return undefined;
    }
    // Prefer the last attached file (usually Active Document / target).
    return matches[matches.length - 1]?.[1]?.trim() || undefined;
}

function attachedFileBodyFromUser(userText: string): string | undefined {
    const matches = [...userText.matchAll(/File:\s*.+\r?\n```[^\n]*\r?\n([\s\S]*?)```/g)];
    if (matches.length === 0) {
        return undefined;
    }
    return matches[matches.length - 1]?.[1] ?? undefined;
}

/**
 * When the model dumps ```lang ... ``` with a nearby filename instead of edit_file,
 * turn the largest fence into an edit_file tool call — but never a tiny fragment
 * that would wipe an attached full file.
 */
function recoverEditFileFromMarkdown(
    text: string,
    latestUser: string
): ChatToolCall | null {
    if (!text) {
        return null;
    }

    const fences = [...text.matchAll(/```([^\n`]*)\n([\s\S]*?)```/g)];
    if (fences.length === 0) {
        return null;
    }

    let best = fences[0];
    for (const fence of fences) {
        if ((fence[2]?.length ?? 0) > (best[2]?.length ?? 0)) {
            best = fence;
        }
    }

    const content = (best[2] ?? '').replace(/\s+$/g, '\n');
    if (content.trim().length < 8) {
        return null;
    }

    const attachedBody = attachedFileBodyFromUser(latestUser);
    if (attachedBody && attachedBody.length >= 80) {
        const ratio = content.length / attachedBody.length;
        if (ratio < 0.5 && attachedBody.length - content.length >= 100) {
            console.log(
                `[Motabix][agent] skip markdown recovery — fragment too small ` +
                    `(fence=${content.length} attached=${attachedBody.length})`
            );
            return null;
        }
    }

    const langTag = (best[1] ?? '').trim();
    const langPath = langTag.match(/^[a-zA-Z0-9_+-]*:([^\s]+)$/);
    const pathMatchers = [
        langPath?.[1],
        text.match(
            /(?:edit_file|create|write|save|file|path|فایل)\s*[:(=]\s*[`"]?([^\s`"'<>]+\.[A-Za-z0-9]+)/i
        )?.[1],
        text.match(/`([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)`/)?.[1],
        text.match(
            /\b([A-Za-z0-9_./\\-]+\.(?:js|ts|tsx|jsx|mjs|cjs|json|css|html|md|py|go|rs|java))\b/
        )?.[1],
        attachedFilePathFromUser(latestUser)
    ];

    const filePath = pathMatchers.find((p) => typeof p === 'string' && p.length > 0);
    if (!filePath) {
        return null;
    }

    return {
        id: `call_recovered_md_edit_file`,
        name: 'edit_file',
        arguments: JSON.stringify({ path: filePath, content })
    };
}

/**
 * If the model regurgitates the broken «تصویرت را تأیید» template as a final
 * answer, replace it with a short honest fallback instead of showing nonsense.
 */
function sanitizeAssistantProse(text: string): string {
    if (!text) {
        return text;
    }
    if (/تصویرت/.test(text) && looksLikeFakeEditClaim(text)) {
        return (
            'متوجه منظورت شدم، ولی جواب قبلی‌ام اشتباه بود (الگوی جعلی «تأیید تصویر»).\n\n' +
            'اگر می‌خواهی فایل را اجرا کنی: در ترمینال `node index.js` را بزن و آدرس localhost چاپ‌شده را در مرورگر باز کن.\n' +
            'اگر تغییر دیگری در فایل می‌خواهی، واضح بگو تا با edit_file اعمال شود.'
        );
    }
    return text;
}
