import * as vscode from 'vscode';
import { IWebviewCommand } from '../handlers/IWebviewCommand';
import { MotabixProviderKind, MotabixSettingsService } from './MotabixSettingsService';

function normalizeOllamaRoot(baseURL: string): string {
    return baseURL.trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
}

function normalizeRouterBase(baseURL: string): string {
    const trimmed = baseURL.trim().replace(/\/+$/, '');
    return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed}/v1`;
}

export class ProviderConnectionService implements IWebviewCommand {
    constructor(private readonly settingsService: MotabixSettingsService) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        if (message.command === 'listModels') {
            await this.listModels(webview);
            return;
        }

        if (message.command !== 'testConnection') {
            return;
        }

        const provider: MotabixProviderKind =
            message.provider === 'motabix-router' ? 'motabix-router' : 'ollama';

        try {
            if (provider === 'ollama') {
                const result = await this.fetchOllamaModels(String(message.ollamaBaseURL ?? ''));
                webview.webview.postMessage({
                    command: 'connectionTestResult',
                    ok: true,
                    provider,
                    message: `Connected. ${result.length} model(s) found.`,
                    models: result
                });
                return;
            }

            const models = await this.fetchRouterModels(
                String(message.routerBaseURL ?? ''),
                String(message.apiKey ?? '')
            );
            webview.webview.postMessage({
                command: 'connectionTestResult',
                ok: true,
                provider,
                message: `Connected. ${models.length} model(s) found.`,
                models
            });
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            webview.webview.postMessage({
                command: 'connectionTestResult',
                ok: false,
                provider,
                message: text,
                models: []
            });
        }
    }

    private async listModels(webview: vscode.WebviewView): Promise<void> {
        const settings = await this.settingsService.getSettings();
        try {
            const models =
                settings.provider === 'motabix-router'
                    ? await this.fetchRouterModels(settings.routerBaseURL, settings.apiKey)
                    : await this.fetchOllamaModels(settings.ollamaBaseURL);

            webview.webview.postMessage({
                command: 'providerModels',
                ok: true,
                provider: settings.provider,
                models
            });
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            webview.webview.postMessage({
                command: 'providerModels',
                ok: false,
                provider: settings.provider,
                models: [],
                message: text
            });
        }
    }

    private async fetchOllamaModels(ollamaBaseURL: string): Promise<string[]> {
        const root = normalizeOllamaRoot(ollamaBaseURL || 'http://127.0.0.1:11434');
        const response = await fetch(`${root}/api/tags`, {
            method: 'GET'
        });

        if (!response.ok) {
            throw new Error(`Ollama responded with HTTP ${response.status}`);
        }

        const data = (await response.json()) as { models?: Array<{ name?: string }> };
        return (data.models ?? [])
            .map((m) => m.name?.trim() ?? '')
            .filter(Boolean);
    }

    private async fetchRouterModels(routerBaseURL: string, apiKey: string): Promise<string[]> {
        if (!apiKey.trim()) {
            throw new Error('API Key is required for MotabixRouter.');
        }

        const base = normalizeRouterBase(routerBaseURL || 'http://127.0.0.1:8787');
        const response = await fetch(`${base}/models`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey.trim()}`
            }
        });

        if (!response.ok) {
            throw new Error(`MotabixRouter responded with HTTP ${response.status}`);
        }

        const data = (await response.json()) as { data?: Array<{ id?: string }> };
        return (data.data ?? [])
            .map((m) => m.id?.trim() ?? '')
            .filter(Boolean);
    }
}
