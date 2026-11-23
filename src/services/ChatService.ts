import { IChatService } from './IAIService';
import { ResponseFormat } from '../types/response-format-type';
import type {
    ChatCompletionMessageParam,
    ChatCompletionTool
} from 'openai/resources/chat/completions';
import { OpenAIClientFactory } from './OpenAIClientFactory';
import { formatProviderError } from '../utils/formatProviderError';
import { isAbortError } from '../utils/isAbortError';
import { extractToolCalls } from '../agent/extractToolCalls';

export type ChatToolCall = {
    id: string;
    name: string;
    arguments: string;
};

export type ChatWithToolsResult = {
    content: string | null;
    toolCalls: ChatToolCall[];
    finishReason: string | null;
};

export class ChatService implements IChatService {
    constructor(private readonly clientFactory: OpenAIClientFactory) {}

    async sendMessage(
        messages: ChatCompletionMessageParam[],
        model: string,
        response_format: ResponseFormat | undefined
    ): Promise<string> {
        try {
            if (!model?.trim()) {
                throw new Error('No model selected');
            }
            const client = await this.clientFactory.getClient();
            const response = await client.chat.completions.create({
                model: model,
                messages,
                response_format
            });
            return response.choices[0].message.content || '';
        } catch (error) {
            return 'error:' + formatProviderError(error, model);
        }
    }

    async sendMessageStream(
        messages: ChatCompletionMessageParam[],
        model: string,
        onChunk: (chunk: string) => void,
        signal?: AbortSignal
    ): Promise<string> {
        try {
            if (!model?.trim()) {
                throw new Error('No model selected');
            }
            if (signal?.aborted) {
                throw new Error('Stopped by user.');
            }
            const client = await this.clientFactory.getClient();
            // Ask path: never pass tools.
            const stream = await client.chat.completions.create(
                {
                    model: model,
                    messages,
                    stream: true
                },
                signal ? { signal } : undefined
            );

            let fullResponse = '';
            for await (const chunk of stream) {
                if (signal?.aborted) {
                    throw new Error('Stopped by user.');
                }
                const delta = chunk.choices[0]?.delta;
                if (delta && 'tool_calls' in delta && delta.tool_calls) {
                    continue;
                }
                const content = delta?.content || '';
                if (content) {
                    fullResponse += content;
                    onChunk(content);
                }
            }
            return fullResponse;
        } catch (error) {
            if (signal?.aborted || isAbortError(error)) {
                throw new Error('Stopped by user.');
            }
            throw new Error(formatProviderError(error, model));
        }
    }

    async completeWithTools(
        messages: ChatCompletionMessageParam[],
        model: string,
        tools: ChatCompletionTool[],
        signal?: AbortSignal,
        toolChoice:
            | 'auto'
            | 'required'
            | { type: 'function'; function: { name: string } } = 'auto'
    ): Promise<ChatWithToolsResult> {
        try {
            if (!model?.trim()) {
                throw new Error('No model selected');
            }
            if (signal?.aborted) {
                throw new Error('Stopped by user.');
            }

            const client = await this.clientFactory.getClient();
            let response;
            try {
                response = await client.chat.completions.create(
                    {
                        model,
                        messages,
                        tools,
                        tool_choice: toolChoice
                    },
                    signal ? { signal } : undefined
                );
            } catch (error) {
                // Some local providers reject forced tool_choice — fall back once.
                const forced =
                    toolChoice === 'required' ||
                    (typeof toolChoice === 'object' && toolChoice?.type === 'function');
                if (forced) {
                    console.log(
                        `[Motabix][tools] tool_choice=${JSON.stringify(toolChoice)} failed; retrying with auto. ` +
                            `${error instanceof Error ? error.message : String(error)}`
                    );
                    response = await client.chat.completions.create(
                        {
                            model,
                            messages,
                            tools,
                            tool_choice: 'auto'
                        },
                        signal ? { signal } : undefined
                    );
                } else {
                    throw error;
                }
            }

            if (signal?.aborted) {
                throw new Error('Stopped by user.');
            }

            const message = response.choices[0]?.message;
            const extracted = extractToolCalls({
                content: message?.content,
                tool_calls: message?.tool_calls as Array<{
                    id?: string;
                    type?: string;
                    function?: { name?: string; arguments?: unknown };
                }> | null
            });

            if (extracted.recoveredFromContent) {
                console.log(
                    `[Motabix][tools] recovered ${extracted.toolCalls.length} tool call(s) from content ` +
                        `(model dumped JSON instead of native tool_calls)`
                );
            }

            return {
                content: extracted.content,
                toolCalls: extracted.toolCalls,
                finishReason: response.choices[0]?.finish_reason ?? null
            };
        } catch (error) {
            if (signal?.aborted || isAbortError(error)) {
                throw new Error('Stopped by user.');
            }
            throw new Error(formatProviderError(error, model));
        }
    }
}
