import * as vscode from 'vscode';
import {IWebviewCommand} from './IWebviewCommand'
export class BrowseContentService implements IWebviewCommand{

    async execute(webviewView: vscode.WebviewView, message: any): Promise<void> {
        const selectedFiles = await this.showWorkspaceFilePicker();
        const attachedFiles=[];
        for (const fileUri of selectedFiles) {
            const content = await vscode.workspace.fs.readFile(fileUri);
            const fileName = vscode.workspace.asRelativePath(fileUri);
            attachedFiles.push({
                "name":fileName,
                "content":content
            })
        }

        webviewView.webview.postMessage({
            command:'getSelectedFile',
            files:attachedFiles
        })

    }

    async showWorkspaceFilePicker(): Promise<vscode.Uri[]> {
        const files = await vscode.workspace.findFiles(
            '**/*',  
            '**/node_modules/**'  
        );

        const items = files.map(file => ({
            label: vscode.workspace.asRelativePath(file),  
            description: file.fsPath, 
            uri: file
        }));

        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true, 
            placeHolder: 'Select files to attach',
            matchOnDescription: true  
        });

        return selected ? selected.map(item => item.uri) : [];
    }

}