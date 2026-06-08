import * as vscode from 'vscode';
import { MessageHandler } from '../handlers/MessageHandler';

export class MessageRouter {
    constructor(private readonly messageHanlder:MessageHandler) {}
    attach(webviewView: vscode.WebviewView): void {
        webviewView.webview.onDidReceiveMessage(async (message) => {
            this.messageHanlder.dispatch(webviewView,message);
        });
    }
    
}