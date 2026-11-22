import * as vscode from 'vscode';
import { IWebviewCommand } from '../handlers/IWebviewCommand';

export type MotabixProviderKind = 'ollama' | 'motabix-router';
export type RunCommandPermission = 'ask' | 'allow';
export type PathScope = 'workspace' | 'unrestricted';

export interface MotabixAppSettings {
    provider: MotabixProviderKind;
    ollamaBaseURL: string;
    routerBaseURL: string;
    apiKey: string;
    runCommandPermission: RunCommandPermission;
    pathScope: PathScope;
    runCommandCwd: string;
}

const STORAGE_KEY = 'motabix.appSettings';
const API_KEY_SECRET = 'motabix.routerApiKey';

const DEFAULTS: MotabixAppSettings = {
    provider: 'ollama',
    ollamaBaseURL: 'http://127.0.0.1:11434',
    routerBaseURL: 'http://127.0.0.1:8787',
    apiKey: '',
    runCommandPermission: 'ask',
    pathScope: 'workspace',
    runCommandCwd: ''
};

export class MotabixSettingsService implements IWebviewCommand {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        if (message.command === 'getAppSettings') {
            await this.postSettings(webview);
            return;
        }

        if (message.command === 'saveAppSettings') {
            await this.saveFromMessage(webview, message);
        }
    }

    async getSettings(): Promise<MotabixAppSettings> {
        const stored = this.context.globalState.get<Partial<MotabixAppSettings>>(STORAGE_KEY, {});
        const apiKey = (await this.context.secrets.get(API_KEY_SECRET)) ?? '';
        return {
            provider: stored.provider === 'motabix-router' ? 'motabix-router' : DEFAULTS.provider,
            ollamaBaseURL: stored.ollamaBaseURL?.trim() || DEFAULTS.ollamaBaseURL,
            routerBaseURL: stored.routerBaseURL?.trim() || DEFAULTS.routerBaseURL,
            apiKey,
            runCommandPermission:
                stored.runCommandPermission === 'allow' ? 'allow' : DEFAULTS.runCommandPermission,
            pathScope: stored.pathScope === 'unrestricted' ? 'unrestricted' : DEFAULTS.pathScope,
            runCommandCwd: stored.runCommandCwd ?? DEFAULTS.runCommandCwd
        };
    }

    private async saveFromMessage(webview: vscode.WebviewView, message: any): Promise<void> {
        const provider: MotabixProviderKind =
            message.provider === 'motabix-router' ? 'motabix-router' : 'ollama';
        const apiKey = String(message.apiKey ?? '').trim();

        if (provider === 'motabix-router' && !apiKey) {
            webview.webview.postMessage({
                command: 'appSettingsSaved',
                ok: false,
                error: 'API Key is required when MotabixRouter is selected.'
            });
            return;
        }

        const settings: MotabixAppSettings = {
            provider,
            ollamaBaseURL: String(message.ollamaBaseURL ?? '').trim() || DEFAULTS.ollamaBaseURL,
            routerBaseURL: String(message.routerBaseURL ?? '').trim() || DEFAULTS.routerBaseURL,
            apiKey,
            runCommandPermission: message.runCommandPermission === 'allow' ? 'allow' : 'ask',
            pathScope: message.pathScope === 'unrestricted' ? 'unrestricted' : 'workspace',
            runCommandCwd: String(message.runCommandCwd ?? '').trim()
        };

        const { apiKey: keyToStore, ...publicSettings } = settings;
        await this.context.globalState.update(STORAGE_KEY, publicSettings);
        await this.context.secrets.store(API_KEY_SECRET, keyToStore);

        webview.webview.postMessage({
            command: 'appSettingsSaved',
            ok: true
        });
        await this.postSettings(webview);
    }

    async postSettings(webview: vscode.WebviewView): Promise<void> {
        const settings = await this.getSettings();
        webview.webview.postMessage({
            command: 'loadAppSettings',
            settings
        });
    }
}
