import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { StepContinueService } from '../agent/StepContinueService';

export class StepContinueCommands implements IWebviewCommand {
    constructor(private readonly continues: StepContinueService) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        const continueId = String(message.continueId ?? '');
        if (!continueId) {
            return;
        }

        if (message.command === 'continueAgentStep') {
            const ok = this.continues.decide(continueId, true);
            webview.webview.postMessage({
                command: 'stepContinueResult',
                continueId,
                status: ok ? 'continued' : 'error',
                message: ok ? undefined : 'Prompt expired.'
            });
            return;
        }

        if (message.command === 'stopAgentStep') {
            const ok = this.continues.decide(continueId, false);
            webview.webview.postMessage({
                command: 'stepContinueResult',
                continueId,
                status: ok ? 'stopped' : 'error',
                message: ok ? undefined : 'Prompt expired.'
            });
        }
    }
}
