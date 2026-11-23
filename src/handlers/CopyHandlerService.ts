import * as vscode from 'vscode';
import { IWebviewCommand } from '../handlers/IWebviewCommand';
import { formatResponse } from '../utils/formatResponse';

export class CopyHandlerService implements IWebviewCommand {
    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        const messageCode = formatResponse(String(message.code ?? ''));
        await vscode.env.clipboard.writeText(messageCode);
        vscode.window.showInformationMessage('Code copied to clipboard!');
    }
}
