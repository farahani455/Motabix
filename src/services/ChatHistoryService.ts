import * as vscode from 'vscode';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import {ChatSession,ChatMessage,AttachedFile} from '../types/chat';
import { IChatHistoryService } from './IChatHistoryService';
import type {chatAction} from '../types/chat';
export class ChatHistoryService implements IChatHistoryService{
    private readonly STORAGE_KEY:string="motabix.chatSession";
    private workspaceState:vscode.Memento;
    constructor(private readonly context: vscode.ExtensionContext){
        this.workspaceState=context.workspaceState;
    }
    getSession():ChatSession{
        return this.workspaceState.get<ChatSession>(this.STORAGE_KEY) ?? {
           messages: [],
            summary: ''
        };
    }

    async addUserMessage(message: ChatMessage, files?: AttachedFile[]):Promise<void> {
        const chatSession:ChatSession=this.getSession();
        chatSession.messages.push({
            ...message
            ,files
        });
        
        await this.workspaceState.update(this.STORAGE_KEY,chatSession);
    }
    async addAssistantMessage(message: ChatMessage):Promise<void> {
        const chatSession:ChatSession=this.getSession();
        chatSession.messages.push(message);
        await this.workspaceState.update(this.STORAGE_KEY,chatSession);
    }
    async updateSummary(summary:string){
        const chatSession:ChatSession= this.getSession();
        chatSession.summary=summary;
         await this.workspaceState.update(this.STORAGE_KEY, chatSession);
    }
    buildRequestMessages(systemPrompt:string):ChatCompletionMessageParam[]{ 
        const chatSession = this.getSession();
        const recentMessages:ChatMessage[] = chatSession.messages.slice(-10);
        const requestMessages: ChatCompletionMessageParam[] = [
            {
                role: 'system',
                content: systemPrompt
            }
        ];
        if(chatSession.summary.trim()){
            requestMessages.push({
                role:'system',
                content: `Conversation summary:\n${chatSession.summary}`
            })
        }
        for (const message of recentMessages) {
            requestMessages.push( {
                role:message.role,
                content:this.formatMessageContent(message)
            });
        }
        return requestMessages;
    }
    public getItemById(requestId:string):ChatMessage|undefined{
        const chatSession = this.getSession();


        for(let chatItem of chatSession.messages){
            if(chatItem.Id==requestId){
                return chatItem;
            }
        }

        return undefined;

    }
    public async setItemById(requestId:string,item:ChatMessage):Promise<void>{
        const chatSession = this.getSession();

        for(let chatItem of chatSession.messages){
            if(chatItem.Id==requestId){
                chatItem=item;
            }
        }

        await this.workspaceState.update(this.STORAGE_KEY,chatSession);

        return undefined;

    }

    async clearSession():Promise<void>{
        await this.workspaceState.update(this.STORAGE_KEY, null);
    }

    private formatMessageContent(message: ChatMessage): string {
        if (!message.files || message.files.length === 0) {
            return message.content;
        }

        return `${message.content}\n\nAttached files:\n${this.formatFiles(message.files)}`;
    }
    private formatFiles(files: AttachedFile[]): string {
        return files
            .map((file) => {
                const language = file.language ?? '';
                return `File: ${file.path}\n\`\`\`${language}\n${file.content}\n\`\`\``;
            })
            .join('\n\n');
    }
    

}