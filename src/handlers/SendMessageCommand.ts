import * as vscode from 'vscode';
import { detectLanguage } from '../utils/languageTools';
import { IChatHistoryService } from '../services/IChatHistoryService';
import { IWebviewCommand } from './IWebviewCommand';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { AttachedFile } from '../types/chat';
import { getSystemPrompt } from '../utils/getSystemPrompt';
import { EditorService } from '../services/EditorService';
import { DiffService } from '../services/DiffService';
import { CodeHistoryService } from '../services/CodeHistoryService';
import { NotifHandlerService } from '../services/NotifHandlerService';
import { filesWithContent } from '../utils/fileUtilities';
import { AgentRunLock } from '../services/AgentRunLock';
import { isAgentMode, normalizeAgentMode } from '../utils/isAskMode';
import { ActiveDocumentManager } from './ActiveDocumentManager';
import { ChatService } from '../services/ChatService';
import { AgentLoopService } from '../agent/AgentLoopService';
import { MOTABIX_TOOLS } from '../agent/motabixTools';
import { ToolExecutor } from '../agent/ToolExecutor';
import { EditProposalStore } from '../agent/EditProposalStore';
import { MotabixSettingsService } from '../services/MotabixSettingsService';
import { formatProviderError } from '../utils/formatProviderError';
import { isAbortError } from '../utils/isAbortError';

export class SendMessageCommand implements IWebviewCommand {
    private readonly agentLoop: AgentLoopService;

    constructor(
        private readonly aiService: ChatService,
        private readonly chatHistoryService: IChatHistoryService,
        private readonly diffService: DiffService,
        private readonly messageHandler: NotifHandlerService,
        private readonly context: vscode.ExtensionContext,
        private readonly editorService: EditorService,
        private readonly codeHistory: CodeHistoryService,
        private readonly agentRunLock: AgentRunLock,
        private readonly activeDocumentManager: ActiveDocumentManager,
        settingsService: MotabixSettingsService,
        proposalStore: EditProposalStore
    ) {
        this.agentLoop = new AgentLoopService(
            aiService,
            new ToolExecutor(settingsService, proposalStore)
        );
    }

    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        if (!message.text?.trim()) {
            return;
        }

        const requestId: string = message.requestId ?? this.generateNewId();
        if (!this.agentRunLock.tryAcquire(requestId)) {
            webviewView.webview.postMessage({
                command: 'agentBusy',
                requestId,
                message: 'Another agent run is already in progress.'
            });
            return;
        }

