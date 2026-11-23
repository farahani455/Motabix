import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { EditProposalStore } from '../agent/EditProposalStore';
import { openProposalDiff, writeProposalToDisk } from '../agent/tools/editFileTool';

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
            return;
        }

        if (message.command === 'openEditProposalDiff') {
            await this.openDiff(webview, proposalId);
        }
    }

    private async openDiff(webview: vscode.WebviewView, proposalId: string): Promise<void> {
        const proposal = this.proposalStore.get(proposalId);
        if (!proposal) {
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'error',
                message: 'Diff not available (proposal expired).'
            });
            return;
        }

        try {
            await openProposalDiff(this.proposalStore, proposal);
            console.log(
                `[Motabix][edit_file] reopened diff proposalId=${proposalId} path=${proposal.targetPath}`
            );
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            console.log(`[Motabix][edit_file] reopen diff failed proposalId=${proposalId}: ${text}`);
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'error',
                message: text
            });
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
            await writeProposalToDisk(proposal);
            await this.closeProposalDiff(proposalId);
            this.proposalStore.remove(proposalId);

            console.log(`[Motabix][edit_file] accepted proposalId=${proposalId} path=${proposal.targetPath}`);
            webview.webview.postMessage({
                command: 'editProposalResult',
                proposalId,
                status: 'accepted',
                path: proposal.targetPath
            });

            // Show the real file so Accept is visibly applied (not only Diff virtual docs).
            try {
                await vscode.window.showTextDocument(proposal.targetUri, {
                    preview: true,
                    preserveFocus: true
                });
            } catch {
                // File may still be opening; write already succeeded.
            }
        } catch (error) {
            const text = error instanceof Error ? error.message : String(error);
            console.log(`[Motabix][edit_file] accept failed proposalId=${proposalId}: ${text}`);
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
