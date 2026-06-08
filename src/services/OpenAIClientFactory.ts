import OpenAI from "openai";
import {ConfigService} from './ConfigService';

export class  OpenAIClientFactory{
    // instead of static client, create it per request
    public getClient(): OpenAI {
        return new OpenAI({
            apiKey: ConfigService.getApiKey(),
            baseURL: ConfigService.getBaseURL()
        });
    }
}   