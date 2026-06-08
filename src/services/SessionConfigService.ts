import { ISessionConfigService, SessionConfig } from "./ISessionConfigService";
import * as vscode from 'vscode';
export class SessionConfigService implements ISessionConfigService{
    private readonly STORAGE_KEY='motabix.config'

    constructor(private readonly context:vscode.ExtensionContext){}

    async execute(webview: vscode.WebviewView,message:any): Promise<void>  {
        await this.setSessionConfig(message);        
    }
    
    getSessionConfig(): SessionConfig {
        const config = this.context.globalState.get<SessionConfig>(this.STORAGE_KEY);
        
        const defaultConfig: SessionConfig = {
            model: 'gpt-o4',
            agent: 'Ask'
        };
        
        if (!config) {
            return defaultConfig;
        }
        
        return {
            model: config.model ?? defaultConfig.model,
            agent: config.agent ?? defaultConfig.agent
        };
    }
    async setSessionConfig(message:any){
        const config =this.getSessionConfig();
        config.model=message.model??config.model;
        config.agent=message.agent??config.agent;
        await this.context.globalState.update(this.STORAGE_KEY,config);
    }

}