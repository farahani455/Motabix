import * as vscode from 'vscode';
import {getMotabixHtml} from '../webview/getMotabixHtml';
import { MessageRouter } from './MessageRouter';
import { RenderChatHistory } from './RenderChatHistory';
import { SessionConfigRouter } from './SessionConfigRouter';
import { ActiveDocumentManager } from '../handlers/ActiveDocumentManager';
export class MotabixViewProvider implements vscode.WebviewViewProvider {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly messageRouter:MessageRouter,
        private readonly renderChatHistory:RenderChatHistory,
        private readonly sessionConfigRouter:SessionConfigRouter,
        private readonly activeDocumentManager:ActiveDocumentManager
    ){}

    resolveWebviewView(webviewView: vscode.WebviewView): void {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                 vscode.Uri.joinPath(this.context.extensionUri, 'media')
            ]
        };

        const mediaUri = webviewView.webview.asWebviewUri(
            vscode.Uri.joinPath(this.context.extensionUri, 'media')
        ).toString();
        
        webviewView.webview.html = getMotabixHtml(this.context.extensionPath,mediaUri);
        this.messageRouter.attach(webviewView);
        this.renderChatHistory.attach(webviewView);
        this.sessionConfigRouter.attach(webviewView);
        this.activeDocumentManager.attach(webviewView);
        

    }
}