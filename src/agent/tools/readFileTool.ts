import * as vscode from 'vscode';
import { MotabixAppSettings } from '../../services/MotabixSettingsService';
import { assertPathAllowed, getWorkspaceRootPaths, resolveToolPath } from '../pathGuard';

const MAX_CHARS = 200_000;

export async function executeReadFile(
    args: { path?: string },
    settings: MotabixAppSettings
): Promise<string> {
    const userPath = String(args.path ?? '').trim();
    if (!userPath) {
        return JSON.stringify({
            ok: false,
            tool: 'read_file',
            error: 'Missing required argument: path'
        });
    }

    try {
        const uri = resolveToolPath(userPath);
        assertPathAllowed(uri, settings.pathScope);

        const bytes = await vscode.workspace.fs.readFile(uri);
        let content = Buffer.from(bytes).toString('utf8');
        let truncated = false;
        if (content.length > MAX_CHARS) {
            content = content.slice(0, MAX_CHARS);
            truncated = true;
        }

        return JSON.stringify({
            ok: true,
            tool: 'read_file',
            path: uri.fsPath,
            pathScope: settings.pathScope,
            workspaceRoots: getWorkspaceRootPaths(),
            truncated,
            content
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const code =
            error && typeof error === 'object' && 'code' in error
                ? String((error as { code?: string }).code ?? '')
                : '';

        if (code === 'PATH_OUT_OF_SCOPE') {
            console.log(`[Motabix][read_file] rejected out-of-scope path: ${userPath}`);
        } else {
            console.log(`[Motabix][read_file] error: ${message}`);
        }

        return JSON.stringify({
            ok: false,
            tool: 'read_file',
            path: userPath,
            pathScope: settings.pathScope,
            workspaceRoots: getWorkspaceRootPaths(),
            code: code || undefined,
            error: message
        });
    }
}
