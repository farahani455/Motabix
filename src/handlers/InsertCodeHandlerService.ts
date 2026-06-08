import * as vscode from 'vscode';
import {IWebviewCommand} from './IWebviewCommand'
import {formatResponse} from '../utils/formatResponse';
export class InsertCodeHandlerService implements IWebviewCommand{

    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if(editor){
            await editor.edit(editBuilder=>{
                const messageCode:string= formatResponse(message.code);
                editBuilder.insert(editor.selection.active, messageCode);
            })
            vscode.window.showInformationMessage('Code Inserted to active document!');

        }else{
            vscode.window.showInformationMessage('There is no active editor!');

        }
    }

}