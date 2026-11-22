import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { MotabixSettingsService } from '../services/MotabixSettingsService';

export class OpenSettingsCommand implements IWebviewCommand {
    constructor(private readonly settingsService: MotabixSettingsService) {}

    async execute(webview: vscode.WebviewView): Promise<void> {
        webview.webview.postMessage({ command: 'showSettings' });
        await this.settingsService.postSettings(webview);
    }
}
