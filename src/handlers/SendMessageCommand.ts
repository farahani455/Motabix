import * as vscode from 'vscode';
import {detectLanguage} from '../utils/languageTools';
import { IChatService } from '../services/IAIService';
import { IChatHistoryService } from '../services/IChatHistoryService';
import { IWebviewCommand } from './IWebviewCommand';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { getResponseFormat } from '../types/getResponseFormat';
import { AttachedFile } from '../types/chat';
import { getSystemPrompt } from '../utils/getSystemPrompt';
import { EditorService } from '../services/EditorService';
import { DiffService, LineChange } from '../services/DiffService';
import { CodeHistoryService } from '../services/CodeHistoryService';
import { NotifHandlerService } from '../services/NotifHandlerService';
import {parseAIResponse} from '../utils/parseAIResponse';
import {filesWithContent,getActiveFileContext} from '../utils/fileUtilities';
export class SendMessageCommand implements IWebviewCommand {
    constructor(
        private readonly aiService: IChatService,
        private readonly chatHistoryService: IChatHistoryService,
        private readonly diffService:DiffService,
        private readonly messageHandler:NotifHandlerService,
        private readonly context: vscode.ExtensionContext
    ){}

    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        if(!message.text?.trim()) {
            return;
        }

        const requestLang: string = detectLanguage(message.text);
        const requestId:string = message.requestId
        const activeDocument = getActiveFileContext();
        const attachedFiles: AttachedFile[] = [];
        let hasActiveFile = false;


        if(message.files && message.files.length > 0) {
            for (const element of message.files) {
                if(element === 'active-document' && activeDocument) {
                    hasActiveFile = true;
                    attachedFiles.push({
                        isActiveFile: true,
                        path: activeDocument.fileName,
                        content: activeDocument.fullContent,
                        language: activeDocument.languageId
                    });
                } else { 
                    const currentFile = await filesWithContent(element);
                    attachedFiles.push(currentFile);
                }
            }
        }


        await this.chatHistoryService.addUserMessage({
            Id:message.requestId,
            role: 'user',
            content: message.text,
            timestamp: Date.now(),
            language: requestLang
        }, attachedFiles);

        const SYSTEM_PROMPT = getSystemPrompt(message.agent);


        const editor = vscode.window.activeTextEditor;
        const request: ChatCompletionMessageParam[] = await this.chatHistoryService.buildRequestMessages(SYSTEM_PROMPT);
        const responseFormat = getResponseFormat(message.agent);
        // const activeFile = attachedFiles.find(file => file.isActiveFile);
        // const insertMode = getInsertionModeV2(message.agent);

        let response: string = '';
        const responseId=this.generateNewId();
        if(message.agent === 'Ask' ) {
            try{
                webviewView.webview.postMessage({
                    command: 'stream-start-response',
                    requestId,
                    responseId
                });

                response = await this.aiService.sendMessageStream(
                    request,
                    (message.model ?? "gpt-4o"),
                    (chunk) => {
                            webviewView.webview.postMessage({
                                command: 'stream-chunk-response',
                                requestId,
                                responseId,
                                language:requestLang,
                                content:chunk
                            });

                    }
                );

                webviewView.webview.postMessage({
                    command: 'stream-end-response',
                    requestId,
                    responseId
                });
            }catch(error){
                webviewView.webview.postMessage({
                    command: 'stream-error-response',
                    requestId,
                    responseId,
                    error
                });
                this.messageHandler.showError('Stream Message Error', error as Error );
            }
            

        } else {

            response = await this.aiService.sendMessage(
                request,
                (message.model ?? "gpt-4o"),
                responseFormat
            );
            
            const parsedCode = parseAIResponse(response);
            const activeContent=activeDocument?.fullContent??'';

            const editorService:EditorService=new EditorService(this.messageHandler);
            const codeHistory:CodeHistoryService= new CodeHistoryService(this.context);
            let lineChanges:LineChange[]=[];

            if(editor){

                try{

                    codeHistory.saveState(editor.document.uri,activeContent);
                    editorService.insertCodeDirect(editor,parsedCode.code);
                    lineChanges= this.diffService.compareTexts(activeContent,parsedCode.code);
                }catch(error){
                    if(editor) {
                        this.diffService.clearDecorations(editor);
                    }
                    this.messageHandler.showError('Editor Message Error', error as Error );

                }

            }else{
                const neweditor= await editorService.createNewFile(parsedCode.code,parsedCode.language??"plaintext",parsedCode.suggestedFilename??"readme.md");

            }

            await new Promise(resolve => setTimeout(resolve, 1000));

            const refreshedEditor = vscode.window.activeTextEditor;
            if(refreshedEditor){
                this.diffService.highlightChanges(refreshedEditor,lineChanges);
            }

            webviewView.webview.postMessage({
                command: 'code_response',
                requestId,
                responseId,
                language:detectLanguage(response),
                text: response
            });
        }


        if(!response || response.trim().length === 0) {
            this.messageHandler.showError('Response is null!',new Error);
            return;
        }

        
        await this.chatHistoryService.addAssistantMessage({
            Id:responseId,
            role: 'assistant',
            content: response,
            timestamp: Date.now(),
            language: detectLanguage(response),
            codeAction:'pending'
        });

        
    }

    private generateNewId():string {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 9);
        return `req_${timestamp}_${randomPart}`;
    }

}
