import * as vscode from 'vscode';
import {IWebviewCommand} from '../handlers/IWebviewCommand'
export class CopyHandlerService implements IWebviewCommand{

    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        const messageCode:string= this.formatResponse(message.code);
        await vscode.env.clipboard.writeText(messageCode);
        vscode.window.showInformationMessage('Code copied to clipboard!');
    }
    formatResponse(input:string):string{
        return input.replace(/<br>/ig,'\n')
    }

}