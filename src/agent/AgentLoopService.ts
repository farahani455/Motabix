import type {
    ChatCompletionMessageParam,
    ChatCompletionTool
} from 'openai/resources/chat/completions';
import { AGENT_MAX_STEPS } from './motabixTools';
import { ToolExecutor } from './ToolExecutor';
import { ChatService, ChatToolCall, ChatWithToolsResult } from '../services/ChatService';
import { isEditMode } from '../utils/isAskMode';

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
        /** T9-1: Edit mode — return false to stop before the next step. */
        askContinueAfterStep?: (step: number) => Promise<boolean>;
        onHitMaxSteps?: (maxSteps: number) => void;
    }): Promise<AgentLoopResult> {
        // Hard-coded per PLAN — not configurable in MVP.
        const maxSteps = AGENT_MAX_STEPS;
        const messages = [...options.messages];
        let steps = 0;
        let nudgedForMissingTools = false;
        /** One-shot: force a tool call on the next completion only. */
        let forceToolsNextRound = true;
        /** Extra edit_file calls recovered from one fake multi-file dump. */
        const pendingRecoveredEdits: ChatToolCall[] = [];
        const initialUserText = latestUserText(messages);
        const initialUserWantsCommand = userAskedForShellCommand(initialUserText);
        const initialUserWantsEdit =
            !initialUserWantsCommand && userAskedForFileEdit(initialUserText);

        console.log(
            `[Motabix][agent] start model=${options.model} agent=${options.agentMode ?? '(none)'} ` +
                `maxSteps=${maxSteps} tools=${options.tools.length} ` +
                `wantsCommand=${initialUserWantsCommand} wantsEdit=${initialUserWantsEdit}`
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

            let completion: ChatWithToolsResult;

            // Drain fake multi-edit dumps one edit_file per step (no extra API round).
            if (pendingRecoveredEdits.length > 0) {
                const next = pendingRecoveredEdits.shift()!;
                console.log(
                    `[Motabix][agent] round ${step}/${maxSteps}: pending recovered ${next.name}`
                );
                completion = {
                    content: null,
                    toolCalls: [next],
                    finishReason: 'tool_calls'
                };
            } else {
                // Local models often paste shell/markdown instead of calling tools.
                const toolChoice = !forceToolsNextRound
                    ? ('auto' as const)
                    : initialUserWantsCommand
                      ? ({ type: 'function' as const, function: { name: 'run_command' } })
                      : initialUserWantsEdit
                        ? ({ type: 'function' as const, function: { name: 'edit_file' } })
                        : ('required' as const);
                forceToolsNextRound = false;
                console.log(
                    `[Motabix][agent] round ${step}/${maxSteps} requesting completion… ` +
                        `tool_choice=${JSON.stringify(toolChoice)}`
                );

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
            }

            if (!completion.toolCalls.length) {
                const prose = completion.content?.trim() || '';
                const latestUser = latestUserText(messages);
                const wantsCommand =
                    userAskedForShellCommand(latestUser) || looksLikeShellDumpInsteadOfTool(prose);
                const wantsEdit =
                    !wantsCommand &&
                    (userAskedForFileEdit(latestUser) ||
                        looksLikeCodeDumpInsteadOfTool(prose) ||
                        looksLikeFakeEditResultDump(prose));

                const recoveredCommand = wantsCommand
                    ? recoverRunCommandFromMarkdown(prose)
                    : null;
                const fakeEdits =
                    !recoveredCommand && (wantsEdit || looksLikeFakeEditResultDump(prose))
                        ? recoverFakeEditFileDumps(prose)
                        : [];
                const recoveredEdit =
                    !recoveredCommand && fakeEdits.length === 0 && wantsEdit
                        ? recoverEditFileFromMarkdown(prose, latestUser)
                        : null;
                const recovered = recoveredCommand ?? fakeEdits[0] ?? recoveredEdit;

                if (recovered) {
                    if (fakeEdits.length > 1) {
                        pendingRecoveredEdits.push(...fakeEdits.slice(1));
                        console.log(
                            `[Motabix][agent] recovered ${fakeEdits.length} fake edit_file dumps; ` +
                                `${fakeEdits.length - 1} queued`
                        );
                    } else {
                        console.log(
                            `[Motabix][agent] recovered ${recovered.name} from assistant prose`
                        );
                    }
                    completion = {
                        content: null,
                        toolCalls: [recovered],
                        finishReason: completion.finishReason
                    };
                } else if (
                    steps === 0 &&
                    !nudgedForMissingTools &&
                    (wantsCommand || wantsEdit)
                ) {
                    nudgedForMissingTools = true;
                    forceToolsNextRound = true;
                    console.log(
                        `[Motabix][agent] round ${step}: no tools but user asked for ` +
                            `${wantsCommand ? 'run_command' : 'edit_file'} — nudging once`
                    );
                    if (prose) {
                        messages.push({
                            role: 'assistant',
                            content: prose
                        });
                    }
                    messages.push({
                        role: 'user',
                        content: wantsCommand
                            ? 'SYSTEM: Do NOT paste shell commands for the user to copy. ' +
                              'Call run_command NOW with {"command":"..."}. ' +
                              'For delete on Windows use del/rm; then wait for the tool result.'
                            : 'SYSTEM: Do NOT paste code for the user to copy/replace. ' +
                              'Call edit_file NOW with the full fixed file content. ' +
                              'Arguments: {"path":"<file path>","content":"<entire file>"}. ' +
                              'If an attached file path is in the user message, use that path.'
                    });
                    step -= 1;
                    continue;
                } else {
                    console.log(
                        `[Motabix][agent] no tool calls — ending loop. stepsDone=${steps} ` +
                            `wantsCommand=${wantsCommand} wantsEdit=${wantsEdit}`
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
                        agentMode: options.agentMode,
                        signal: options.signal
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

            // T9-1/T9-2: Edit asks «بروم بعدی؟»; Edit Automatically runs until
            // natural end, Stop (abort), or maxSteps — never that prompt.
            if (
                isEditMode(options.agentMode) &&
                step < maxSteps &&
                options.askContinueAfterStep
            ) {
                console.log(
                    `[Motabix][agent] step ${step}: waiting for continue (Edit mode)`
                );
                const shouldContinue = await options.askContinueAfterStep(step);
                if (options.signal?.aborted) {
                    return {
                        finalText: 'Stopped by user.',
                        steps,
                        stopped: true,
                        hitMaxSteps: false
                    };
                }
                if (!shouldContinue) {
                    console.log(
                        `[Motabix][agent] step ${step}: user declined next step`
                    );
                    return {
                        finalText: 'Agent stopped: user chose not to continue.',
                        steps,
                        stopped: true,
                        hitMaxSteps: false
                    };
                }
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
        /اضافه|بساز|ایجاد|درست|اصلاح|رفع|فیکس|تغییر|بنویس|اعمال|عوض|ذخیره|بکش|جدا|بیرون|extract|سینتکس|syntax|error|bug|باگ|غلط|خراب|create\b|add (?:a )?file|new file|write (?:a )?file|edit\b|modify\b|update\b|refactor|fix\b|patch\b|split\b|move (?:to|into)/i.test(
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

/** User wants Motabix to actually run a shell command (not just explain it). */
function userAskedForShellCommand(userText: string): boolean {
    if (!userText) {
        return false;
    }
    const intent = userText.split(/\nAttached files:/)[0] ?? userText;
    // Pure how-to questions stay explanatory.
    if (
        /چطور|how (?:do|can|to)|توضیح بده|explain/i.test(intent) &&
        !/run_command|حذف|پاک|del\b|rm\b|خودت اجرا|اجرا کن/i.test(intent)
    ) {
        return false;
    }
    return /run_command|با\s*run_command|خودت اجرا|اجرا کن|حذف کن|پاک کن|پاکش|حذفش|del\s|rm\s|rmdir|dir\b|ls\b|echo\b|node\s|npm\s|pnpm\s|yarn\s/i.test(
        intent
    );
}

function looksLikeShellDumpInsteadOfTool(text: string): boolean {
    if (!text) {
        return false;
    }
    if (/```(?:sh|bash|shell|cmd|powershell|ps1)?\s*\n[\s\S]{3,}?```/i.test(text)) {
        return /del\b|rm\b|حذف|run_command|"command"\s*:/i.test(text);
    }
    return /run_command\s*[\n{]/.test(text) && /"command"\s*:/.test(text);
}

/**
 * Recover a run_command call when the model pastes ```sh …``` or tool JSON instead.
 */
function recoverRunCommandFromMarkdown(text: string): ChatToolCall | null {
    if (!text) {
        return null;
    }

    // Full / partial tool JSON in prose
    const named = text.match(
        /\{\s*"name"\s*:\s*"run_command"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/
    );
    if (named?.[1]) {
        try {
            const args = JSON.parse(named[1]) as { command?: string };
            if (typeof args.command === 'string' && args.command.trim()) {
                return {
                    id: 'call_recovered_md_run_command',
                    name: 'run_command',
                    arguments: JSON.stringify({ command: args.command.trim() })
                };
            }
        } catch {
            // try broken extract below
        }
    }

    const commandField = text.match(/"command"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (commandField?.[1] && /run_command/i.test(text)) {
        try {
            const command = JSON.parse(`"${commandField[1]}"`) as string;
            if (command.trim()) {
                return {
                    id: 'call_recovered_md_run_command',
                    name: 'run_command',
                    arguments: JSON.stringify({ command: command.trim() })
                };
            }
        } catch {
            // ignore
        }
    }

    const fences = [
        ...text.matchAll(/```(?:sh|bash|shell|cmd|powershell|ps1)?\s*\n([\s\S]*?)```/gi)
    ];
    for (const fence of fences) {
        let body = (fence[1] ?? '').trim();
        if (!body) {
            continue;
        }
        if (body.startsWith('{')) {
            try {
                const parsed = JSON.parse(body) as { command?: string; name?: string };
                if (typeof parsed.command === 'string' && parsed.command.trim()) {
                    return {
                        id: 'call_recovered_md_run_command',
                        name: 'run_command',
                        arguments: JSON.stringify({ command: parsed.command.trim() })
                    };
                }
            } catch {
                const inner = body.match(/"command"\s*:\s*"((?:\\.|[^"\\])*)"/);
                if (inner?.[1]) {
                    try {
                        const command = JSON.parse(`"${inner[1]}"`) as string;
                        if (command.trim()) {
                            return {
                                id: 'call_recovered_md_run_command',
                                name: 'run_command',
                                arguments: JSON.stringify({ command: command.trim() })
                            };
                        }
                    } catch {
                        // continue
                    }
                }
            }
            continue;
        }
        // Take first non-empty line as the command (skip comments).
        const line =
            body
                .split(/\r?\n/)
                .map((l) => l.trim())
                .find((l) => l && !l.startsWith('#')) ?? '';
        if (line && line.length <= 2000) {
            return {
                id: 'call_recovered_md_run_command',
                name: 'run_command',
                arguments: JSON.stringify({ command: line })
            };
        }
    }

    return null;
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

/**
 * Weak models invent fake tool results in prose, e.g.
 * {"ok":true,"tool":"edit_file","path":"...","content":"..."}
 * instead of calling edit_file.
 */
function looksLikeFakeEditResultDump(text: string): boolean {
    if (!text || text.length < 40) {
        return false;
    }
    return (
        /"tool"\s*:\s*"edit_file"/.test(text) ||
        /"name"\s*:\s*"edit_file"/.test(text)
    ) && /"path"\s*:\s*"/.test(text) && /"content"\s*:/.test(text);
}

/**
 * Turn one or more fake edit_file JSON dumps into real tool calls.
 */
function recoverFakeEditFileDumps(text: string): ChatToolCall[] {
    if (!text) {
        return [];
    }

    const recovered: ChatToolCall[] = [];
    const seenPaths = new Set<string>();
    let cursor = 0;

    while (cursor < text.length) {
        const start = text.indexOf('{', cursor);
        if (start < 0) {
            break;
        }
        const relativeEnd = findMatchingBraceFrom(text, start);
        if (relativeEnd < 0) {
            cursor = start + 1;
            continue;
        }
        const slice = text.slice(start, relativeEnd + 1);
        cursor = relativeEnd + 1;

        const parsed = parseFakeEditFileDump(slice);
        if (!parsed) {
            continue;
        }
        const pathKey = parsed.path.replace(/\\/g, '/').toLowerCase();
        if (seenPaths.has(pathKey)) {
            continue;
        }
        seenPaths.add(pathKey);
        recovered.push({
            id: `call_recovered_fake_edit_${recovered.length}`,
            name: 'edit_file',
            arguments: JSON.stringify({
                path: parsed.path,
                content: parsed.content
            })
        });
    }

    return recovered;
}

function parseFakeEditFileDump(
    slice: string
): { path: string; content: string } | null {
    let obj: Record<string, unknown>;
    try {
        const parsed = JSON.parse(slice) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return null;
        }
        obj = parsed as Record<string, unknown>;
    } catch {
        return null;
    }

    // {"ok":true,"tool":"edit_file","path":"...","content":"..."}
    if (
        (obj.tool === 'edit_file' || obj.name === 'edit_file') &&
        typeof obj.path === 'string' &&
        typeof obj.content === 'string' &&
        obj.path.trim() &&
        obj.content.length > 0
    ) {
        return { path: obj.path.trim(), content: obj.content };
    }

    // {"name":"edit_file","arguments":{"path":"...","content":"..."}}
    if (obj.name === 'edit_file' || obj.tool === 'edit_file') {
        let inner: unknown = obj.arguments ?? obj.parameters;
        if (typeof inner === 'string') {
            try {
                inner = JSON.parse(inner);
            } catch {
                return null;
            }
        }
        if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
            const args = inner as Record<string, unknown>;
            if (
                typeof args.path === 'string' &&
                typeof args.content === 'string' &&
                args.path.trim() &&
                args.content.length > 0
            ) {
                return { path: args.path.trim(), content: args.content };
            }
        }
    }

    return null;
}

/** Index of the matching `}` for the `{` at start, or -1. */
function findMatchingBraceFrom(text: string, start: number): number {
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === '"') {
                inString = false;
            }
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === '{') {
            depth += 1;
        } else if (ch === '}') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
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
    if (looksLikeFakeEditResultDump(text)) {
        const cleaned = stripFakeEditResultDumps(text).trim();
        if (!cleaned) {
            return (
                'مدل به‌جای فراخوانی edit_file فقط JSON جعلی نوشته بود و قابل بازیابی نبود. ' +
                'لطفاً دوباره همان درخواست را بفرست.'
            );
        }
        return cleaned;
    }
    return text;
}

/** Remove fake edit_file JSON blobs from assistant prose for display. */
function stripFakeEditResultDumps(text: string): string {
    let result = '';
    let cursor = 0;
    while (cursor < text.length) {
        const start = text.indexOf('{', cursor);
        if (start < 0) {
            result += text.slice(cursor);
            break;
        }
        result += text.slice(cursor, start);
        const end = findMatchingBraceFrom(text, start);
        if (end < 0) {
            result += text.slice(start);
            break;
        }
        const slice = text.slice(start, end + 1);
        if (!parseFakeEditFileDump(slice)) {
            result += slice;
        }
        cursor = end + 1;
    }
    return result.replace(/\n{3,}/g, '\n\n');
}