        try {
            await this.runMessage(webviewView, message, requestId);
        } finally {
            this.agentRunLock.release(requestId);
        }
    }

    private async runMessage(
        webviewView: vscode.WebviewView,
        message: any,
        requestId: string
    ): Promise<void> {
        const requestLang: string = detectLanguage(message.text);
        const activeDocument = this.activeDocumentManager.getActiveFileContext();
        const attachedFiles: AttachedFile[] = [];

        if (message.files && message.files.length > 0) {
            for (const element of message.files) {
                if (element === 'active-document') {
                    if (!activeDocument) {
                        webviewView.webview.postMessage({
                            command: 'code_response_error',
                            requestId,
                            responseId: this.generateNewId(),
                            language: requestLang,
                            text: 'No active document available to attach. Open a file in the editor first.'
                        });
                        return;
                    }
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

        await this.chatHistoryService.addUserMessage(
            {
                Id: requestId,
                role: 'user',
                content: message.text,
                timestamp: Date.now(),
                language: requestLang
            },
            attachedFiles
        );

        const agentMode = normalizeAgentMode(message.agent);
        const languageHint =
            requestLang === 'fa'
                ? 'Detected user language: Persian (Farsi). Respond in Persian.'
                : 'Detected user language: English. Respond in English.';
        const SYSTEM_PROMPT = `${getSystemPrompt(agentMode)}\n\n${languageHint}`;
        const request: ChatCompletionMessageParam[] =
            await this.chatHistoryService.buildRequestMessages(SYSTEM_PROMPT);

        const responseId = this.generateNewId();
        const model = String(message.model ?? '').trim();

        // Only Edit / Edit Automatically may enter the agent tool loop.
        // Ask and any unknown mode stay on plain chat streaming (no tools).
        if (!isAgentMode(agentMode)) {
            await this.runAsk(webviewView, request, model, requestId, responseId, requestLang);
            return;
        }

        await this.runAgent(
            webviewView,
            request,
            model,
            requestId,
            responseId,
            requestLang,
            agentMode
        );
    }

    private async runAsk(
        webviewView: vscode.WebviewView,
        request: ChatCompletionMessageParam[],
        model: string,
        requestId: string,
        responseId: string,
        requestLang: string
    ): Promise<void> {
        try {
            webviewView.webview.postMessage({
                command: 'stream-start-response',
                requestId,
                responseId
            });

            const response = await this.aiService.sendMessageStream(
                request,
                model,
                (chunk) => {
                    webviewView.webview.postMessage({
                        command: 'stream-chunk-response',
                        requestId,
                        responseId,
                        language: requestLang,
                        content: chunk
                    });
                },
                this.agentRunLock.getAbortSignal()
            );

            if (this.agentRunLock.getAbortSignal()?.aborted) {
                this.postStopped(webviewView, requestId, responseId, requestLang);
                return;
            }

            if (!response.trim()) {
                webviewView.webview.postMessage({
                    command: 'stream-error-response',
                    requestId,
                    responseId,
                    language: requestLang,
                    text:
                        `Empty response from the model.\n` +
                        `Model: ${model || '(none)'}\n` +
                        `Check that Ollama is running and the model is pulled.`
                });
                return;
            }

            webviewView.webview.postMessage({
                command: 'stream-end-response',
                requestId,
                responseId
            });

            await this.chatHistoryService.addAssistantMessage({
                Id: responseId,
                role: 'assistant',
                content: response,
                timestamp: Date.now(),
                language: detectLanguage(response)
            });
        } catch (error) {
            if (isAbortError(error)) {
                this.postStopped(webviewView, requestId, responseId, requestLang);
                return;
            }
            const text =
                error instanceof Error
                    ? error.message
                    : `Provider request failed.\nModel: ${model || '(none)'}`;
            webviewView.webview.postMessage({
                command: 'stream-error-response',
                requestId,
                responseId,
                language: requestLang,
                text
            });
        }
    }

    private async runAgent(
        webviewView: vscode.WebviewView,
        request: ChatCompletionMessageParam[],
        model: string,
        requestId: string,
        responseId: string,
        requestLang: string,
        agentMode: string
    ): Promise<void> {
        webviewView.webview.postMessage({
            command: 'stream-start-response',
            requestId,
            responseId
        });

        try {
            console.log(
                `[Motabix][agent] runAgent requestId=${requestId} model=${model} agent=${agentMode}`
            );
            const result = await this.agentLoop.run({
                messages: request,
                model,
                tools: MOTABIX_TOOLS,
                agentMode,
                signal: this.agentRunLock.getAbortSignal(),
                onStep: (info) => {
                    console.log(
                        `[Motabix][step ${info.step}] UI notify ${info.toolName}`
                    );
                    webviewView.webview.postMessage({
                        command: 'agent-step',
                        requestId,
                        responseId,
                        language: requestLang,
                        step: info.step,
                        toolName: info.toolName,
                        text:
                            `[step ${info.step}] ${info.toolName}(${info.argsPreview})\n` +
                            `→ ${info.resultPreview}\n\n`
                    });

                    if (info.toolName === 'edit_file') {
                        try {
                            const parsed = JSON.parse(info.result) as {
                                ok?: boolean;
                                proposalId?: string;
                                path?: string;
                                isNewFile?: boolean;
                                autoApplied?: boolean;
                                written?: boolean;
                                shrinkBlocked?: boolean;
                            };
                            if (parsed.ok && parsed.proposalId) {
                                webviewView.webview.postMessage({
                                    command: 'editProposal',
                                    requestId,
                                    responseId,
                                    proposalId: parsed.proposalId,
                                    path: parsed.path,
                                    isNewFile: !!parsed.isNewFile,
                                    // If shrink was blocked, show Accept/Reject even in Auto mode.
                                    autoApplied: !!parsed.autoApplied && !parsed.shrinkBlocked,
                                    written: !!parsed.written,
                                    shrinkBlocked: !!parsed.shrinkBlocked
                                });
                            }
                        } catch {
                            // ignore non-JSON tool results
                        }
                    }
                },
                onHitMaxSteps: (maxSteps) => {
                    webviewView.webview.postMessage({
                        command: 'agent-limit',
                        requestId,
                        responseId,
                        language: requestLang,
                        maxSteps,
                        text:
                            `\n\nAgent stopped: reached the hard limit of ${maxSteps} steps.\n` +
                            `Send a new message if you want to continue.`
                    });
                }
            });

            if (result.stopped) {
                this.postStopped(webviewView, requestId, responseId, requestLang);
                return;
            }

            const finalText = result.hitMaxSteps
                ? result.finalText
                : result.finalText.trim() || 'Agent finished with no text response.';

            // Limit copy is already in the bubble via agent-limit; avoid duplicating it.
            if (!result.hitMaxSteps) {
                webviewView.webview.postMessage({
                    command: 'stream-chunk-response',
                    requestId,
                    responseId,
                    language: requestLang,
                    content: finalText
                });
            }

            webviewView.webview.postMessage({
                command: 'stream-end-response',
                requestId,
                responseId
            });

            await this.chatHistoryService.addAssistantMessage({
                Id: responseId,
                role: 'assistant',
                content: finalText,
                timestamp: Date.now(),
                language: detectLanguage(finalText)
            });
        } catch (error) {
            if (isAbortError(error)) {
                this.postStopped(webviewView, requestId, responseId, requestLang);
                return;
            }
            const text =
                error instanceof Error
                    ? error.message
                    : formatProviderError(error, model);
            webviewView.webview.postMessage({
                command: 'stream-error-response',
                requestId,
                responseId,
                language: requestLang,
                text
            });
        }
    }

    private postStopped(
        webviewView: vscode.WebviewView,
        requestId: string,
        responseId: string,
        requestLang: string
    ): void {
        webviewView.webview.postMessage({
            command: 'stream-chunk-response',
            requestId,
            responseId,
            language: requestLang,
            content: '\nStopped by user.'
        });
        webviewView.webview.postMessage({
            command: 'stream-end-response',
            requestId,
            responseId
        });
    }

    private generateNewId(): string {
        const timestamp = Date.now().toString(36);
        const randomPart = Math.random().toString(36).substring(2, 9);
        return `req_${timestamp}_${randomPart}`;
    }
}
