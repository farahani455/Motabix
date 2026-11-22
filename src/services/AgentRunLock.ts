export class AgentRunLock {
    private running = false;
    private activeRequestId: string | null = null;
    private abortController: AbortController | null = null;

    tryAcquire(requestId: string): boolean {
        if (this.running) {
            return false;
        }
        this.running = true;
        this.activeRequestId = requestId;
        this.abortController = new AbortController();
        return true;
    }

    release(requestId?: string | null): boolean {
        if (!this.running) {
            return false;
        }
        if (requestId && this.activeRequestId && requestId !== this.activeRequestId) {
            return false;
        }
        this.running = false;
        this.activeRequestId = null;
        this.abortController = null;
        return true;
    }

    /** Soft-stop for the agent loop (checked between steps / API calls). */
    requestStop(): void {
        this.abortController?.abort();
    }

    getAbortSignal(): AbortSignal | undefined {
        return this.abortController?.signal;
    }

    isRunning(): boolean {
        return this.running;
    }

    getActiveRequestId(): string | null {
        return this.activeRequestId;
    }
}
