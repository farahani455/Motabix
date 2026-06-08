import { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { ChatSession,ChatMessage,AttachedFile } from "../types/chat";
export interface IChatHistoryService {
    getSession(): ChatSession;
    addUserMessage(message: ChatMessage, files?: AttachedFile[]): Promise<void>;
    addAssistantMessage(message: ChatMessage): Promise<void>;
    updateSummary(summary: string): Promise<void>;
    clearSession(): Promise<void>;
    buildRequestMessages(systemPrompt: string):ChatCompletionMessageParam[];
}
