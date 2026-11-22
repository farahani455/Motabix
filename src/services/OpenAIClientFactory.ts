import OpenAI from 'openai';
import { MotabixAppSettings, MotabixSettingsService } from './MotabixSettingsService';

function normalizeOllamaRoot(baseURL: string): string {
    return baseURL.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function normalizeRouterBase(baseURL: string): string {
    const trimmed = baseURL.trim().replace(/\/+$/, '');
    return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export class OpenAIClientFactory {
    constructor(private readonly settingsService: MotabixSettingsService) {}

    async getClient(): Promise<OpenAI> {
        const settings = await this.settingsService.getSettings();
        return this.createClient(settings);
    }

    createClient(settings: MotabixAppSettings): OpenAI {
        if (settings.provider === 'motabix-router') {
            return new OpenAI({
                apiKey: settings.apiKey.trim() || 'missing-key',
                baseURL: normalizeRouterBase(settings.routerBaseURL || 'http://127.0.0.1:8787')
            });
        }

        const root = normalizeOllamaRoot(settings.ollamaBaseURL || 'http://127.0.0.1:11434');
        return new OpenAI({
            apiKey: 'ollama',
            baseURL: `${root}/v1`
        });
    }
}
