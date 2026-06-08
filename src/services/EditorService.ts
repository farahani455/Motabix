// src/services/EditorService.ts
import * as vscode from 'vscode';
import { NotifHandlerService } from './NotifHandlerService';

export class EditorService {


    constructor(private readonly messageHandler:NotifHandlerService){}
     /**
     * Create new file with content
     */
    public async createNewFile(
        content: string,
        language: string = 'plaintext',
        filename?: string
        ): Promise<vscode.TextEditor | undefined> {
            try {
                // If we have a workspace and a filename, save directly to root
                const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;

                if (workspaceRoot && filename) {
                    const filePath = vscode.Uri.joinPath(workspaceRoot, filename);

                    // Write file content to disk
                    const encoder = new TextEncoder();
                    await vscode.workspace.fs.writeFile(filePath, encoder.encode(content));

                    // Open the saved file
                    const document = await vscode.workspace.openTextDocument(filePath);
                    const editor = await vscode.window.showTextDocument(document);

                    this.messageHandler.showInfo(`File saved: ${filename}`);
                    return editor;
                }

                // Fallback: untitled document (no workspace or no filename)
                const document = await vscode.workspace.openTextDocument({
                    content: content,
                    language: language
                });

                const editor = await vscode.window.showTextDocument(document);

                if (filename) {
                    this.messageHandler.showInfo(`File created. Save as: ${filename}`);
                }

                return editor;

            } catch (error) {
                this.messageHandler.showError('Error creating new file', error as Error);
                return undefined;
            }
        }

        


    async insertCodeDirect(
        editor: vscode.TextEditor,
        code: string
    ): Promise<void> {
        const document = editor.document;
        const fullRange = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );

        await editor.edit(editBuilder => {
            editBuilder.replace(fullRange, code);
        });
    }
    isDocumentEmpty(editor: vscode.TextEditor): boolean {
        return editor.document.getText().trim().length === 0;
    }
    
}
