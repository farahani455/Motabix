export function formatResponse(input: string): string {
    // Sanitize input to prevent injection attacks
    const sanitizedInput = input.replace(/[<>]/g, '');
    return sanitizedInput.replace(/<br>/ig, '\n');
}
