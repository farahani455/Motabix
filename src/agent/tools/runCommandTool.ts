import * as fs from 'fs';
import * as path from 'path';
import { ChildProcess, execFile } from 'child_process';
import { MotabixAppSettings } from '../../services/MotabixSettingsService';
import { getWorkspaceRoot } from '../pathGuard';
import { RunCommandApprovalService } from '../RunCommandApprovalService';
import { RUN_COMMAND_OUTPUT_TAIL } from '../motabixTools';

/** Capture buffer for the process; model still only sees RUN_COMMAND_OUTPUT_TAIL. */
const PROCESS_MAX_BUFFER = 1_000_000;

export type RunCommandExecOptions = {
    approvals?: RunCommandApprovalService;
    signal?: AbortSignal;
};

/**
 * T8-1 cwd + T8-2 ask + T8-3 allow + T8-4 last-2000 output + T8-5 Stop kills the process.
 */
export async function executeRunCommand(
    args: { command?: string },
    settings: MotabixAppSettings,
    options: RunCommandExecOptions = {}
): Promise<string> {
    const command = String(args.command ?? '').trim();
    if (!command) {
        return JSON.stringify({
            ok: false,
            tool: 'run_command',
            error: 'Missing required argument: command'
        });
    }

    if (options.signal?.aborted) {
        return stoppedResult(command, undefined, settings.runCommandCwd);
    }

    let cwd: string;
    try {
        cwd = resolveRunCommandCwd(settings.runCommandCwd);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return JSON.stringify({
            ok: false,
            tool: 'run_command',
            error: message,
            runCommandCwdSetting: settings.runCommandCwd || '(empty → workspace root)'
        });
    }

    const permission = normalizeRunCommandPermission(settings.runCommandPermission);
    const cwdSetting = settings.runCommandCwd || '(empty → workspace root)';

    // T8-3: "Without approval" → run immediately, never show Allow/Deny.
    if (permission === 'allow') {
        console.log(
            `[Motabix][run_command] permission=allow — skipping chat approval ` +
                `cwd=${cwd} command=${JSON.stringify(command)}`
        );
    } else {
        // T8-2: "With approval" → wait for chat Allow/Deny (Stop aborts the wait).
        const allowed = options.approvals
            ? await options.approvals.request(command, cwd, options.signal)
            : false;
        if (!allowed) {
            if (options.signal?.aborted) {
                return stoppedResult(command, cwd, cwdSetting, permission);
            }
            console.log(
                `[Motabix][run_command] denied by user cwd=${cwd} command=${JSON.stringify(command)}`
            );
            return JSON.stringify({
                ok: false,
                tool: 'run_command',
                command,
                cwd,
                runCommandCwdSetting: cwdSetting,
                permission,
                approvalRequired: true,
                denied: true,
                error: 'User denied run_command'
            });
        }
    }

    if (options.signal?.aborted) {
        return stoppedResult(command, cwd, cwdSetting, permission);
    }

    console.log(
        `[Motabix][run_command] executing cwd=${cwd} permission=${permission} ` +
            `setting=${JSON.stringify(settings.runCommandCwd || '')} ` +
            `command=${JSON.stringify(command)}`
    );

    try {
        const { stdout, stderr } = await execFileAbortable(
            getShell(),
            getShellArgs(command),
            {
                cwd,
                windowsHide: true,
                maxBuffer: PROCESS_MAX_BUFFER,
                encoding: 'utf8',
                signal: options.signal
            }
        );

        const combined = joinOutput(stdout, stderr);
        const tailed = tailOutputForModel(combined);
        console.log(
            `[Motabix][run_command] ok cwd=${cwd} rawLength=${tailed.rawLength} ` +
                `truncated=${tailed.truncated} returned=${tailed.output.length}`
        );

        return JSON.stringify({
            ok: true,
            tool: 'run_command',
            command,
            cwd,
            runCommandCwdSetting: cwdSetting,
            permission,
            approvalRequired: permission === 'ask',
            exitCode: 0,
            truncated: tailed.truncated,
            outputTailChars: RUN_COMMAND_OUTPUT_TAIL,
            rawLength: tailed.rawLength,
            output: tailed.output
        });
    } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) {
            console.log(
                `[Motabix][run_command] stopped by user cwd=${cwd} command=${JSON.stringify(command)}`
            );
            return stoppedResult(command, cwd, cwdSetting, permission);
        }

        const err = error as {
            message?: string;
            code?: string | number;
            stdout?: string;
            stderr?: string;
        };
        const combined = joinOutput(err.stdout ?? '', err.stderr ?? err.message ?? String(error));
        const tailed = tailOutputForModel(combined);
        const exitCode = typeof err.code === 'number' ? err.code : undefined;

        console.log(
            `[Motabix][run_command] failed cwd=${cwd} exitCode=${exitCode ?? 'n/a'} ` +
                `rawLength=${tailed.rawLength} truncated=${tailed.truncated} ` +
                `command=${JSON.stringify(command)}`
        );

        return JSON.stringify({
            ok: false,
            tool: 'run_command',
            command,
            cwd,
            runCommandCwdSetting: cwdSetting,
            permission,
            approvalRequired: permission === 'ask',
            exitCode,
            truncated: tailed.truncated,
            outputTailChars: RUN_COMMAND_OUTPUT_TAIL,
            rawLength: tailed.rawLength,
            output: tailed.output,
            error: typeof err.message === 'string' ? err.message : 'Command failed'
        });
    }
}

