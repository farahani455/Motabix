import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { ChatHistoryService } from '../services/ChatHistoryService';
import { SessionConfigService } from '../services/SessionConfigService';

export class ReadyCommand implements IWebviewCommand {
    constructor(
        private readonly chatHistoryService: ChatHistoryService,
        private readonly sessionConfigService: SessionConfigService
    ) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        if (message.command !== 'ready') {
            return;
        }

        const chatSession = this.chatHistoryService.getSession();
        webview.webview.postMessage({
            command: 'loadHistory',
            history: chatSession
        });

        const sessionConfig = this.sessionConfigService.getSessionConfig();
        webview.webview.postMessage({
            command: 'getSessionConfig',
            global: sessionConfig
        });
    }
}
