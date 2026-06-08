
import { AttachedFile } from '../types/chat';
import * as vscode from 'vscode';

export function getActiveFileContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return null;
    }
    
    const document = editor.document;
    const position = editor.selection.active;
    
    return {
        fileName: document.fileName,
        languageId: document.languageId,
        fullContent: document.getText(),
        cursorPosition: {
            line: position.line,
            character: position.character
        },
        lineCount: document.lineCount
    };
}

export async function  prepareAttachedFiles(message: any): Promise<{
    attachedFiles: AttachedFile[];
    hasActiveFile: boolean;
}> {
    const activeDocument = getActiveFileContext();
    const attachedFiles: AttachedFile[] = [];
    let hasActiveFile = false;

    if(message.files && message.files.length > 0) {
        for (const element of message.files) {
            if(element === 'active-document' && activeDocument) {
                hasActiveFile = true;
                attachedFiles.push({
                    isActiveFile: true,
                    path: activeDocument.fileName,
                    content: activeDocument.fullContent,
                    language: activeDocument.languageId
                });
            } else { 
                const currentFile = await filesWithContent(element);
                attachedFiles.push(currentFile);
            }
        }
    }

    return { attachedFiles, hasActiveFile };
}
    export async function filesWithContent(file: string): Promise<AttachedFile> {
        const uri = vscode.Uri.joinPath(
            vscode.workspace.workspaceFolders![0].uri,
            file
        );
        const content = await vscode.workspace.fs.readFile(uri);
        return {
            isActiveFile: false,
            path: file,
            content: Buffer.from(content).toString('utf8'),
        };
    }
