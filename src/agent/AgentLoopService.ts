import type {
    ChatCompletionMessageParam,
    ChatCompletionTool
} from 'openai/resources/chat/completions';
import { AGENT_MAX_STEPS } from './motabixTools';
import { ToolExecutor } from './ToolExecutor';
import { ChatService, ChatWithToolsResult } from '../services/ChatService';

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
        signal?: AbortSignal;
        onStep?: (info: AgentLoopStepInfo) => void;
        onHitMaxSteps?: (maxSteps: number) => void;
    }): Promise<AgentLoopResult> {
        // Hard-coded per PLAN — not configurable in MVP.
        const maxSteps = AGENT_MAX_STEPS;
        const messages = [...options.messages];
        let steps = 0;
        let nudgedForMissingTools = false;

        console.log(
            `[Motabix][agent] start model=${options.model} maxSteps=${maxSteps} tools=${options.tools.length}`
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

            console.log(`[Motabix][agent] round ${step}/${maxSteps} requesting completion…`);

            let completion: ChatWithToolsResult;
            try {
                completion = await this.chatService.completeWithTools(
                    messages,
                    options.model,
                    options.tools,
                    options.signal
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
                // Only nudge when the USER asked to create/edit — not when they asked
                // how to run / explain and the model regurgitated a fake confirm template.
                if (
                    steps === 0 &&
                    !nudgedForMissingTools &&
                    userAskedForFileEdit(latestUser) &&
                    looksLikeFakeEditClaim(prose)
                ) {
                    nudgedForMissingTools = true;
                    console.log(
                        `[Motabix][agent] round ${step}: prose claimed an edit without tools — nudging once`
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
                            'SYSTEM: You described a file create/edit but did not call any tool. ' +
                            'Call edit_file now with path and full content. ' +
                            'Do not ask the user to confirm in text — Motabix shows Accept/Reject after edit_file. ' +
                            'Never say تصویرت or ask to confirm an image.'
                    });
                    // Retry this round budget slot without counting a tool step.
                    step -= 1;
                    continue;
                }

                console.log(
                    `[Motabix][agent] no tool calls — ending loop. stepsDone=${steps}`
                );
                return {
                    finalText: sanitizeAssistantProse(prose),
                    steps,
                    stopped: false,
                    hitMaxSteps: false
                };
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
                    result = await this.toolExecutor.execute(call.name, call.arguments);
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
    if (
        /چ(ی|ه)?\s*کار|چیکار|چطور|اجرا|run\b|how (?:do|can|to)|explain|توضیح/i.test(
            userText
        )
    ) {
        return false;
    }
    return /اضافه کن|بساز|ایجاد|درست کن|تغییر بده|بنویس|create\b|add (?:a )?file|new file|write (?:a )?file|edit\b|modify\b|update\b/i.test(
        userText
    );
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
