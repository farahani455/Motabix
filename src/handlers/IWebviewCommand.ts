import * as vscode from 'vscode';
export interface IWebviewCommand {
    execute(webview: vscode.WebviewView, message: any): Promise<void> | void;
}