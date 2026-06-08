import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
export class OpenSettingsCommand implements IWebviewCommand {
    constructor(){}
    execute():void{
        vscode.commands.executeCommand('workbench.action.openSettings', 'motabix');
    }
}