import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { RunCommandApprovalService } from '../agent/RunCommandApprovalService';

export class RunCommandApprovalCommands implements IWebviewCommand {
    constructor(private readonly approvals: RunCommandApprovalService) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        const approvalId = String(message.approvalId ?? '');
        if (!approvalId) {
            return;
        }

        if (message.command === 'allowRunCommand') {
            const ok = this.approvals.decide(approvalId, true);
            webview.webview.postMessage({
                command: 'runCommandApprovalResult',
                approvalId,
                status: ok ? 'allowed' : 'error',
                message: ok ? undefined : 'Approval expired.'
            });
            return;
        }

        if (message.command === 'denyRunCommand') {
            const ok = this.approvals.decide(approvalId, false);
            webview.webview.postMessage({
                command: 'runCommandApprovalResult',
                approvalId,
                status: ok ? 'denied' : 'error',
                message: ok ? undefined : 'Approval expired.'
            });
        }
    }
}
