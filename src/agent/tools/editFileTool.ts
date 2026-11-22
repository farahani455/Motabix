import * as vscode from 'vscode';
import { MotabixAppSettings } from '../../services/MotabixSettingsService';
import { assertPathAllowed, resolveToolPath } from '../pathGuard';
import { EditProposalStore } from '../EditProposalStore';

export async function executeEditFile(
    args: { path?: string; content?: string },
    settings: MotabixAppSettings,
    proposalStore: EditProposalStore
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
        const proposal = proposalStore.create({
            targetUri,
            before,
            after,
            isNewFile
        });

        const leftUri = isNewFile
            ? proposalStore.beforeUri(proposal.id)
            : targetUri;
        const rightUri = proposalStore.afterUri(proposal.id);

        await vscode.commands.executeCommand(
            'vscode.diff',
            leftUri,
            rightUri,
            proposalStore.titleFor(proposal),
            { preview: true }
        );

        console.log(
            `[Motabix][edit_file] opened diff proposalId=${proposal.id} path=${targetUri.fsPath} new=${isNewFile}`
        );

        return JSON.stringify({
            ok: true,
            tool: 'edit_file',
            proposalId: proposal.id,
            path: targetUri.fsPath,
            pathScope: settings.pathScope,
            isNewFile,
            written: false,
            message:
                'Diff opened (left=before, right=proposal). Accept in chat to write the file; Reject to discard.'
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
