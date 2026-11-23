/** Normalize chat/webview code payloads for the editor (keep real < > in source). */
export function formatResponse(input: string): string {
    if (typeof input !== 'string') {
        return '';
    }
    // Only normalize break tags that may leak from HTML formatting — never strip <>.
    return input.replace(/<br\s*\/?>/gi, '\n');
}
