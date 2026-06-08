import * as vscode from 'vscode';

export class NotifHandlerService {
    private static instance: NotifHandlerService;

    private constructor() {}

    public static getInstance(): NotifHandlerService {
        if (!NotifHandlerService.instance) {
            NotifHandlerService.instance = new NotifHandlerService();
        }
        return NotifHandlerService.instance;
    }

    /**
     * Show error to user
     */
    public showError(message: string, error?: Error): void {
        const fullMessage = error 
            ? `${message}: ${error.message}` 
            : message;
        
        vscode.window.showErrorMessage(fullMessage);
        console.error('[Error]', fullMessage, error);
    }

    /**
     * Show warning
     */
    public showWarning(message: string): void {
        vscode.window.showWarningMessage(message);
        console.warn('[Warning]', message);
    }

    /**
     * Show info
     */
    public showInfo(message: string): void {
        vscode.window.showInformationMessage(message);
        console.info('[Info]', message);
    }

    /**
     * Show success
     */
    public showSuccess(message: string): void {
        vscode.window.showInformationMessage(`✓ ${message}`);
        console.log('[Success]', message);
    }

    /**
     * Handle async errors
     */
    public async handleAsync<T>(
        operation: () => Promise<T>,
        errorMessage: string
    ): Promise<T | undefined> {
        try {
            return await operation();
        } catch (error) {
            this.showError(errorMessage, error as Error);
            return undefined;
        }
    }

    /**
     * Handle sync errors
     */
    public handleSync<T>(
        operation: () => T,
        errorMessage: string
    ): T | undefined {
        try {
            return operation();
        } catch (error) {
            this.showError(errorMessage, error as Error);
            return undefined;
        }
    }

    /**
     * Show error with action buttons
     */
    public async showErrorWithActions(
        message: string,
        actions: { title: string; action: () => void | Promise<void> }[]
    ): Promise<void> {
        const actionTitles = actions.map(a => a.title);
        const selected = await vscode.window.showErrorMessage(message, ...actionTitles);
        
        if (selected) {
            const action = actions.find(a => a.title === selected);
            if (action) {
                await action.action();
            }
        }
    }

    /**
     * Log error without showing notification
     */
    public logError(message: string, error?: Error): void {
        console.error('[Error]', message, error);
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        // cleanup if needed
    }
}
