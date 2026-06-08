import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import type { ResponseFormat } from '../types/response-format-type';

export interface IChatService {
    sendMessage(
        messages: ChatCompletionMessageParam[]
        ,model:string
        ,responseFormat:ResponseFormat|undefined
    ):Promise< string> ;
    sendMessageStream(
        messages: ChatCompletionMessageParam[],
        model: string,
        onChunk: (chunk: string) => void
    ): Promise<string> 
}