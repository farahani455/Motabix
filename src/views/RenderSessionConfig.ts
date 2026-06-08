import { IWebviewCommand } from "../handlers/IWebviewCommand";
import * as vscode from 'vscode';
import {SessionConfig } from "../services/ISessionConfigService";
import { SessionConfigService } from "../services/SessionConfigService";


export class RenderSessionConfig{
    constructor(private readonly sessionConfigService:SessionConfigService){}
    attach(webviewView:vscode.WebviewView){
        const sessionConfig:SessionConfig= this.sessionConfigService.getSessionConfig();

        webviewView.webview.postMessage({
            command: 'getSessionConfig',
            global: sessionConfig??[]
        });
    }
}