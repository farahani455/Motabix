import { MOTABIX_TOOL_NAMES, MotabixToolName } from './motabixTools';
import { ChatToolCall } from '../services/ChatService';

const knownTools = new Set<string>(MOTABIX_TOOL_NAMES);

/**
 * Prefer native tool_calls. If the model (e.g. qwen2.5-coder on Ollama) dumps a
 * Motabix tool JSON into content instead, recover those into tool_calls.
 * Only known Motabix tool names are accepted — not free-form JSON parsing.
 */
export function extractToolCalls(message: {
    content?: string | null;
    tool_calls?: Array<{
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: unknown };
    }> | null;
}): { toolCalls: ChatToolCall[]; recoveredFromContent: boolean; content: string | null } {
    const native = (message.tool_calls ?? [])
        .map((call, index) => toChatToolCall(call, index))
        .filter((call): call is ChatToolCall => call !== null);

    if (native.length > 0) {
        return {
            toolCalls: native,
            recoveredFromContent: false,
            content: message.content ?? null
        };
    }

    const recovered = recoverFromContent(message.content ?? '');
    if (recovered.length > 0) {
        return {
            toolCalls: recovered,
            recoveredFromContent: true,
            // Avoid showing raw tool JSON as the final assistant text.
            content: null
        };
    }

    return {
        toolCalls: [],
        recoveredFromContent: false,
        content: message.content ?? null
    };
}

function toChatToolCall(
    call: {
        id?: string;
        type?: string;
        function?: { name?: string; arguments?: unknown };
    },
    index: number
): ChatToolCall | null {
    const name = call.function?.name?.trim() ?? '';
    if (!name || !knownTools.has(name)) {
        return null;
    }
    // Some Ollama payloads omit type; still accept if name is a Motabix tool.
    if (call.type && call.type !== 'function') {
        return null;
    }
    return {
        id: call.id?.trim() || `call_recovered_${index}_${name}`,
        name: name as MotabixToolName,
        arguments: normalizeArguments(call.function?.arguments)
    };
}

function recoverFromContent(content: string): ChatToolCall[] {
    const text = content.trim();
    if (!text) {
        return [];
    }

    const candidates: unknown[] = [];

    // Bare JSON object/array (whole message)
    pushParsed(candidates, text);

    // ```json ... ``` fences
    const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let fenceMatch: RegExpExecArray | null;
    while ((fenceMatch = fenceRegex.exec(text)) !== null) {
        pushParsed(candidates, fenceMatch[1].trim());
    }

    // <tool_call>...</tool_call>
    const tagRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(text)) !== null) {
        pushParsed(candidates, tagMatch[1].trim());
    }

    // Mixed prose + JSON (qwen often writes Persian/English then dumps a tool object)
    for (const embedded of extractEmbeddedJsonValues(text)) {
        candidates.push(embedded);
    }

    const calls: ChatToolCall[] = [];
    const callKeys = new Set<string>();
    let index = 0;
    for (const candidate of candidates) {
        const items = Array.isArray(candidate) ? candidate : [candidate];
        for (const item of items) {
            const call = fromLooseObject(item, index);
            if (!call) {
                continue;
            }
            const key = `${call.name}:${call.arguments}`;
            if (callKeys.has(key)) {
                continue;
            }
            callKeys.add(key);
            calls.push(call);
            index += 1;
        }
    }
    return calls;
}

/**
 * Scan for top-level JSON objects/arrays inside mixed text.
 * Prefers objects that look like Motabix tool calls so we don't grab random JSON.
 */
function extractEmbeddedJsonValues(text: string): unknown[] {
    const found: unknown[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch !== '{' && ch !== '[') {
            continue;
        }
        const sliced = text.slice(i);
        const end = findJsonEnd(sliced);
        if (end < 0) {
            continue;
        }
        const raw = sliced.slice(0, end + 1);
        if (seen.has(raw)) {
            continue;
        }
        try {
            const parsed = JSON.parse(raw);
            if (looksLikeToolPayload(parsed)) {
                seen.add(raw);
                found.push(parsed);
            }
        } catch {
            // keep scanning
        }
    }
    return found;
}

function findJsonEnd(text: string): number {
    const open = text[0];
    if (open !== '{' && open !== '[') {
        return -1;
    }
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = 0; i < text.length; i++) {
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
        if (ch === '{' || ch === '[') {
            depth += 1;
        } else if (ch === '}' || ch === ']') {
            depth -= 1;
            if (depth === 0) {
                return ch === close ? i : -1;
            }
        }
    }
    return -1;
}

function looksLikeToolPayload(value: unknown): boolean {
    if (Array.isArray(value)) {
        return value.some((item) => looksLikeToolPayload(item));
    }
    if (!value || typeof value !== 'object') {
        return false;
    }
    const obj = value as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (name && knownTools.has(name)) {
        return true;
    }
    // OpenAI-ish: { function: { name, arguments } }
    const fn = obj.function;
    if (fn && typeof fn === 'object') {
        const fnName = typeof (fn as { name?: unknown }).name === 'string'
            ? String((fn as { name: string }).name).trim()
            : '';
        if (fnName && knownTools.has(fnName)) {
            return true;
        }
    }
    return false;
}

function pushParsed(target: unknown[], raw: string): void {
    if (!raw) {
        return;
    }
    try {
        target.push(JSON.parse(raw));
    } catch {
        // ignore
    }
}

function fromLooseObject(value: unknown, index: number): ChatToolCall | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const obj = value as Record<string, unknown>;

    // OpenAI-ish: { type, function: { name, arguments } }
    if (obj.function && typeof obj.function === 'object') {
        const viaNative = toChatToolCall(
            {
                id: typeof obj.id === 'string' ? obj.id : undefined,
                type: typeof obj.type === 'string' ? obj.type : undefined,
                function: obj.function as { name?: string; arguments?: unknown }
            },
            index
        );
        if (viaNative) {
            return viaNative;
        }
    }

    const name = typeof obj.name === 'string' ? obj.name.trim() : '';
    if (!name || !knownTools.has(name)) {
        return null;
    }

    // Accept { name, arguments } or { name, parameters }
    const args = obj.arguments ?? obj.parameters ?? {};
    return {
        id: `call_recovered_${index}_${name}`,
        name: name as MotabixToolName,
        arguments: normalizeArguments(args)
    };
}

function normalizeArguments(args: unknown): string {
    if (typeof args === 'string') {
        return args.trim() || '{}';
    }
    try {
        return JSON.stringify(args ?? {});
    } catch {
        return '{}';
    }
}