function stoppedResult(
    command: string,
    cwd: string | undefined,
    cwdSetting: string | undefined,
    permission?: 'ask' | 'allow'
): string {
    return JSON.stringify({
        ok: false,
        tool: 'run_command',
        command,
        cwd,
        runCommandCwdSetting: cwdSetting || '(empty → workspace root)',
        permission,
        stopped: true,
        error: 'Stopped by user.'
    });
}

function execFileAbortable(
    file: string,
    args: string[],
    opts: {
        cwd: string;
        windowsHide: boolean;
        maxBuffer: number;
        encoding: BufferEncoding;
        signal?: AbortSignal;
    }
): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        if (opts.signal?.aborted) {
            reject(abortError());
            return;
        }

        const child = execFile(
            file,
            args,
            {
                cwd: opts.cwd,
                windowsHide: opts.windowsHide,
                maxBuffer: opts.maxBuffer,
                encoding: opts.encoding
            },
            (error, stdout, stderr) => {
                cleanup();
                if (opts.signal?.aborted) {
                    reject(abortError());
                    return;
                }
                if (error) {
                    const enriched = error as Error & {
                        stdout?: string;
                        stderr?: string;
                    };
                    enriched.stdout = String(stdout ?? '');
                    enriched.stderr = String(stderr ?? '');
                    reject(enriched);
                    return;
                }
                resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
            }
        );

        const onAbort = () => {
            console.log(
                `[Motabix][run_command] abort signal — killing pid=${child.pid ?? 'n/a'}`
            );
            killProcessTree(child);
        };
        opts.signal?.addEventListener('abort', onAbort, { once: true });

        const cleanup = () => {
            opts.signal?.removeEventListener('abort', onAbort);
        };
    });
}

function killProcessTree(child: ChildProcess): void {
    if (!child.pid) {
        try {
            child.kill();
        } catch {
            // ignore
        }
        return;
    }

    if (process.platform === 'win32') {
        // Kill the shell and its children (e.g. long-running node under cmd).
        execFile(
            'taskkill',
            ['/pid', String(child.pid), '/T', '/F'],
            { windowsHide: true },
            () => {
                // ignore taskkill errors (process may already have exited)
            }
        );
        return;
    }

    try {
        child.kill('SIGTERM');
    } catch {
        // ignore
    }
    setTimeout(() => {
        try {
            if (!child.killed) {
                child.kill('SIGKILL');
            }
        } catch {
            // ignore
        }
    }, 400);
}

function abortError(): Error & { code: string } {
    const err = new Error('Stopped by user.') as Error & { code: string };
    err.code = 'ABORT_ERR';
    err.name = 'AbortError';
    return err;
}

function isAbortError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }
    const err = error as { name?: string; code?: string | number; message?: string };
    return (
        err.name === 'AbortError' ||
        err.code === 'ABORT_ERR' ||
        /stopped by user/i.test(String(err.message ?? ''))
    );
}

/** PLAN: model only receives the last RUN_COMMAND_OUTPUT_TAIL chars of combined stdout/stderr. */
export function tailOutputForModel(combined: string): {
    output: string;
    truncated: boolean;
    rawLength: number;
} {
    const raw = String(combined ?? '');
    const rawLength = raw.length;
    if (rawLength <= RUN_COMMAND_OUTPUT_TAIL) {
        return { output: raw, truncated: false, rawLength };
    }
    return {
        output: raw.slice(-RUN_COMMAND_OUTPUT_TAIL),
        truncated: true,
        rawLength
    };
}

export function normalizeRunCommandPermission(
    value: MotabixAppSettings['runCommandPermission'] | string | undefined
): 'ask' | 'allow' {
    return value === 'allow' ? 'allow' : 'ask';
}

/** Resolve Settings runCommandCwd; blank means workspace root. */
export function resolveRunCommandCwd(runCommandCwd: string): string {
    const configured = String(runCommandCwd ?? '').trim();
    const root = getWorkspaceRoot();

    if (!configured) {
        if (!root) {
            throw new Error('No workspace folder is open, and run_command cwd is empty.');
        }
        return root.fsPath;
    }

    const resolved = path.isAbsolute(configured)
        ? path.normalize(configured)
        : root
          ? path.resolve(root.fsPath, configured)
          : path.normalize(configured);

    if (!fs.existsSync(resolved)) {
        throw new Error(`run_command cwd does not exist: ${resolved}`);
    }
    if (!fs.statSync(resolved).isDirectory()) {
        throw new Error(`run_command cwd is not a directory: ${resolved}`);
    }
    return resolved;
}

function getShell(): string {
    if (process.platform === 'win32') {
        return process.env.ComSpec || 'cmd.exe';
    }
    return process.env.SHELL || '/bin/sh';
}

function getShellArgs(command: string): string[] {
    if (process.platform === 'win32') {
        return ['/d', '/s', '/c', command];
    }
    return ['-c', command];
}

function joinOutput(stdout: string, stderr: string): string {
    const out = String(stdout ?? '');
    const err = String(stderr ?? '');
    if (out && err) {
        return `${out}${out.endsWith('\n') ? '' : '\n'}${err}`;
    }
    return out || err;
}
