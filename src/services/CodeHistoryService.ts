import * as vscode from 'vscode';

interface HistoryEntry {
    content: string;
    timestamp: number;
}

export class CodeHistoryService {
    private readonly HISTORY_SESSION_KEY:string="motabix.codeHistorySession";
    private readonly INDEX_SESSION_KEY:string="motabix.indexHistorySession";
    private workspaceState:vscode.Memento;
    
    constructor(private readonly context: vscode.ExtensionContext){
         this.workspaceState=context.workspaceState;
    }

    //private history: Map<string, HistoryEntry[]> = new Map();
    //private currentIndex: Map<string, number> = new Map();

    private readonly maxHistorySize: number = 50;

    /**
     * Convert Map to Object for storage
     */
    private mapToObject<T>(map: Map<string, T>): Record<string, T> {
        return Object.fromEntries(map);
    }

    /**
     * Convert Object back to Map
     */
    private objectToMap<T>(obj: Record<string, T> | undefined): Map<string, T> {
        return new Map(Object.entries(obj || {}));
    }

    /**
     * Save current content to history
     */
    public async saveState(uri: vscode.Uri, content: string) {
        const key = uri.toString();
        const history:Map<string,HistoryEntry[]> = this.getHistorySession();
        const currentIndex=this.getIndexHistorySession();
        if (!history.has(key)) {
            history.set(key, []);
            currentIndex.set(key, -1);
        }

        const fileHistory = history.get(key)!;
        const currentIdx = currentIndex.get(key)!;

        if (currentIdx < fileHistory.length - 1) {
            fileHistory.splice(currentIdx + 1);
        }

        // Add new entry
        fileHistory.push({
            content,
            timestamp: Date.now()
        });

        // Limit history size
        if (fileHistory.length > this.maxHistorySize) {
            fileHistory.shift();
        }

        // Update current index
        currentIndex.set(key, fileHistory.length - 1);

        await this.setHistorySession(history);
        await this.setIndexHistorySession(currentIndex);
    }

    /**
     * Undo: Go back to previous state
     */
    public async undo(uri: vscode.Uri): Promise<boolean> {
        const history = this.getHistorySession();
        const key = uri.toString();
        const fileHistory = history.get(key);
        const currentIndex=this.getIndexHistorySession();
        const currentIdx = currentIndex.get(key);

        if (!fileHistory || currentIdx === undefined || currentIdx <= 0) {
            vscode.window.showInformationMessage('No more undo history');
            return false;
        }

        // Move to previous state
        const newIndex = currentIdx - 1;
        currentIndex.set(key, newIndex);
        await this.setIndexHistorySession(currentIndex);
        // Apply previous content
        const previousEntry = fileHistory[newIndex];
        await this.applyContent(uri, previousEntry.content);

        return true;
    }

    /**
     * Redo: Go forward to next state
     */
    public async redo(uri: vscode.Uri): Promise<boolean> {
        const history = this.getHistorySession();
        const currentIndex=this.getIndexHistorySession();
        const key = uri.toString();
        const fileHistory = history.get(key);
        const currentIdx = currentIndex.get(key);

        if (!fileHistory || currentIdx === undefined || currentIdx >= fileHistory.length - 1) {
            vscode.window.showInformationMessage('No more redo history');
            return false;
        }

        // Move to next state
        const newIndex = currentIdx + 1;
        currentIndex.set(key, newIndex);
        await this.setIndexHistorySession(currentIndex);

        // Apply next content
        const nextEntry = fileHistory[newIndex];
        await this.applyContent(uri, nextEntry.content);

        return true;
    }

    /**
     * Check if undo is available
     */
    public canUndo(uri: vscode.Uri): boolean {
        const key = uri.toString();
        const currentIndex=this.getIndexHistorySession();
        const currentIdx = currentIndex.get(key);
        return currentIdx !== undefined && currentIdx > 0;
    }

    /**
     * Check if redo is available
     */
    public canRedo(uri: vscode.Uri): boolean {
        const history = this.getHistorySession();
        const currentIndex=this.getIndexHistorySession();
        const key = uri.toString();
        const fileHistory = history.get(key);
        const currentIdx = currentIndex.get(key);
        
        return fileHistory !== undefined && 
               currentIdx !== undefined && 
               currentIdx < fileHistory.length - 1;
    }

    /**
     * Get current history position info
     */
    public getHistoryInfo(uri: vscode.Uri): { current: number; total: number } {
        const history = this.getHistorySession();
        const currentIndex=this.getIndexHistorySession();
        const key = uri.toString();
        const fileHistory = history.get(key);
        const currentIdx = currentIndex.get(key);

        return {
            current: currentIdx !== undefined ? currentIdx + 1 : 0,
            total: fileHistory?.length || 0
        };
    }

    /**
     * Clear history for a specific file
     */
    public async clearHistory(uri: vscode.Uri): Promise<void> {
        const history = this.getHistorySession();
        const currentIndex=this.getIndexHistorySession();
        const key = uri.toString();
        history.delete(key);
        currentIndex.delete(key);
        await this.setIndexHistorySession(currentIndex);
        await this.setHistorySession(history);
    }

    /**
     * Clear all history
     */
    public async clearAllHistory(): Promise<void> {
        const history = this.getHistorySession();
        const currentIndex=this.getIndexHistorySession();
        history.clear();
        currentIndex.clear();
        await this.setIndexHistorySession(currentIndex);
        await this.setHistorySession(history);
    }

    /**
     * Apply content to editor
     */
    private async applyContent(uri: vscode.Uri, content: string): Promise<void> {
        const document = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(document);

        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        edit.replace(uri, fullRange, content);
        await vscode.workspace.applyEdit(edit);
    }

    /**
     * Get all history entries for a file (for debugging)
     */
    public getHistory(uri: vscode.Uri): HistoryEntry[] {
        const history = this.getHistorySession();
        const key = uri.toString();
        return history.get(key) || [];
    }

    public getHistorySession():Map<string,HistoryEntry[]>{
        const historyObj = this.workspaceState.get<Record<string, HistoryEntry[]>>(this.HISTORY_SESSION_KEY);
        return this.objectToMap(historyObj);
    }

    public async setHistorySession(fileHistory:Map<string,HistoryEntry[]>){
        const historyObj = this.mapToObject(fileHistory);
        await this.workspaceState.update(this.HISTORY_SESSION_KEY, historyObj);
    }

    public getIndexHistorySession():Map<string,number>{
        const indexObj = this.workspaceState.get<Record<string, number>>(this.INDEX_SESSION_KEY);
        return this.objectToMap(indexObj);
    }

    public async setIndexHistorySession(indexHistory:Map<string,number>){
        const indexObj = this.mapToObject(indexHistory);
        await this.workspaceState.update(this.INDEX_SESSION_KEY, indexObj);
    }
}
