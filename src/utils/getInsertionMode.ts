import * as vscode from 'vscode';
export function getInsertionModeV2(agent:string){
    if (agent === 'Ask') {
        return 'stream';
    }else{
        return 'instant';
    }
}
export function getInsertionMode(
    code: string, 
    editor: vscode.TextEditor|undefined, 
    agent: string
): 'instant' | 'stream' {
    if(!editor) {
        return 'instant';
    }
    if (agent === 'Ask') {
        return 'stream';
    }
    
    const lines = code.split('\n').length;
    const selection = editor.selection;
    const selectedLines = selection.end.line - selection.start.line + 1;
    
    if (
        lines > 15 ||
        code.length > 500 || 
        selectedLines > 5 ||
        Math.abs(lines - editor.document.lineCount) > 10  
    ) {
        return 'stream';
    }


    return 'instant';
}
