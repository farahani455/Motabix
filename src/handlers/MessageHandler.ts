import * as vscode from 'vscode';
import { IWebviewCommand } from "./IWebviewCommand";

export class MessageHandler {
    private readonly commands: Map<string, IWebviewCommand> = new Map();
    constructor(){}
    register(commandName:string,command:IWebviewCommand){
        this.commands.set(commandName,command);
    }
    async dispatch(webview:vscode.WebviewView,message:any){
        const command=this.commands.get(message.command);
        if(!command){
             console.warn(`Unknown command received: ${message.command}`);
            return
        }
        command.execute(webview,message);
    }

}