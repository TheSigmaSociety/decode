import * as vscode from 'vscode';
import { CodeAnalysisService } from './codeAnalysis';
import { CodeDecorationManager } from './decorationManager';
import { CodeExplanationWebview } from './webviewProvider';
import { GeminiApiClient } from './geminiClient';
import { ConfigManager } from './configManager';
import { ExtensionErrorHandler } from './errorHandler';

export class SelectionHandler {
    private debounceTimer: NodeJS.Timeout | undefined;
    private readonly debounceDelay = 500; // 500ms debounce
    private isProcessing = false;
    private lastProcessedSelection: string = '';

    constructor(
        private codeAnalysis: CodeAnalysisService,
        private decorationManager: CodeDecorationManager,
        private webviewProvider: CodeExplanationWebview,
        private geminiClient: GeminiApiClient,
        private configManager: ConfigManager,
        private errorHandler: ExtensionErrorHandler,
        private context: vscode.ExtensionContext
    ) {
        this.setupEventListeners();
    }

    private setupEventListeners(): void {
        // Listen for text selection changes
        const selectionChangeDisposable = vscode.window.onDidChangeTextEditorSelection(
            this.onSelectionChanged.bind(this)
        );

        // Listen for active editor changes
        const activeEditorChangeDisposable = vscode.window.onDidChangeActiveTextEditor(
            this.onActiveEditorChanged.bind(this)
        );

        // Listen for document changes to clear highlights when code is modified
        const documentChangeDisposable = vscode.workspace.onDidChangeTextDocument(
            this.onDocumentChanged.bind(this)
        );

        // Listen for configuration changes
        const configChangeDisposable = this.configManager.onConfigurationChanged(
            this.onConfigurationChanged.bind(this)
        );

        this.context.subscriptions.push(
            selectionChangeDisposable,
            activeEditorChangeDisposable,
            documentChangeDisposable,
            configChangeDisposable
        );
    }

