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
        }

        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor && this.isTrackable(editor.document)) {
                this.remember(editor);
            }
            this._onDidChangeState.fire(this.hasActiveEditor());
        });
        vscode.window.onDidChangeTextEditorSelection((event) => {
            if (event.textEditor && this.isTrackable(event.textEditor.document)) {
                this.remember(event.textEditor);
            }
        });
        vscode.window.onDidChangeVisibleTextEditors(() => {
            this._onDidChangeState.fire(this.hasActiveEditor());
        });
        vscode.workspace.onDidCloseTextDocument((document) => {
            if (this.lastDocument?.uri.toString() === document.uri.toString()) {
                this.lastDocument = null;
            }
        });
    }

    public attach(webviewView: vscode.WebviewView): void {
        this.onDidChangeState((hasEditor) => {
            if (hasEditor) {
                const info = this.getActiveEditorInfo();
                webviewView.webview.postMessage({
                    command: 'changeActiveDocument',
                    isActive: true,
                    data: info
                });
            } else {
                // Still may have a remembered document for chat context.
                const remembered = this.getActiveFileContext();
                webviewView.webview.postMessage({
                    command: 'changeActiveDocument',
                    isActive: !!remembered,
                    data: remembered
                        ? { fileName: remembered.fileName, lineCount: remembered.lineCount }
                        : undefined
                });
            }
        });
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

    /** Prefers focused editor; falls back to last tracked file tab (webview focus safe). */
    public getActiveFileContext(): ActiveFileContext | null {
        const editor = vscode.window.activeTextEditor;
        if (editor && this.isTrackable(editor.document)) {
            this.remember(editor);
            return this.fromDocument(editor.document, editor.selection.active);
        }

        if (this.lastDocument && !this.lastDocument.isClosed && this.isTrackable(this.lastDocument)) {
            return this.fromDocument(this.lastDocument, this.lastCursor);
        }

        return null;
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
