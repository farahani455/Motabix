import * as vscode from 'vscode';
import * as Diff from 'diff';

export interface LineChange {
    lineNumber: number;
    type: 'added' | 'removed' | 'modified';
    oldContent?: string;
    newContent?: string;
}

export class DiffService {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();

    constructor() {
        // Define decoration styles
        this.decorationTypes.set('added', vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(0, 255, 0, 0.2)',
            isWholeLine: true,
            overviewRulerColor: 'green',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        }));

        this.decorationTypes.set('removed', vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 0, 0, 0.2)',
            isWholeLine: true,
            overviewRulerColor: 'red',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
            textDecoration: 'line-through'
        }));

        this.decorationTypes.set('modified', vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 165, 0, 0.2)',
            isWholeLine: true,
            overviewRulerColor: 'orange',
            overviewRulerLane: vscode.OverviewRulerLane.Left
        }));
    }

    public compareTexts(oldText: string, newText: string): LineChange[] {
        const normalizeText = (text: string) => 
            text
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n');

        const oldLines = normalizeText(oldText).split('\n');
        const newLines = normalizeText(newText).split('\n');

        // Normalize for comparison (ignore all whitespace)
        const normalizeLine = (line: string) => line.replace(/\s+/g, '');
        
        // Check if a line is only a comment
        const isOnlyComment = (line: string) => {
            const trimmed = line.trim();
            return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed === '*/';
        };

        const diff = Diff.diffArrays(oldLines, newLines, {
            comparator: (left, right) => normalizeLine(left) === normalizeLine(right)
        });

        const changes: LineChange[] = [];
        let newLineNum = 1;

        for (const part of diff) {
            if (part.added) {
                // Lines added in the new file
                for (let i = 0; i < part.value.length; i++) {
                    const line = part.value[i];
                    const normalized = normalizeLine(line);
                    
                    // Skip empty lines, whitespace-only lines, and comment-only lines
                    if (normalized.length > 0 && !isOnlyComment(line)) {
                        changes.push({
                            lineNumber: newLineNum + i,
                            type: 'added',
                            newContent: line
                        });
                    }
                }
                newLineNum += part.value.length;
            } else if (part.removed) {
                // Lines removed from old file - mark at current position in new file
                for (let i = 0; i < part.value.length; i++) {
                    const line = part.value[i];
                    const normalized = normalizeLine(line);
                    
                    // Skip empty lines, whitespace-only lines, and comment-only lines
                    if (normalized.length > 0 && !isOnlyComment(line)) {
                        changes.push({
                            lineNumber: newLineNum,
                            type: 'removed',
                            oldContent: line
                        });
                    }
                }
                // Don't increment newLineNum for removed lines
            } else {
                // Unchanged lines
                newLineNum += part.value.length;
            }
        }

        return this.mergeConsecutiveChanges(changes);
    }

    private mergeConsecutiveChanges(changes: LineChange[]): LineChange[] {
        const result: LineChange[] = [];
        
        for (let i = 0; i < changes.length; i++) {
            const current = changes[i];
            
            // Look ahead to see if next change is at the same or adjacent line
            const next = changes[i + 1];
            
            // If current is removed and next is added at same or next line, consider merging
            if (current.type === 'removed' && next && next.type === 'added' && 
                (next.lineNumber === current.lineNumber || next.lineNumber === current.lineNumber + 1)) {
                result.push({
                    lineNumber: next.lineNumber,
                    type: 'modified',
                    oldContent: current.oldContent,
                    newContent: next.newContent
                });
                i++; // Skip next since we merged it
            } else {
                result.push(current);
            }
        }
        
        return result;
    }

    /**
     * Highlight changes in the editor
     */
    public highlightChanges(editor: vscode.TextEditor, changes: LineChange[]): void {
        const addedRanges: vscode.Range[] = [];
        const removedRanges: vscode.Range[] = [];
        const modifiedRanges: vscode.Range[] = [];

        changes.forEach(change => {
             const lineIndex = change.lineNumber - 1;
        
            if (lineIndex < 0 || lineIndex >= editor.document.lineCount) {
                console.warn(`Invalid line number: ${change.lineNumber}`);
                return;
            }

            const line = editor.document.lineAt(lineIndex);
            const range = line.range;

            switch (change.type) {
                case 'added':
                    addedRanges.push(range);
                    break;
                case 'removed':
                    removedRanges.push(range);
                    break;
                case 'modified':
                    modifiedRanges.push(range);
                    break;
            }
        });

        editor.setDecorations(this.decorationTypes.get('added')!, addedRanges);
        editor.setDecorations(this.decorationTypes.get('removed')!, removedRanges);
        editor.setDecorations(this.decorationTypes.get('modified')!, modifiedRanges);
    }


    
    /**
     * Clear all decorations
     */
    public clearDecorations(editor: vscode.TextEditor): void {
        
        this.decorationTypes.forEach((decoration, key) => {
            editor.setDecorations(decoration, []); 
            console.log(`✅ Cleared ${key}`);
        });

    }



    /**
     * Show confirmation dialog for changes
     */
    public async showDiffPreview(oldText: string, newText: string): Promise<boolean> {
        const changes = this.compareTexts(oldText, newText);
        
        const message = `${changes.length} changes found. Apply them?`;
        const result = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            'Yes',
            'No'
        );

        return result === 'Yes';
    }

    /**
     * Apply changes with diff preview
     */
    public async applyWithDiff(editor: vscode.TextEditor, newCode: string): Promise<boolean> {
        const oldCode = editor.document.getText();

        // If file is empty, apply directly
        if (oldCode.trim().length === 0) {
            await editor.edit(editBuilder => {
                editBuilder.insert(new vscode.Position(0, 0), newCode);
            });
            return true;
        }

        // Calculate changes
        const changes = this.compareTexts(oldCode, newCode);

        // If no changes
        if (changes.length === 0) {
            vscode.window.showInformationMessage('No changes found!');
            return false;
        }

        // Show diff
        this.highlightChanges(editor, changes);

        // Request confirmation
        const confirmed = await this.showDiffPreview(oldCode, newCode);

        if (confirmed) {
            // Apply changes
            const fullRange = new vscode.Range(
                editor.document.positionAt(0),
                editor.document.positionAt(oldCode.length)
            );

            await editor.edit(editBuilder => {
                editBuilder.replace(fullRange, newCode);
            });

            // Clear decorations
            this.clearDecorations(editor);

            vscode.window.showInformationMessage('✅ Changes applied');
            return true;
        } else {
            // Clear decorations
            this.clearDecorations(editor);
            vscode.window.showInformationMessage('❌ Changes cancelled');
            return false;
        }
    }

    dispose(): void {
        this.decorationTypes.forEach(decoration => decoration.dispose());
        this.decorationTypes.clear();
    }
}
