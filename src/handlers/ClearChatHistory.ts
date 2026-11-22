import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { IChatHistoryService } from '../services/IChatHistoryService';

export class ClearChatHistory implements IWebviewCommand {
    constructor(private readonly chatHisoryService: IChatHistoryService) {}

    async execute(_webview: vscode.WebviewView, _message: any): Promise<void> {
        await this.chatHisoryService.clearSession();
    }
}