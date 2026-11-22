import * as vscode from 'vscode';
import * as path from 'path';

export type EditProposal = {
    id: string;
    targetPath: string;
    targetUri: vscode.Uri;
    before: string;
    after: string;
    isNewFile: boolean;
};

/** In-memory Motabix edit proposals for vscode.diff (Accept/Reject lands later). */
export class EditProposalStore {
    static readonly scheme = 'motabix-diff';

    private readonly proposals = new Map<string, EditProposal>();
    private readonly _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    readonly onDidChange = this._onDidChange.event;

    create(input: {
        targetUri: vscode.Uri;
        before: string;
        after: string;
        isNewFile: boolean;
    }): EditProposal {
        const id = `edit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const proposal: EditProposal = {
            id,
            targetPath: input.targetUri.fsPath,
            targetUri: input.targetUri,
            before: input.before,
            after: input.after,
            isNewFile: input.isNewFile
        };
        this.proposals.set(id, proposal);
        this._onDidChange.fire(this.beforeUri(id));
        this._onDidChange.fire(this.afterUri(id));
        return proposal;
    }

    get(id: string): EditProposal | undefined {
        return this.proposals.get(id);
    }

    remove(id: string): void {
        this.proposals.delete(id);
    }

    beforeUri(id: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: EditProposalStore.scheme,
            path: `/${id}/before`,
            query: `side=before`
        });
    }

    afterUri(id: string): vscode.Uri {
        return vscode.Uri.from({
            scheme: EditProposalStore.scheme,
            path: `/${id}/after`,
            query: `side=after`
        });
    }

    contentFor(uri: vscode.Uri): string {
        const id = uri.path.split('/').filter(Boolean)[0];
        const proposal = id ? this.proposals.get(id) : undefined;
        if (!proposal) {
            return '';
        }
        const side = new URLSearchParams(uri.query).get('side');
        return side === 'after' ? proposal.after : proposal.before;
    }

    titleFor(proposal: EditProposal): string {
        const name = path.basename(proposal.targetPath);
        return `${name} (Motabix proposal)`;
    }
}

export class EditProposalContentProvider implements vscode.TextDocumentContentProvider {
    constructor(private readonly store: EditProposalStore) {}

    get onDidChange(): vscode.Event<vscode.Uri> {
        return this.store.onDidChange;
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.store.contentFor(uri);
    }
}
