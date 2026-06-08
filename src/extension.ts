
import * as vscode from 'vscode';
import {registerOpenInRightSidebarCommand}  from './commands/openInRightSidebar';
import { MotabixViewProvider } from './views/MotabixViewProvider';
import { ChatService } from './services/ChatService';

import { MessageRouter } from './views/MessageRouter';
import { SessionConfigRouter } from './views/SessionConfigRouter';
import { OpenAIClientFactory } from './services/OpenAIClientFactory';
import OpenAI from 'openai';
import { MessageHandler } from './handlers/MessageHandler';
import { SendMessageCommand } from './handlers/SendMessageCommand';
import { OpenSettingsCommand } from './handlers/OpenSettingsCommand';
import {ClearChatHistory} from './handlers/ClearChatHistory';

import { ChatHistoryService } from './services/ChatHistoryService';
import { RenderChatHistory } from './views/RenderChatHistory';
import { SessionConfigService } from './services/SessionConfigService';
import { CopyHandlerService } from './handlers/CopyHandlerService';
import { InsertCodeHandlerService } from './handlers/InsertCodeHandlerService';
import { BrowseContentService } from './handlers/BrowseContentService';
import { ChangeManagementCommands } from './handlers/ChangeManagementCommands';
import { DiffService } from './services/DiffService';
import { ActiveDocumentManager } from './handlers/ActiveDocumentManager';
import { NotifHandlerService } from './services/NotifHandlerService';

export function activate(context: vscode.ExtensionContext) {
    const client:OpenAI = new OpenAIClientFactory().getClient();
    const chatHistoryService= new ChatHistoryService(context);
    const sessionConfigService=new SessionConfigService(context);
    const chatService= new ChatService(client);
    const messageHandler = new MessageHandler();
    const renderchatHistory:RenderChatHistory=new RenderChatHistory(chatHistoryService);
    const diffService:DiffService=new DiffService();
    const notifHandler:NotifHandlerService= NotifHandlerService.getInstance();
    messageHandler.register("sendMessage", new SendMessageCommand(chatService,chatHistoryService,diffService,notifHandler,context));
    messageHandler.register("openSettings", new OpenSettingsCommand());
    messageHandler.register("clearHistory", new ClearChatHistory(chatHistoryService));
    messageHandler.register("setSessionConfig",sessionConfigService);
    messageHandler.register('copyCode', new CopyHandlerService());
    messageHandler.register('insertCode', new InsertCodeHandlerService());
    messageHandler.register('browseProject',new BrowseContentService());
    messageHandler.register('changeCodeMessage',new ChangeManagementCommands(context,diffService,chatHistoryService));


    const sessionConfigRouter=new SessionConfigRouter(sessionConfigService);

    const messageRouter= new MessageRouter(messageHandler);
    
    const activeDocManager = new ActiveDocumentManager();
    const provider = new MotabixViewProvider(context,messageRouter,renderchatHistory,sessionConfigRouter,activeDocManager);

    

    



    const openInRightSidebarCommand= registerOpenInRightSidebarCommand();
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('motabix.chatView', provider),
        openInRightSidebarCommand,
        diffService  // ← این خط رو اضافه کنید
    );}

  

export function deactivate() {}

