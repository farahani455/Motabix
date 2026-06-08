import * as vscode from 'vscode';

export interface SessionConfig{
    model:string;
    agent:string;
}
export interface ISessionConfigService{
    execute(webview: vscode.WebviewView,message:any):Promise<void> | void;
    getSessionConfig():SessionConfig;
    setSessionConfig(message:any):void;
}