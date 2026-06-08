import * as vscode from 'vscode';
import { IWebviewCommand } from './IWebviewCommand';
import { ChangeManagementService } from '../services/ChangeManagementService';
import { CodeHistoryService } from '../services/CodeHistoryService';
import { DiffService } from '../services/DiffService';
import { ChatHistoryService } from '../services/ChatHistoryService';

export class ChangeManagementCommands implements IWebviewCommand {

    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly diffService:DiffService,
        private readonly chatHistory:ChatHistoryService,
    ){}

    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        if(!message.action?.trim()) {
            return;
        }
        
        const changeManagementService: ChangeManagementService = new ChangeManagementService(
            this.chatHistory,
            new CodeHistoryService(this.context),
            this.diffService
        );

        switch(message.action){
            case 'accepted':{
                await changeManagementService.acceptChanges(message.requestId);
            }
            break;
            case 'rejected':{
                await changeManagementService.rejectChanges(message.requestId);
            }
            break;
        }
    }

}
