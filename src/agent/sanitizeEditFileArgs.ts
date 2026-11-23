import * as path from 'path';

export type EditFileArgs = {
    path?: string;
    content?: string;
};

/**
 * qwen / local models often pass nested tool JSON as edit_file content, e.g.
 * content = '{"name":"edit_file","arguments":{"path":"app.js","content":"..."}}'
 * or a mangled multi-folder path. Unwrap and normalize before writing.
 */
export function sanitizeEditFileArgs(input: {
    path?: string;
    content?: string;
    raw?: unknown;
}): EditFileArgs {
    let filePath = typeof input.path === 'string' ? input.path.trim() : undefined;
    let content = typeof input.content === 'string' ? input.content : undefined;

    if ((!filePath || content === undefined) && typeof input.raw === 'string') {
        const fromRaw = unwrapEditPayload(input.raw);
        if (fromRaw) {
            filePath = filePath || fromRaw.path;
            if (content === undefined) {
                content = fromRaw.content;
            }
        }
    }

    // Unwrap nested tool-call JSON stuffed into content (a few times max).
    for (let i = 0; i < 4; i++) {
        if (typeof content !== 'string') {
            break;
        }
        const nested = unwrapEditPayload(content);
        if (!nested || nested.content === undefined) {
            break;
        }
        // Stop if unwrap didn't change anything meaningful.
        if (nested.content === content && (!nested.path || nested.path === filePath)) {
            break;
        }
        filePath = nested.path || filePath;
        content = nested.content;
    }

    // Prefix junk: tool JSON then real source after the first complete object.
    if (typeof content === 'string' && looksLikeEditToolJson(content)) {
        const stripped = stripLeadingToolJson(content);
        if (stripped !== null) {
            const nested = unwrapEditPayload(content.slice(0, content.length - stripped.length).trim() || content);
            if (nested?.path) {
                filePath = nested.path || filePath;
            }
            if (nested?.content && !looksLikeEditToolJson(nested.content)) {
                content = nested.content;
            } else if (stripped.trim() && !looksLikeEditToolJson(stripped)) {
                content = stripped;
            }
        }
    }

    filePath = normalizeEditPath(filePath);

    return {
        path: filePath,
        content: typeof content === 'string' ? content : undefined
    };
}

/** Refuse writing if content is still clearly a Motabix tool payload. */
export function isToolJsonMasqueradingAsCode(content: string): boolean {
    const trimmed = content.trim();
    if (!looksLikeEditToolJson(trimmed)) {
        return false;
    }
    // If after unwrap we still only have tool JSON, block.
    const unwrapped = unwrapEditPayload(trimmed);
    if (!unwrapped?.content) {
        return true;
    }
    return looksLikeEditToolJson(unwrapped.content);
}

function looksLikeEditToolJson(text: string): boolean {
    const t = text.trim();
    return (
        t.startsWith('{') &&
        /"name"\s*:\s*"edit_file"/.test(t) &&
        /"arguments"|"parameters"|"path"/.test(t)
    );
}

function unwrapEditPayload(text: string): EditFileArgs | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) {
        return null;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        // Truncated JSON — try to recover "content":"..." with a crude extract.
        return extractFieldsFromBrokenJson(trimmed);
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }

    const obj = parsed as Record<string, unknown>;

    if (obj.name === 'edit_file') {
        let inner: unknown = obj.arguments ?? obj.parameters ?? {};
        if (typeof inner === 'string') {
            const innerText = inner;
            try {
                inner = JSON.parse(innerText);
            } catch {
                return extractFieldsFromBrokenJson(innerText);
            }
        }
        if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
            const args = inner as Record<string, unknown>;
            return {
                path: typeof args.path === 'string' ? args.path : undefined,
                content: typeof args.content === 'string' ? args.content : undefined
            };
        }
        return null;
    }

    if (typeof obj.path === 'string' && typeof obj.content === 'string') {
        return { path: obj.path, content: obj.content };
    }

    return null;
}

function extractFieldsFromBrokenJson(text: string): EditFileArgs | null {
    const pathMatch = text.match(/"path"\s*:\s*"((?:\\.|[^"\\])*)"/);
    const contentMatch = text.match(/"content"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (!pathMatch && !contentMatch) {
        return null;
    }
    return {
        path: pathMatch ? unescapeJsonString(pathMatch[1]) : undefined,
        content: contentMatch ? unescapeJsonString(contentMatch[1]) : undefined
    };
}

function unescapeJsonString(value: string): string {
    try {
        return JSON.parse(`"${value}"`);
    } catch {
        return value
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }
}

function stripLeadingToolJson(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) {
        return null;
    }
    const end = findMatchingBrace(trimmed);
    if (end < 0 || end >= trimmed.length - 1) {
        return null;
    }
    const rest = trimmed.slice(end + 1).replace(/^\s+/, '');
    return rest.length > 0 ? rest : null;
}

function findMatchingBrace(text: string): number {
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

/**
 * Models invent paths like Work\Motabix.ir\Playground\...\app.js.
 * Prefer a simple workspace-relative file name when the path is clearly mangled.
 */
function normalizeEditPath(filePath: string | undefined): string | undefined {
    if (!filePath) {
        return filePath;
    }
    const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
    const base = path.posix.basename(normalized);
    const mangled =
        /Motabix\.ir/i.test(normalized) ||
        /^Work\//i.test(normalized) ||
        normalized.split('/').length > 3;

    if (mangled && /^[A-Za-z0-9_.-]+\.[A-Za-z0-9]+$/.test(base)) {
        console.log(
            `[Motabix][edit_file] normalizing mangled path ${JSON.stringify(filePath)} → ${JSON.stringify(base)}`
        );
        return base;
    }
    return filePath;
}