    private onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
        // Clear any existing debounce timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce the selection change to avoid excessive processing
        this.debounceTimer = setTimeout(() => {
            this.handleSelectionChange(event);
        }, this.debounceDelay);
    }

    private async handleSelectionChange(event: vscode.TextEditorSelectionChangeEvent): Promise<void> {
        const editor = event.textEditor;
        const selection = event.selections[0]; // Use the first selection

        // Skip if already processing or if selection hasn't changed meaningfully
        if (this.isProcessing || !this.shouldProcessSelection(editor, selection)) {
            return;
        }

        try {
            this.isProcessing = true;

            // Check if configuration is valid
            if (!this.configManager.isConfigured()) {
                this.webviewProvider.showConfigurationNeeded();
                this.decorationManager.clearHighlights();
                return;
            }

            // Handle empty selection
            if (selection.isEmpty) {
                this.handleEmptySelection(editor, selection);
                return;
            }

            // Handle line selection
            if (this.isLineSelection(selection)) {
                await this.handleLineSelection(editor, selection);
            } else {
                // Handle multi-line or partial line selection
                await this.handleComplexSelection(editor, selection);
            }

        } catch (error: any) {
            this.errorHandler.handleAnalysisError(error);
        } finally {
            this.isProcessing = false;
        }
    }

    private shouldProcessSelection(editor: vscode.TextEditor, selection: vscode.Selection): boolean {
        // Skip if no editor or document
        if (!editor || !editor.document) {
            return false;
        }

        // Skip for certain file types
        if (this.shouldSkipFileType(editor.document.languageId)) {
            return false;
        }

        // Create a unique identifier for this selection
        const selectionId = `${editor.document.uri.toString()}:${selection.start.line}:${selection.start.character}:${selection.end.line}:${selection.end.character}`;
        
        // Skip if this is the same selection we just processed
        if (selectionId === this.lastProcessedSelection) {
            return false;
        }

        this.lastProcessedSelection = selectionId;
        return true;
    }

    private shouldSkipFileType(languageId: string): boolean {
        const skipTypes = [
            'plaintext',
            'log',
            'output',
            'git-commit',
            'git-rebase',
            'diff'
        ];
        return skipTypes.includes(languageId);
    }

    private isLineSelection(selection: vscode.Selection): boolean {
        // Check if selection spans exactly one line and covers the whole line or is a cursor position
        return selection.start.line === selection.end.line;
    }

    private handleEmptySelection(editor: vscode.TextEditor, selection: vscode.Selection): void {
        // For cursor position, analyze the current line
        const lineNumber = selection.start.line;
        this.analyzeAndHighlightLine(editor, lineNumber);
    }

    private async handleLineSelection(editor: vscode.TextEditor, selection: vscode.Selection): Promise<void> {
        const lineNumber = selection.start.line;
        await this.analyzeAndHighlightLine(editor, lineNumber);
    }

    private async handleComplexSelection(editor: vscode.TextEditor, selection: vscode.Selection): Promise<void> {
        // For multi-line selections, analyze each line and combine results
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        const allRelatedLines = new Set<number>();
        
        // Add all selected lines
        for (let line = startLine; line <= endLine; line++) {
            allRelatedLines.add(line);
            
            // Find related lines for each selected line
            const relatedLines = this.codeAnalysis.findRelatedLines(editor.document, line);
            relatedLines.forEach(relatedLine => allRelatedLines.add(relatedLine));
        }

        // Highlight all related lines
        const sortedLines = Array.from(allRelatedLines).sort((a, b) => a - b);
        this.decorationManager.highlightLines(editor, sortedLines);

        // Generate explanation for the entire selection
        await this.generateExplanationForSelection(editor, selection);
    }

    private async analyzeAndHighlightLine(editor: vscode.TextEditor, lineNumber: number): Promise<void> {
        try {
            // Show loading state
            this.webviewProvider.showLoading();

            // Find related lines
            const relatedLines = this.codeAnalysis.findRelatedLines(editor.document, lineNumber);
            
            // Highlight the lines
            this.decorationManager.highlightLines(editor, relatedLines);

            // Generate explanation
            const selection = new vscode.Selection(lineNumber, 0, lineNumber, 0);
            await this.generateExplanationForSelection(editor, selection);

        } catch (error: any) {
            this.errorHandler.handleAnalysisError(error);
            this.webviewProvider.showError(`Failed to analyze line ${lineNumber + 1}: ${error.message}`);
        }
    }

    private async generateExplanationForSelection(editor: vscode.TextEditor, selection: vscode.Selection): Promise<void> {
        const startTime = Date.now();
        
        try {
            // Log the start of analysis
            console.log(`Starting code analysis for selection at line ${selection.start.line}`);
            
            // Analyze the code selection
            const analysisResult = await this.codeAnalysis.analyzeCodeSelection(editor.document, selection);
            
            // Log analysis results
            console.log(`Code analysis completed. Found ${analysisResult.relatedLines.length} related lines`);
            console.log(`Context: ${analysisResult.context.language}, Function: ${analysisResult.context.functionName || 'none'}, Class: ${analysisResult.context.className || 'none'}`);
            
            // Build the code snippet for explanation
            const codeSnippet = this.buildCodeSnippet(analysisResult.selectedLine, analysisResult.relatedLines);
            
            // Log the code snippet being sent to API
            console.log(`Sending code snippet to Gemini API (${codeSnippet.length} characters)`);
            
            // Generate explanation using Gemini with retry logic
            const explanation = await this.errorHandler.retryWithBackoff(async () => {
                const result = await this.geminiClient.explainCode(codeSnippet, analysisResult.context);
                
                // Validate the response
                if (!result || result.trim().length === 0) {
                    throw new Error('Empty response from Gemini API');
                }
                
                return result;
            });

            // Log successful completion
            const duration = Date.now() - startTime;
            console.log(`Explanation generated successfully in ${duration}ms (${explanation.length} characters)`);

            // Update the webview with the explanation
            this.webviewProvider.updateContent(
                explanation,
                codeSnippet,
                analysisResult.context.language
            );

        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`Explanation generation failed after ${duration}ms:`, error);
            
            // Determine error type and handle appropriately
            if (error.name === 'AnalysisError') {
                this.errorHandler.handleAnalysisError(error);
            } else if (error.name === 'ApiError') {
                this.errorHandler.handleApiError(error);
            } else if (error.name === 'ConfigurationError') {
                this.errorHandler.handleConfigurationError(error);
            } else {
                // Generic error handling
                this.errorHandler.handleApiError(error);
            }
        }
    }

    private buildCodeSnippet(selectedLine: string, relatedLines: string[]): string {
        // Remove duplicates and empty lines
        const uniqueLines = Array.from(new Set([selectedLine, ...relatedLines]))
            .filter(line => line.trim().length > 0);
        
        // Limit the total size to avoid API limits
        const maxSnippetLength = 2000; // Reasonable limit for code snippets
        let snippet = uniqueLines.join('\n');
        
        if (snippet.length > maxSnippetLength) {
            // Truncate while keeping the selected line
            const truncatedLines = [selectedLine];
            let currentLength = selectedLine.length;
            
            for (const line of relatedLines) {
                if (currentLength + line.length + 1 <= maxSnippetLength) {
                    truncatedLines.push(line);
                    currentLength += line.length + 1; // +1 for newline
                } else {
                    break;
                }
            }
            
            snippet = truncatedLines.join('\n');
            if (truncatedLines.length < uniqueLines.length) {
                snippet += '\n// ... (truncated for brevity)';
            }
        }
        
        return snippet;
    }

    private onActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
        if (!editor) {
            // No active editor, clear highlights and show welcome
            this.decorationManager.clearHighlights();
            this.webviewProvider.showWelcome();
            return;
        }

        // Clear highlights when switching editors
        this.decorationManager.clearHighlights();
        
        // Reset processing state
        this.lastProcessedSelection = '';
        
        // If there's a selection in the new editor, process it
        if (!editor.selection.isEmpty) {
            this.onSelectionChanged({
                textEditor: editor,
                selections: [editor.selection],
                kind: vscode.TextEditorSelectionChangeKind.Command
            });
        }
    }

    private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        // Clear highlights when document is modified to avoid stale highlights
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document === event.document) {
            // Only clear if there were actual content changes
            if (event.contentChanges.length > 0) {
                this.decorationManager.clearHighlights();
                this.lastProcessedSelection = ''; // Reset to allow reprocessing
            }
        }
    }

    private onConfigurationChanged(): void {
        // Update Gemini client configuration
        if (this.configManager.isConfigured()) {
            const config = this.configManager.getGeminiConfig();
            this.geminiClient.updateConfig(config);
            
            // If webview is showing configuration needed, switch to welcome
            if (this.webviewProvider.getState() === 'configurationNeeded') {
                this.webviewProvider.showWelcome();
            }
        } else {
            // Configuration removed, show configuration needed
            this.webviewProvider.showConfigurationNeeded();
            this.decorationManager.clearHighlights();
        }
    }

    // Public methods for manual triggering

    public async explainCurrentSelection(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found.');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            // Use current line if no selection
            const lineNumber = selection.start.line;
            await this.analyzeAndHighlightLine(editor, lineNumber);
        } else {
            await this.handleComplexSelection(editor, selection);
        }
    }

    public clearHighlights(): void {
        this.decorationManager.clearHighlights();
    }

    public toggleHighlights(): void {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const highlighted = this.decorationManager.getHighlightedLines(editor);
        if (highlighted.selectedLine !== null || highlighted.relatedLines.length > 0) {
            this.clearHighlights();
        } else {
            // Re-highlight current selection
            this.explainCurrentSelection();
        }
    }

    public dispose(): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.decorationManager.dispose();
    }
}