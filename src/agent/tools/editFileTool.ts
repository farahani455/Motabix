import * as path from 'path';
import * as vscode from 'vscode';
import { MotabixAppSettings } from '../../services/MotabixSettingsService';
import { assertPathAllowed, resolveToolPath } from '../pathGuard';
import { EditProposal, EditProposalStore } from '../EditProposalStore';
import { isToolJsonMasqueradingAsCode } from '../sanitizeEditFileArgs';

export type EditFileOptions = {
    /** Edit Automatically: write immediately; Diff opens only from the chat item. */
    autoApply?: boolean;
};

/** Write proposal content to disk and sync any open editor buffer for that file. */
export async function writeProposalToDisk(proposal: EditProposal): Promise<void> {
    const parent = vscode.Uri.file(path.dirname(proposal.targetUri.fsPath));
    try {
        await vscode.workspace.fs.createDirectory(parent);
    } catch {
        // Parent may already exist.
    }

    const openDoc = vscode.workspace.textDocuments.find(
        (doc) =>
            doc.uri.scheme === proposal.targetUri.scheme &&
            path.normalize(doc.uri.fsPath).toLowerCase() ===
                path.normalize(proposal.targetUri.fsPath).toLowerCase()
    );

    if (openDoc && !openDoc.isClosed) {
        const fullRange = new vscode.Range(
            openDoc.positionAt(0),
            openDoc.positionAt(openDoc.getText().length)
        );
        const edit = new vscode.WorkspaceEdit();
        edit.replace(openDoc.uri, fullRange, proposal.after);
        const applied = await vscode.workspace.applyEdit(edit);
        if (!applied) {
            throw new Error('Failed to apply edit to the open editor.');
        }
        await openDoc.save();
        return;
    }

    await vscode.workspace.fs.writeFile(
        proposal.targetUri,
        new Uint8Array(Buffer.from(proposal.after, 'utf8'))
    );
}

export async function executeEditFile(
    args: { path?: string; content?: string },
    settings: MotabixAppSettings,
    proposalStore: EditProposalStore,
    options: EditFileOptions = {}
): Promise<string> {
    const userPath = String(args.path ?? '').trim();
    if (!userPath) {
        return JSON.stringify({
            ok: false,
            tool: 'edit_file',
            error: 'Missing required argument: path'
        });
    }
    if (typeof args.content !== 'string') {
        return JSON.stringify({
            ok: false,
            tool: 'edit_file',
            error: 'Missing required argument: content'
        });
    }

    if (isToolJsonMasqueradingAsCode(args.content)) {
        console.log('[Motabix][edit_file] refused: content is tool-call JSON, not source');
        return JSON.stringify({
            ok: false,
            tool: 'edit_file',
            error:
                'edit_file content looked like a raw tool-call JSON payload, not file source. ' +
                'Call edit_file again with only the real file text in content.'
        });
    }

    const autoApply = !!options.autoApply;

    try {
        const targetUri = resolveToolPath(userPath);
        assertPathAllowed(targetUri, settings.pathScope);

        let before = '';
        let isNewFile = false;
        try {
            const bytes = await vscode.workspace.fs.readFile(targetUri);
            before = Buffer.from(bytes).toString('utf8');
        } catch {
            isNewFile = true;
            before = '';
        }

        const after = args.content;
        const shrinkBlocked = !isNewFile && isDestructiveShrink(before, after);
        // Never auto-wipe a large file with a tiny fragment — fall back to Diff + Accept.
        const willAutoApply = autoApply && !shrinkBlocked;

        const proposal = proposalStore.create({
            targetUri,
            before,
            after,
            isNewFile
        });

        if (shrinkBlocked) {
            console.log(
                `[Motabix][edit_file] blocked destructive shrink ` +
                    `before=${before.length} after=${after.length} path=${targetUri.fsPath}`
            );
        }

        if (willAutoApply) {
            await writeProposalToDisk(proposal);
            console.log(
                `[Motabix][edit_file] auto-applied proposalId=${proposal.id} path=${targetUri.fsPath} new=${isNewFile}`
            );
            // T9-3 / T7: Auto writes immediately; Diff opens only from the chat item.
        } else {
            // Edit (or Auto shrink-blocked): open Diff so the user can Accept/Reject.
            await openProposalDiff(proposalStore, proposal);
            console.log(
                `[Motabix][edit_file] opened diff proposalId=${proposal.id} path=${targetUri.fsPath} ` +
                    `shrinkBlocked=${shrinkBlocked}`
            );
        }

        return JSON.stringify({
            ok: true,
            tool: 'edit_file',
            proposalId: proposal.id,
            path: targetUri.fsPath,
            pathScope: settings.pathScope,
            isNewFile,
            written: willAutoApply,
            autoApplied: willAutoApply,
            shrinkBlocked,
            message: willAutoApply
                ? 'File written. Click the chat item to open Diff (before|after).'
                : shrinkBlocked
                  ? 'Refused to auto-overwrite: new content is much smaller than the existing file. Diff opened — Accept only if you really want this.'
                  : 'Diff opened (left=before, right=proposal). Accept in chat to write the file; Reject to discard.'
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code =
            error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: string }).code ?? '')
                : '';
        console.log(`[Motabix][edit_file] error: ${message}`);
        return JSON.stringify({
            ok: false,
            tool: 'edit_file',
            path: userPath,
            pathScope: settings.pathScope,
            code: code || undefined,
            error: message
        });
    }
}

/** True when "after" looks like a fragment that would wipe most of an existing file. */
export function isDestructiveShrink(before: string, after: string): boolean {
    if (!before || before.length < 80) {
        return false;
    }
    const afterLen = after?.length ?? 0;
    const lost = before.length - afterLen;
    return afterLen < before.length * 0.5 && lost >= 100;
}

/** Open vscode.diff for a stored proposal (always virtual before | after). */
export async function openProposalDiff(
    proposalStore: EditProposalStore,
    proposal: EditProposal
): Promise<void> {
    // Both sides from the content provider — works after auto-apply and with dirty editors.
    const leftUri = proposalStore.beforeUri(proposal.id);
    const rightUri = proposalStore.afterUri(proposal.id);

    await vscode.commands.executeCommand(
        'vscode.diff',
        leftUri,
        rightUri,
        proposalStore.titleFor(proposal),
        { preview: false }
    );
}
