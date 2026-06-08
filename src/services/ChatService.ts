import OpenAI from "openai";
import { IChatService } from "./IAIService";
import {ResponseFormat} from '../types/response-format-type';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import * as vscode from 'vscode';

export class ChatService implements IChatService {
   
    constructor(private readonly client: OpenAI) {}

    async sendMessage(
        messages: ChatCompletionMessageParam[],
        model: string,
        response_format: ResponseFormat | undefined
    ): Promise<string> {
        try {
            const response = await this.client.chat.completions.create({
                model: model,
                messages,
                response_format
            });
            const result: string = response.choices[0].message.content || '';
            return result;
        } catch (error) {
            vscode.window.showErrorMessage('Send Message Error: ' + error);
            return '';
        }
    }

    async sendMessageStream(
        messages: ChatCompletionMessageParam[],
        model: string,
        onChunk: (chunk: string) => void
    ): Promise<string> {
        try {
            const stream = await this.client.chat.completions.create({
                max_tokens:1000,
                model: model,
                messages,
                stream: true
            });

            let fullResponse = '';
            for await (const chunk of stream) {
                const content = chunk.choices[0]?.delta?.content || '';
                if (content) {
                    fullResponse += content;
                    onChunk(content); // هر تیکه رو به webview بفرست
                }
            }
            return fullResponse;
        } catch (error) {
            vscode.window.showErrorMessage('Send Message Error: ' + error);
            return '';
        }
    }


}
