import * as vscode from 'vscode';
import { IChatHistoryService } from '../services/IChatHistoryService';
import { ChatMessage, ChatSession } from '../types/chat';

export class RenderChatHistory{
    constructor(private readonly chatHistoryService:IChatHistoryService){}   

    attach(webviewView:vscode.WebviewView){
        const chatSession:ChatSession= this.chatHistoryService.getSession();

        webviewView.webview.postMessage({
            command: 'loadHistory',
            history: chatSession??[]
        });

    }

}