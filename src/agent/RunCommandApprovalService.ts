export type RunCommandApprovalRequest = {
    approvalId: string;
    command: string;
    cwd: string;
};

type Pending = {
    resolve: (allowed: boolean) => void;
};

/**
 * Bridges run_command "ask" permission to the chat UI (Allow/Deny card),
 * instead of a VS Code modal alert.
 */
export class RunCommandApprovalService {
    private readonly pending = new Map<string, Pending>();
    private notifier: ((request: RunCommandApprovalRequest) => void) | null = null;

    setNotifier(notifier: ((request: RunCommandApprovalRequest) => void) | null): void {
        this.notifier = notifier;
    }

    async request(
        command: string,
        cwd: string,
        signal?: AbortSignal
    ): Promise<boolean> {
        if (signal?.aborted) {
            return false;
        }

        if (!this.notifier) {
            console.log(
                '[Motabix][run_command] no chat notifier for approval — denying'
            );
            return false;
        }

        const approvalId = `run_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        return new Promise<boolean>((resolve) => {
            const finish = (allowed: boolean) => {
                if (!this.pending.has(approvalId)) {
                    return;
                }
                this.pending.delete(approvalId);
                signal?.removeEventListener('abort', onAbort);
                resolve(allowed);
            };

            const onAbort = () => finish(false);
            this.pending.set(approvalId, { resolve: finish });
            signal?.addEventListener('abort', onAbort, { once: true });

            try {
                this.notifier?.({ approvalId, command, cwd });
            } catch (error) {
                console.log(
                    `[Motabix][run_command] approval notify failed: ` +
                        `${error instanceof Error ? error.message : String(error)}`
                );
                finish(false);
            }
        });
    }

    decide(approvalId: string, allowed: boolean): boolean {
        const entry = this.pending.get(approvalId);
        if (!entry) {
            return false;
        }
        // entry.resolve removes itself from pending.
        entry.resolve(allowed);
        return true;
    }

    /** Deny anything still waiting (e.g. agent run ended). */
    cancelAll(): void {
        for (const [id, entry] of this.pending) {
            this.pending.delete(id);
            entry.resolve(false);
        }
    }
}
