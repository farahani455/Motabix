import * as vscode from 'vscode';
import * as path from 'path';
import { PathScope } from '../services/MotabixSettingsService';

export function getWorkspaceRoot(): vscode.Uri | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri;
}

/** Resolve user path to a file URI (absolute or workspace-relative). */
export function resolveToolPath(userPath: string): vscode.Uri {
    const trimmed = userPath.trim();
    if (!trimmed) {
        throw new Error('path is required');
    }

    if (path.isAbsolute(trimmed)) {
        return vscode.Uri.file(path.normalize(trimmed));
    }

    const root = getWorkspaceRoot();
    if (!root) {
        throw new Error('No workspace folder is open.');
    }
    // path.resolve collapses .. so workspace/../outside is detected correctly.
    const resolved = path.resolve(root.fsPath, trimmed);
    return vscode.Uri.file(resolved);
}

export function getWorkspaceRootPaths(): string[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => folder.uri.fsPath);
}

export function isUriInsideWorkspace(uri: vscode.Uri): boolean {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const target = normalizeFsPath(uri.fsPath);
    return folders.some((folder) => {
        const root = normalizeFsPath(folder.uri.fsPath);
        return target === root || target.startsWith(root + path.sep);
    });
}

export function assertPathAllowed(uri: vscode.Uri, pathScope: PathScope): void {
    const roots = getWorkspaceRootPaths();

    if (pathScope === 'unrestricted') {
        console.log(
            `[Motabix][pathGuard] allow unrestricted path=${uri.fsPath} roots=${JSON.stringify(roots)}`
        );
        return;
    }

    // pathScope === 'workspace' (MVP default)
    const allowed = isUriInsideWorkspace(uri);
    console.log(
        `[Motabix][pathGuard] scope=workspace allowed=${allowed} ` +
            `path=${uri.fsPath} roots=${JSON.stringify(roots)}`
    );

    if (!allowed) {
        const err = new Error(
            `Path is outside the allowed Settings scope (workspace only). ` +
                `pathScope=${pathScope}, path=${uri.fsPath}, workspaceRoots=${roots.join(' | ') || '(none)'}`
        );
        (err as Error & { code?: string }).code = 'PATH_OUT_OF_SCOPE';
        throw err;
    }
}

function normalizeFsPath(fsPath: string): string {
    const normalized = path.normalize(fsPath);
    // Windows paths are case-insensitive for containment checks.
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}
