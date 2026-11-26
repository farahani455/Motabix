
import * as vscode from 'vscode';
import {registerOpenInRightSidebarCommand}  from './commands/openInRightSidebar';
import { MotabixViewProvider } from './views/MotabixViewProvider';
import { ChatService } from './services/ChatService';

import { MessageRouter } from './views/MessageRouter';
import { SessionConfigRouter } from './views/SessionConfigRouter';
import { OpenAIClientFactory } from './services/OpenAIClientFactory';
import { MessageHandler } from './handlers/MessageHandler';
import { SendMessageCommand } from './handlers/SendMessageCommand';
import { OpenSettingsCommand } from './handlers/OpenSettingsCommand';
import {ClearChatHistory} from './handlers/ClearChatHistory';
import { ReadyCommand } from './handlers/ReadyCommand';
import { StopGenerationCommand } from './handlers/StopGenerationCommand';

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
import { CodeHistoryService } from './services/CodeHistoryService';
import { EditorService } from './services/EditorService';
import { MotabixSettingsService } from './services/MotabixSettingsService';
import { ProviderConnectionService } from './services/ProviderConnectionService';
import { AgentRunLock } from './services/AgentRunLock';
import {
    EditProposalContentProvider,
    EditProposalStore
} from './agent/EditProposalStore';
import { EditProposalCommands } from './handlers/EditProposalCommands';
import { RunCommandApprovalService } from './agent/RunCommandApprovalService';
import { RunCommandApprovalCommands } from './handlers/RunCommandApprovalCommands';
import { StepContinueService } from './agent/StepContinueService';
import { StepContinueCommands } from './handlers/StepContinueCommands';

export function activate(context: vscode.ExtensionContext) {
    const chatHistoryService= new ChatHistoryService(context);
    const sessionConfigService=new SessionConfigService(context);
    const appSettingsService=new MotabixSettingsService(context);
    const clientFactory = new OpenAIClientFactory(appSettingsService);
    const providerConnectionService=new ProviderConnectionService(appSettingsService);
    const chatService= new ChatService(clientFactory);
    const agentRunLock = new AgentRunLock();
    const editProposalStore = new EditProposalStore();
    const runCommandApprovals = new RunCommandApprovalService();
    const stepContinues = new StepContinueService();
    const messageHandler = new MessageHandler();
    const renderchatHistory:RenderChatHistory=new RenderChatHistory(chatHistoryService);
    const diffService:DiffService=new DiffService();
    const notifHandler:NotifHandlerService= NotifHandlerService.getInstance();
    const editorService:EditorService= new EditorService(notifHandler);
    const codeHistory:CodeHistoryService= new CodeHistoryService(context);
    const activeDocManager = new ActiveDocumentManager();
    messageHandler.register("sendMessage", new SendMessageCommand(
        chatService,
        chatHistoryService,
        diffService,
        notifHandler,context,
        editorService,
        codeHistory,
        agentRunLock,
        activeDocManager,
        appSettingsService,
        editProposalStore,
        runCommandApprovals,
        stepContinues
    ));
    messageHandler.register("openSettings", new OpenSettingsCommand(appSettingsService));
    messageHandler.register("getAppSettings", appSettingsService);
    messageHandler.register("saveAppSettings", appSettingsService);
    messageHandler.register("testConnection", providerConnectionService);
    messageHandler.register("listModels", providerConnectionService);
    messageHandler.register("clearHistory", new ClearChatHistory(chatHistoryService));
    messageHandler.register("ready", new ReadyCommand(chatHistoryService, sessionConfigService));
    messageHandler.register("stopGeneration", new StopGenerationCommand(agentRunLock));
    messageHandler.register("setSessionConfig",sessionConfigService);
    messageHandler.register('copyCode', new CopyHandlerService());
    messageHandler.register('insertCode', new InsertCodeHandlerService());
    messageHandler.register('browseProject',new BrowseContentService());
    messageHandler.register('changeCodeMessage',new ChangeManagementCommands(context,diffService,chatHistoryService));
    const editProposalCommands = new EditProposalCommands(editProposalStore);
    messageHandler.register('acceptEditProposal', editProposalCommands);
    messageHandler.register('rejectEditProposal', editProposalCommands);
    messageHandler.register('openEditProposalDiff', editProposalCommands);
    const runCommandApprovalCommands = new RunCommandApprovalCommands(runCommandApprovals);
    messageHandler.register('allowRunCommand', runCommandApprovalCommands);
    messageHandler.register('denyRunCommand', runCommandApprovalCommands);
    const stepContinueCommands = new StepContinueCommands(stepContinues);
    messageHandler.register('continueAgentStep', stepContinueCommands);
    messageHandler.register('stopAgentStep', stepContinueCommands);


    const sessionConfigRouter=new SessionConfigRouter(sessionConfigService);

    const messageRouter= new MessageRouter(messageHandler);
    
    const provider = new MotabixViewProvider(context,messageRouter,renderchatHistory,sessionConfigRouter,activeDocManager);

    

    



    const openInRightSidebarCommand= registerOpenInRightSidebarCommand();
    
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('motabix.chatView', provider),
        openInRightSidebarCommand,
        diffService,
        vscode.workspace.registerTextDocumentContentProvider(
            EditProposalStore.scheme,
            new EditProposalContentProvider(editProposalStore)
        )
    );
}

  

export function deactivate() {}

