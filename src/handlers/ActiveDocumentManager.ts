import * as vscode from 'vscode';

export class ActiveDocumentManager {
    private _onDidChangeState = new vscode.EventEmitter<boolean>();
    public readonly onDidChangeState = this._onDidChangeState.event;
    
    constructor(){
        vscode.window.onDidChangeActiveTextEditor(editor => {
            this._onDidChangeState.fire(this.hasActiveEditor());
        });
        vscode.window.onDidChangeVisibleTextEditors(() => {
            this._onDidChangeState.fire(this.hasActiveEditor());
        });

    }

    public attach(webviewView: vscode.WebviewView):void{

        this.onDidChangeState(hasEditor => {
            if (hasEditor) {
                const info = this.getActiveEditorInfo();
                console.log(`✅ Editor Active: ${info?.fileName} (${info?.lineCount} line)`);
                
                webviewView.webview.postMessage({
                    command: 'changeActiveDocument',
                    isActive:true,
                    data: info
                });
            } else {                
                console.log(`There is no active editor`);
                webviewView.webview.postMessage({
                    command: 'changeActiveDocument',
                    isActive:false
                });
            }
        });


        
    }

    public hasActiveEditor(): boolean {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) return false;
        if (editor.document.uri.scheme !== 'file') return false;
        
        return true;
    }
    
    public getActiveEditorInfo(): { fileName: string; lineCount: number } | null {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return null;
        
        return {
            fileName: editor.document.fileName,
            lineCount: editor.document.lineCount
        };
    }
}
