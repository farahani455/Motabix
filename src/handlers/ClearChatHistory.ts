import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { IChatHistoryService } from '../services/IChatHistoryService';
export class ClearChatHistory implements IWebviewCommand {
    constructor(private readonly chatHisoryService:IChatHistoryService){}
    execute():void{
        this.chatHisoryService.clearSession();
    }
}