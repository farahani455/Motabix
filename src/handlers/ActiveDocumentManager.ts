import * as vscode from 'vscode';

export type ActiveFileContext = {
    fileName: string;
    languageId: string;
    fullContent: string;
    cursorPosition: { line: number; character: number };
    lineCount: number;
};

export class ActiveDocumentManager {
    private _onDidChangeState = new vscode.EventEmitter<boolean>();
    public readonly onDidChangeState = this._onDidChangeState.event;
    private lastDocument: vscode.TextDocument | null = null;
    private lastCursor: vscode.Position = new vscode.Position(0, 0);

    constructor() {
        const current = vscode.window.activeTextEditor;
        if (current && this.isTrackable(current.document)) {
            this.remember(current);
        } else {
            this.syncFromVisibleEditors();
        }

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && this.isTrackable(editor.document)) {
                this.remember(editor);
            } else {
                this.syncFromVisibleEditors();
            }
            this._onDidChangeState.fire(this.hasOpenTrackableDocument());
        });
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (event.textEditor && this.isTrackable(event.textEditor.document)) {
                this.remember(event.textEditor);
            }
        });
        vscode.window.onDidChangeVisibleTextEditors(() => {
            this.syncFromVisibleEditors();
            this._onDidChangeState.fire(this.hasOpenTrackableDocument());
        });
        vscode.workspace.onDidCloseTextDocument((document) => {
            if (this.lastDocument?.uri.toString() === document.uri.toString()) {
                this.lastDocument = null;
                this.syncFromVisibleEditors();
            }
            this._onDidChangeState.fire(this.hasOpenTrackableDocument());
        });
    }

    public attach(webviewView: vscode.WebviewView): void {
        // Initial sync — do not leave a stale Active Document chip in the UI.
        this.pushState(webviewView);
        this.onDidChangeState(() => {
            this.pushState(webviewView);
        });
    }

    private pushState(webviewView: vscode.WebviewView): void {
        const open = this.hasOpenTrackableDocument();
        if (open) {
            const info = this.getActiveEditorInfo();
            webviewView.webview.postMessage({
                command: 'changeActiveDocument',
                isActive: true,
                data: info
            });
            return;
        }

        webviewView.webview.postMessage({
            command: 'changeActiveDocument',
            isActive: false,
            data: undefined
        });
    }

    /** True when a real file/untitled tab is still open (not webview-only focus). */
    public hasOpenTrackableDocument(): boolean {
        if (
            this.lastDocument &&
            !this.lastDocument.isClosed &&
            this.isTrackable(this.lastDocument)
        ) {
            return true;
        }
        return vscode.window.visibleTextEditors.some((editor) =>
            this.isTrackable(editor.document)
        );
    }

    public hasActiveEditor(): boolean {
        const editor = vscode.window.activeTextEditor;
        return !!(editor && this.isTrackable(editor.document));
    }

    public getActiveEditorInfo(): { fileName: string; lineCount: number } | null {
        const context = this.getActiveFileContext();
        if (!context) {
            return null;
        }
        return {
            fileName: context.fileName,
            lineCount: context.lineCount
        };
    }

    /** Prefers focused editor; falls back to last tracked open tab (webview focus safe). */
    public getActiveFileContext(): ActiveFileContext | null {
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isTrackable(editor.document)) {
            this.remember(editor);
            return this.fromDocument(editor.document, editor.selection.active);
        }

        if (
            this.lastDocument &&
            !this.lastDocument.isClosed &&
            this.isTrackable(this.lastDocument)
        ) {
            return this.fromDocument(this.lastDocument, this.lastCursor);
        }

        return null;
    }

    /** If focus left the editor, keep lastDocument only while that tab is still open. */
    private syncFromVisibleEditors(): void {
        if (
            this.lastDocument &&
            !this.lastDocument.isClosed &&
            this.isTrackable(this.lastDocument) &&
            this.isDocumentStillOpen(this.lastDocument)
        ) {
            return;
        }

        const next = vscode.window.visibleTextEditors.find((editor) =>
            this.isTrackable(editor.document)
        );
        if (next) {
            this.remember(next);
            return;
        }

        this.lastDocument = null;
    }

    private isDocumentStillOpen(document: vscode.TextDocument): boolean {
        const uri = document.uri.toString();
        if (
            vscode.window.visibleTextEditors.some(
                (editor) => editor.document.uri.toString() === uri
            )
        ) {
            return true;
        }
        // Tab may exist but not be in visibleTextEditors (e.g. in another group).
        for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
                const input = tab.input;
                if (input instanceof vscode.TabInputText && input.uri.toString() === uri) {
                    return true;
                }
            }
        }
        return false;
    }

    private remember(editor: vscode.TextEditor): void {
        this.lastDocument = editor.document;
        this.lastCursor = editor.selection.active;
    }

    private isTrackable(document: vscode.TextDocument): boolean {
        return document.uri.scheme === 'file' || document.uri.scheme === 'untitled';
    }

    private fromDocument(
        document: vscode.TextDocument,
        position: vscode.Position
    ): ActiveFileContext {
        return {
            fileName: document.fileName,
            languageId: document.languageId,
            fullContent: document.getText(),
            cursorPosition: {
                line: position.line,
                character: position.character
            },
            lineCount: document.lineCount
        };
    }
}
