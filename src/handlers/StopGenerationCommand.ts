import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { AgentRunLock } from '../services/AgentRunLock';

/** Signals abort; SendMessageCommand releases the lock when the loop exits. */
export class StopGenerationCommand implements IWebviewCommand {
    constructor(private readonly agentRunLock: AgentRunLock) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        if (message.command !== 'stopGeneration') {
            return;
        }

        const requestId = message.requestId ?? this.agentRunLock.getActiveRequestId();
        this.agentRunLock.requestStop();

        webview.webview.postMessage({
            command: 'generationStopped',
            requestId: requestId ?? null
        });
    }
}
