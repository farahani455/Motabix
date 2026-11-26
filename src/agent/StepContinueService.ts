export type StepContinueRequest = {
    continueId: string;
    step: number;
};

type Pending = {
    resolve: (shouldContinue: boolean) => void;
};

/**
 * T9-1: Edit mode asks between agent steps («بروم بعدی؟») via the chat UI.
 */
export class StepContinueService {
    private readonly pending = new Map<string, Pending>();
    private notifier: ((request: StepContinueRequest) => void) | null = null;

    setNotifier(notifier: ((request: StepContinueRequest) => void) | null): void {
        this.notifier = notifier;
    }

    async request(step: number, signal?: AbortSignal): Promise<boolean> {
        if (signal?.aborted) {
            return false;
        }

        if (!this.notifier) {
            console.log(
                '[Motabix][step_continue] no chat notifier — treating as stop'
            );
            return false;
        }

        const continueId = `step_${Date.now().toString(36)}_${Math.random()
            .toString(36)
            .slice(2, 8)}`;

        return new Promise<boolean>((resolve) => {
            const finish = (shouldContinue: boolean) => {
                if (!this.pending.has(continueId)) {
                    return;
                }
                this.pending.delete(continueId);
                signal?.removeEventListener('abort', onAbort);
                resolve(shouldContinue);
            };

            const onAbort = () => finish(false);
            this.pending.set(continueId, { resolve: finish });
            signal?.addEventListener('abort', onAbort, { once: true });

            try {
                this.notifier?.({ continueId, step });
            } catch (error) {
                console.log(
                    `[Motabix][step_continue] notify failed: ` +
                        `${error instanceof Error ? error.message : String(error)}`
                );
                finish(false);
            }
        });
    }

    decide(continueId: string, shouldContinue: boolean): boolean {
        const entry = this.pending.get(continueId);
        if (!entry) {
            return false;
        }
        entry.resolve(shouldContinue);
        return true;
    }

    cancelAll(): void {
        for (const [id, entry] of this.pending) {
            this.pending.delete(id);
            entry.resolve(false);
        }
    }
}
