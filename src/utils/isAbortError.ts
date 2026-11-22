export function isAbortError(error: unknown): boolean {
    if (!error) {
        return false;
    }
    if (error instanceof Error) {
        const name = error.name.toLowerCase();
        const message = error.message.toLowerCase();
        return (
            name === 'aborterror' ||
            message.includes('stopped by user') ||
            message.includes('aborted') ||
            message.includes('abort')
        );
    }
    return false;
}
