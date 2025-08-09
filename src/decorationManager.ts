import * as vscode from 'vscode';
import { DecorationManager } from './types';

export class CodeDecorationManager implements DecorationManager {
    private selectedLineDecorationType: vscode.TextEditorDecorationType;
    private relatedLinesDecorationType: vscode.TextEditorDecorationType;
    private currentDecorations: Map<vscode.TextEditor, {
        selectedLine: vscode.Range[];
        relatedLines: vscode.Range[];
    }> = new Map();

    constructor() {
        this.selectedLineDecorationType = this.createSelectedLineDecoration();
        this.relatedLinesDecorationType = this.createRelatedLinesDecoration();
        
        // Clean up decorations when editors are closed
        vscode.window.onDidChangeVisibleTextEditors(() => {
            this.cleanupClosedEditors();
        });
    }

    highlightLines(editor: vscode.TextEditor, lines: number[]): void {
        if (lines.length === 0) {
            this.clearHighlights();
            return;
        }

        // First line is the selected line, rest are related lines
        const selectedLine = lines[0];
        const relatedLines = lines.slice(1);

        this.updateHighlights(selectedLine, relatedLines, editor);
    }

    highlightUserSelection(editor: vscode.TextEditor, selectedLines: number[]): void {
        if (selectedLines.length === 0) {
            this.clearHighlights();
            return;
        }

        // Clear previous decorations for this editor
        this.clearHighlightsForEditor(editor);

        try {
            // Create ranges for the user's selection (no related lines yet)
            const selectedRanges = selectedLines
                .map(line => this.createLineRange(editor.document, line))
                .filter(range => range !== null) as vscode.Range[];

            // Apply decoration to user's selection
            if (selectedRanges.length > 0) {
                editor.setDecorations(this.selectedLineDecorationType, selectedRanges);
            }

            // Store current decorations (no related lines yet)
            this.currentDecorations.set(editor, {
                selectedLine: selectedRanges,
                relatedLines: []
            });

            // Scroll to show the first selected line
            if (selectedRanges.length > 0) {
                this.scrollToRange(editor, selectedRanges[0]);
            }

        } catch (error) {
            console.error('Error highlighting user selection:', error);
        }
    }

    addRelatedLines(editor: vscode.TextEditor, relatedLines: number[]): void {
        // Add related lines to existing user selection without changing the selected lines
        const existing = this.currentDecorations.get(editor);
        if (!existing) {
            console.warn('No existing selection to add related lines to');
            return;
        }

        try {
            // Create ranges for related lines, excluding any that are already selected
            const selectedLineNumbers = existing.selectedLine.map(range => range.start.line);
            const relatedRanges = relatedLines
                .filter(line => !selectedLineNumbers.includes(line)) // Don't include selected lines as related
                .map(line => this.createLineRange(editor.document, line))
                .filter(range => range !== null) as vscode.Range[];

            // Apply related lines decoration
            if (relatedRanges.length > 0) {
                editor.setDecorations(this.relatedLinesDecorationType, relatedRanges);
            }

            // Update stored decorations
            this.currentDecorations.set(editor, {
                selectedLine: existing.selectedLine,
                relatedLines: relatedRanges
            });

        } catch (error) {
            console.error('Error adding related lines:', error);
        }
    }

    clearHighlights(): void {
        // Clear all decorations from all editors
        for (const [editor, decorations] of this.currentDecorations) {
            if (editor && !editor.document.isClosed) {
                editor.setDecorations(this.selectedLineDecorationType, []);
                editor.setDecorations(this.relatedLinesDecorationType, []);
            }
        }
        this.currentDecorations.clear();
    }

    updateHighlights(selectedLine: number, relatedLines: number[], editor?: vscode.TextEditor): void {
        const activeEditor = editor || vscode.window.activeTextEditor;
        if (!activeEditor) {
            return;
        }

        // Clear previous decorations for this editor
        this.clearHighlightsForEditor(activeEditor);

        try {
            // Create ranges for decorations
            const selectedRange = this.createLineRange(activeEditor.document, selectedLine);
            const relatedRanges = relatedLines
                .filter(line => line !== selectedLine) // Avoid duplicating the selected line
                .map(line => this.createLineRange(activeEditor.document, line))
                .filter(range => range !== null) as vscode.Range[];

            // Apply decorations
            if (selectedRange) {
                activeEditor.setDecorations(this.selectedLineDecorationType, [selectedRange]);
            }
            
            if (relatedRanges.length > 0) {
                activeEditor.setDecorations(this.relatedLinesDecorationType, relatedRanges);
            }

            // Store current decorations
            this.currentDecorations.set(activeEditor, {
                selectedLine: selectedRange ? [selectedRange] : [],
                relatedLines: relatedRanges
            });

            // Scroll to show the selected line
            if (selectedRange) {
                this.scrollToRange(activeEditor, selectedRange);
            }

        } catch (error) {
            console.error('Error updating highlights:', error);
        }
    }

    getHighlightedLines(editor?: vscode.TextEditor): { selectedLine: number | null; relatedLines: number[] } {
        const activeEditor = editor || vscode.window.activeTextEditor;
        if (!activeEditor || !this.currentDecorations.has(activeEditor)) {
            return { selectedLine: null, relatedLines: [] };
        }

        const decorations = this.currentDecorations.get(activeEditor)!;
        
        return {
            selectedLine: decorations.selectedLine.length > 0 ? decorations.selectedLine[0].start.line : null,
            relatedLines: decorations.relatedLines.map(range => range.start.line)
        };
    }

    isLineHighlighted(lineNumber: number, editor?: vscode.TextEditor): boolean {
        const highlighted = this.getHighlightedLines(editor);
        return highlighted.selectedLine === lineNumber || highlighted.relatedLines.includes(lineNumber);
    }

