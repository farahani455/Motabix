import * as vscode from 'vscode';
export function isLargeEdit(newCode: string, editor: vscode.TextEditor): boolean {
    const currentLineCount = editor.document.lineCount;
    const newLineCount = newCode.split('\n').length;
    return Math.abs(newLineCount - currentLineCount) > 10;
}
