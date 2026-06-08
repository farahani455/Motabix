import * as vscode from 'vscode';

export class InlineDiffService {
    private decorationType: vscode.TextEditorDecorationType;

    constructor() {
        this.decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(2, 130, 2, 0.11)', 
            isWholeLine: true,
            borderWidth: '0 0 0 3px', 
            borderStyle: 'solid',
            borderColor: '#179d02',
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        });
    }
    public highlightChanges(editor: vscode.TextEditor, changedLineNumbers: number[]) {
        const decorations: vscode.DecorationOptions[] = changedLineNumbers.map(lineNum => ({
            range: new vscode.Range(lineNum, 0, lineNum, Number.MAX_VALUE),
            hoverMessage: `Line ${lineNum + 1} has been changed.`
        }));
        editor.setDecorations(this.decorationType, decorations);
    }

    public clearHighlights(editor: vscode.TextEditor) {
        editor.setDecorations(this.decorationType, []);
    }
}
