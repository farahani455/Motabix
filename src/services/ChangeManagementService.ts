import * as vscode from 'vscode';
import { CodeHistoryService } from './CodeHistoryService';
import { DiffService } from './DiffService';
import { ChatHistoryService } from './ChatHistoryService';

export class ChangeManagementService {
    
    constructor(
        private readonly chatHistory:ChatHistoryService,
        private readonly codeHistoryService: CodeHistoryService,
        private readonly diffService?: DiffService
    ) {}

    public async acceptChanges(requestId:string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        // Save current state to history before accepting
        await this.codeHistoryService.saveState(editor.document.uri, editor.document.getText());
        
        this.clearDecorations(editor);

        let item=this.chatHistory.getItemById(requestId);
        if(item){
            item.codeAction='accepted';
            await this.chatHistory.setItemById(requestId,item);
        }
  
        
        vscode.window.showInformationMessage('Changes accepted');
    }

    public async rejectChanges(requestId:string): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor');
            return;
        }

        const restored = await this.codeHistoryService.undo(editor.document.uri);
        if (restored) {
            this.clearDecorations(editor);
            vscode.window.showInformationMessage('Changes rejected');
        } else {
            vscode.window.showWarningMessage('No changes to reject');
        }
         let item=this.chatHistory.getItemById(requestId);
        if(item){
            item.codeAction='rejected';
            await this.chatHistory.setItemById(requestId,item);
        }
    }

    /**
     * Clear all decorations from the editor
     */
    public clearDecorations(editor: vscode.TextEditor): void {
        if (!editor) {
            return;
        }

        // If DiffService is provided, use it to clear decorations
        if (this.diffService) {
            this.diffService.clearDecorations(editor);
        }
    }
}
