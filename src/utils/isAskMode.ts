/** Normalize UI / session agent labels to canonical Motabix modes. */
export function normalizeAgentMode(agent: string | undefined | null): string {
    const raw = String(agent ?? '').trim();
    const lower = raw.toLowerCase().replace(/\s+/g, ' ');

    if (
        lower === 'edit automatically' ||
        lower === 'edit auto' ||
        lower === 'editor automatically' ||
        lower === 'auto'
    ) {
        return 'Edit Automatically';
    }
    if (lower === 'edit' || lower === 'editor') {
        return 'Edit';
    }
    if (!lower || lower === 'ask') {
        return 'Ask';
    }
    return raw;
}

export function isEditAutomatically(agent: string | undefined | null): boolean {
    return normalizeAgentMode(agent) === 'Edit Automatically';
}

/** Manual Edit: between-step continue prompts (T9-1). */
export function isEditMode(agent: string | undefined | null): boolean {
    return normalizeAgentMode(agent) === 'Edit';
}

/** Modes that may run the agent tool loop (T5+). */
export function isAgentMode(agent: string | undefined | null): boolean {
    const mode = normalizeAgentMode(agent);
    return mode === 'Edit' || mode === 'Edit Automatically';
}

/** Ask (and any unknown mode) is chat-only: no tools, no agent loop. */
export function isAskMode(agent: string | undefined | null): boolean {
    return !isAgentMode(agent);
}
