export function formatProviderError(error: unknown, model?: string): string {
    const raw = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    const lower = raw.toLowerCase();
    const modelLabel = model?.trim() ? `Model: ${model.trim()}` : 'No model selected';

    if (!model?.trim()) {
        return 'No model selected. Choose a model from the chat dropdown, then try again.';
    }

    if (
        lower.includes('econnrefused') ||
        lower.includes('fetch failed') ||
        lower.includes('network') ||
        lower.includes('enotfound') ||
        lower.includes('connect')
    ) {
        return (
            `Could not reach the provider.\n` +
            `${modelLabel}\n` +
            `Check Ollama/MotabixRouter address in Settings and that the service is running.\n` +
            `Details: ${raw}`
        );
    }

    if (
        lower.includes('model') &&
        (lower.includes('not found') || lower.includes('does not exist') || lower.includes('404'))
    ) {
        return (
            `Model is not available on the provider.\n` +
            `${modelLabel}\n` +
            `Pull/install the model or pick another from the list.\n` +
            `Details: ${raw}`
        );
    }

    if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('api key')) {
        return (
            `Authentication failed.\n` +
            `${modelLabel}\n` +
            `For MotabixRouter, check the API Key in Settings.\n` +
            `Details: ${raw}`
        );
    }

    if (lower.includes('timeout') || lower.includes('timed out') || lower.includes('abort')) {
        return (
            `Request timed out.\n` +
            `${modelLabel}\n` +
            `The model may be loading or overloaded. Try again.\n` +
            `Details: ${raw}`
        );
    }

    return `Provider request failed.\n${modelLabel}\nDetails: ${raw}`;
}
