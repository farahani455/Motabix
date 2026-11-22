/** Modes that may run the agent tool loop (T5+). */
export function isAgentMode(agent: string | undefined | null): boolean {
    return agent === 'Edit' || agent === 'Edit Automatically';
}

/** Ask (and any unknown mode) is chat-only: no tools, no agent loop. */
export function isAskMode(agent: string | undefined | null): boolean {
    return !isAgentMode(agent);
}
