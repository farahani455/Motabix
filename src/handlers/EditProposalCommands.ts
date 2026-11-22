import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { EditProposalStore } from '../agent/EditProposalStore';

export class EditProposalCommands implements IWebviewCommand {
    constructor(private readonly proposalStore: EditProposalStore) {}

    async execute(webview: vscode.WebviewView, message: any): Promise<void> {
        const proposalId = String(message.proposalId ?? '');
        if (!proposalId) {
            return;
        }

        if (message.command === 'acceptEditProposal') {
            await this.accept(webview, proposalId);
            return;
        }

        if (message.command === 'rejectEditProposal') {
            await this.reject(webview, proposalId);
        }
    }

    private async accept(webview: vscode.WebviewView, proposalId: string): Promise<void> {
        const proposal = this.proposalStore.get(proposalId);
        if (!proposal) {
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'error',
                message: 'Proposal not found (it may have expired).'
            });
            return;
        }

        try {
            await vscode.workspace.fs.writeFile(
                proposal.targetUri,
                Buffer.from(proposal.after, 'utf8')
            );
            await this.closeProposalDiff(proposalId);
            this.proposalStore.remove(proposalId);

            console.log(`[Motabix][edit_file] accepted proposalId=${proposalId} path=${proposal.targetPath}`);
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'accepted',
                path: proposal.targetPath
            });
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'error',
                message: text
            });
        }
    }

    private async reject(webview: vscode.WebviewView, proposalId: string): Promise<void> {
        const proposal = this.proposalStore.get(proposalId);
        if (!proposal) {
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'error',
                message: 'Proposal not found (it may have expired).'
            });
            return;
        }

        await this.closeProposalDiff(proposalId);
        this.proposalStore.remove(proposalId);

        console.log(`[Motabix][edit_file] rejected proposalId=${proposalId} path=${proposal.targetPath}`);
        webview.webview.postMessage({
            command: 'editProposalResult',
            proposalId,
            status: 'rejected',
            path: proposal.targetPath
        });
    }

    private async closeProposalDiff(proposalId: string): Promise<void> {
        const tabsToClose: vscode.Tab[] = [];
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input;
                if (input instanceof vscode.TabInputTextDiff) {
                    const involvesProposal =
                        (input.original.scheme === EditProposalStore.scheme &&
                            input.original.path.includes(proposalId)) ||
                        (input.modified.scheme === EditProposalStore.scheme &&
                            input.modified.path.includes(proposalId));
                    if (involvesProposal) {
                        tabsToClose.push(tab);
                    }
                }
            }
        }
        for (const tab of tabsToClose) {
            await vscode.window.tabGroups.close(tab);
        }
    }
}