    private createSelectedLineDecoration(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.selectionHighlightBackground'),
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: new vscode.ThemeColor('editor.selectionHighlightBorder'),
            borderRadius: '3px',
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.selectionHighlightForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            after: {
                contentText: ' 🎯 Selected',
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 1em'
            }
        });
    }

    private createRelatedLinesDecoration(): vscode.TextEditorDecorationType {
        return vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: new vscode.ThemeColor('editor.findMatchHighlightBorder'),
            borderRadius: '2px',
            isWholeLine: true,
            overviewRulerColor: new vscode.ThemeColor('editorOverviewRuler.findMatchForeground'),
            overviewRulerLane: vscode.OverviewRulerLane.Center,
            after: {
                contentText: ' 🔗 Related',
                color: new vscode.ThemeColor('editorCodeLens.foreground'),
                fontStyle: 'italic',
                margin: '0 0 0 1em'
            }
        });
    }

    private createLineRange(document: vscode.TextDocument, lineNumber: number): vscode.Range | null {
        if (lineNumber < 0 || lineNumber >= document.lineCount) {
            return null;
        }

        const line = document.lineAt(lineNumber);
        return new vscode.Range(
            new vscode.Position(lineNumber, 0),
            new vscode.Position(lineNumber, line.text.length)
        );
    }

    private clearHighlightsForEditor(editor: vscode.TextEditor): void {
        if (this.currentDecorations.has(editor)) {
            editor.setDecorations(this.selectedLineDecorationType, []);
            editor.setDecorations(this.relatedLinesDecorationType, []);
            this.currentDecorations.delete(editor);
        }
    }

    private scrollToRange(editor: vscode.TextEditor, range: vscode.Range): void {
        // Scroll to show the range with some context
        editor.revealRange(
            range,
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
    }

    private cleanupClosedEditors(): void {
        const openEditors = new Set(vscode.window.visibleTextEditors);
        
        for (const [editor] of this.currentDecorations) {
            if (!openEditors.has(editor) || editor.document.isClosed) {
                this.currentDecorations.delete(editor);
            }
        }
    }

    // Advanced highlighting methods

    highlightWithFade(editor: vscode.TextEditor, lines: number[], fadeOtherLines: boolean = true): void {
        if (!fadeOtherLines) {
            this.highlightLines(editor, lines);
            return;
        }

        // Create a decoration that fades non-highlighted lines
        const fadeDecorationType = vscode.window.createTextEditorDecorationType({
            opacity: '0.4'
        });

        // Get all line numbers in the document
        const allLines = Array.from({ length: editor.document.lineCount }, (_, i) => i);
        const linesToFade = allLines.filter(line => !lines.includes(line));

        // Apply fade to non-highlighted lines
        const fadeRanges = linesToFade
            .map(line => this.createLineRange(editor.document, line))
            .filter(range => range !== null) as vscode.Range[];

        editor.setDecorations(fadeDecorationType, fadeRanges);

        // Apply normal highlighting
        this.highlightLines(editor, lines);

        // Clean up fade decoration after a delay
        setTimeout(() => {
            editor.setDecorations(fadeDecorationType, []);
            fadeDecorationType.dispose();
        }, 5000);
    }

    highlightWithAnimation(editor: vscode.TextEditor, lines: number[]): void {
        // Create a pulsing effect by alternating decoration intensity
        let pulseCount = 0;
        const maxPulses = 6;

        const pulseDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor('editor.wordHighlightBackground'),
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: new vscode.ThemeColor('editor.wordHighlightBorder'),
            isWholeLine: true
        });

        const pulseInterval = setInterval(() => {
            if (pulseCount >= maxPulses) {
                clearInterval(pulseInterval);
                pulseDecorationType.dispose();
                // Apply normal highlighting after animation
                this.highlightLines(editor, lines);
                return;
            }

            const ranges = lines
                .map(line => this.createLineRange(editor.document, line))
                .filter(range => range !== null) as vscode.Range[];

            if (pulseCount % 2 === 0) {
                editor.setDecorations(pulseDecorationType, ranges);
            } else {
                editor.setDecorations(pulseDecorationType, []);
            }

            pulseCount++;
        }, 200);
    }

    showLineNumbers(editor: vscode.TextEditor, lines: number[]): void {
        // Create decorations that show line numbers prominently
        const lineNumberDecorationType = vscode.window.createTextEditorDecorationType({
            before: {
                contentText: '',
                color: new vscode.ThemeColor('editorLineNumber.activeForeground'),
                fontWeight: 'bold',
                margin: '0 0.5em 0 0'
            }
        });

        const decorations = lines.map(lineNumber => {
            const range = this.createLineRange(editor.document, lineNumber);
            if (!range) return null;

            return {
                range,
                renderOptions: {
                    before: {
                        contentText: `L${lineNumber + 1}: `,
                        color: new vscode.ThemeColor('editorLineNumber.activeForeground'),
                        fontWeight: 'bold'
                    }
                }
            };
        }).filter(decoration => decoration !== null);

        editor.setDecorations(lineNumberDecorationType, decorations as any[]);

        // Clean up after a delay
        setTimeout(() => {
            editor.setDecorations(lineNumberDecorationType, []);
            lineNumberDecorationType.dispose();
        }, 3000);
    }

    dispose(): void {
        // Clear all decorations
        this.clearHighlights();
        
        // Dispose decoration types
        this.selectedLineDecorationType.dispose();
        this.relatedLinesDecorationType.dispose();
        
        // Clear the map
        this.currentDecorations.clear();
    }
}