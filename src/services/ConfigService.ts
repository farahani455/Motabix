import * as vscode from 'vscode';

export interface MotabixConfig {
    apiKey: string;
    model: string;
    baseURL: string;
}

export class ConfigService {
    private static SECTION='motabix';
    static get():MotabixConfig{
       const config = vscode.workspace.getConfiguration(this.SECTION);
       return {
            apiKey: config.get<string>('apiKey') || '',
            model: config.get<string>('model') || 'gpt-4o',
            baseURL: config.get<string>('baseURL') || 'https://api.openai.com/v1'
        };
    }
     static getApiKey(): string {
          return this.get().apiKey;
      }

      static getModel(): string {
          return this.get().model;
      }
      static getBaseURL():string{
        return this.get().baseURL;
      }


}