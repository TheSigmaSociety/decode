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
        
        // Immediately highlight the current line as user's implicit selection
        this.decorationManager.highlightUserSelection(editor, [lineNumber]);
        
        // Generate explanation - AI will identify related lines
        this.analyzeAndHighlightLine(editor, lineNumber);
    }

    private async handleLineSelection(editor: vscode.TextEditor, selection: vscode.Selection): Promise<void> {
        const lineNumber = selection.start.line;
        
        // Immediately highlight the user's selected line
        this.decorationManager.highlightUserSelection(editor, [lineNumber]);
        
        // Generate explanation - AI will identify related lines
        await this.analyzeAndHighlightLine(editor, lineNumber);
    }

    private async handleComplexSelection(editor: vscode.TextEditor, selection: vscode.Selection): Promise<void> {
        // Determine if this is the first request or a subsequent one
        const currentState = this.webviewProvider.getState();
        const hasExistingContent = currentState === 'explanation' && this.webviewProvider.getCurrentExplanation();
        
        if (hasExistingContent) {
            // Show inline loading for subsequent requests
            this.webviewProvider.showInlineLoading();
        } else {
            // Show full loading for first request
            this.webviewProvider.showLoading();
        }

        // For multi-line selections, first highlight the user's actual selection
        const startLine = selection.start.line;
        const endLine = selection.end.line;
        
        // Immediately highlight the user's selection (not related lines yet)
        const userSelectedLines: number[] = [];
        for (let line = startLine; line <= endLine; line++) {
            userSelectedLines.push(line);
        }
        
        // Show the user's selection immediately
        this.decorationManager.highlightUserSelection(editor, userSelectedLines);

        // Generate explanation for the entire selection - AI will identify related lines
        await this.generateExplanationForSelection(editor, selection);
    }

    private async analyzeAndHighlightLine(editor: vscode.TextEditor, lineNumber: number): Promise<void> {
        try {
            // Determine if this is the first request or a subsequent one
            const currentState = this.webviewProvider.getState();
            const hasExistingContent = currentState === 'explanation' && this.webviewProvider.getCurrentExplanation();
            
            if (hasExistingContent) {
                // Show inline loading for subsequent requests
                this.webviewProvider.showInlineLoading();
            } else {
                // Show full loading for first request
                this.webviewProvider.showLoading();
            }

            // Don't pre-find related lines - let the AI identify them
            // The user's selection is already highlighted by the calling method
            
            // Generate explanation
            const selection = new vscode.Selection(lineNumber, 0, lineNumber, editor.document.lineAt(lineNumber).text.length);
            await this.generateExplanationForSelection(editor, selection);

        } catch (error: any) {
            console.error(`Failed to analyze line ${lineNumber + 1}:`, error);
            this.errorHandler.handleAnalysisError(error);
            this.webviewProvider.showError(`Failed to analyze line ${lineNumber + 1}: ${error.message}`);
        }
    }

    private async generateExplanationForSelection(editor: vscode.TextEditor, selection: vscode.Selection): Promise<void> {
        const startTime = Date.now();
        let timeoutId: NodeJS.Timeout | null = null;
        
        try {
            // Log the start of analysis
            console.log(`Starting code analysis for selection at line ${selection.start.line}`);
            
            // Set a timeout to prevent indefinite loading
            timeoutId = setTimeout(() => {
                console.warn('Explanation generation taking too long, showing timeout error');
                this.webviewProvider.showError('Request timed out. The AI service may be temporarily unavailable.');
            }, 30000); // 30 second timeout
            
            // Analyze the code selection
            const analysisResult = await this.codeAnalysis.analyzeCodeSelection(editor.document, selection);
            
            // Log analysis results
            console.log(`Code analysis completed. Found ${analysisResult.relatedLines.length} related lines`);
            console.log(`Context: ${analysisResult.context.language}, Function: ${analysisResult.context.functionName || 'none'}, Class: ${analysisResult.context.className || 'none'}`);
            
            // Get the entire file content for full context
            const fullFileContent = editor.document.getText();
            const selectedText = editor.document.getText(selection);
            const startLine = selection.start.line;
            const endLine = selection.end.line;
            
            // Build enhanced context with full file and selection markers
            const enhancedContext = this.buildEnhancedContext(
                fullFileContent, 
                selectedText, 
                startLine, 
                endLine, 
                analysisResult.context
            );
            
            console.log(`Sending full file context to Gemini API (${enhancedContext.length} characters)`);
            console.log(`Selected text: "${selectedText}" (lines ${startLine + 1}-${endLine + 1})`);
            console.log('Context preview (first 500 chars):', enhancedContext.substring(0, 500) + '...');
            
            // Generate explanation using Gemini with retry logic
            const explanation = await this.errorHandler.retryWithBackoff(async () => {
                const result = await this.geminiClient.explainCode(enhancedContext, analysisResult.context);
                
                // Validate the response
                if (!result || result.trim().length === 0) {
                    throw new Error('Empty response from Gemini API');
                }
                
                return result;
            });

            // Clear timeout if we got here successfully
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }

            // Log successful completion
            const duration = Date.now() - startTime;
            console.log(`Explanation generated successfully in ${duration}ms (${explanation.length} characters)`);

            // Parse the explanation for related lines identified by the AI
            const relatedLines = this.parseRelatedLinesFromExplanation(explanation);
            if (relatedLines.length > 0) {
                console.log(`AI identified ${relatedLines.length} related lines:`, relatedLines);
                this.decorationManager.addRelatedLines(editor, relatedLines);
            }

            // Hide inline loading before updating content
            this.webviewProvider.hideInlineLoading();

            // Update the webview with the explanation
            this.webviewProvider.updateContent(
                explanation,
                selectedText,
                analysisResult.context.language
            );

        } catch (error: any) {
            // Clear timeout if set
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            
            const duration = Date.now() - startTime;
            console.error(`Explanation generation failed after ${duration}ms:`, error);
            
            // Always show error in webview to clear loading state
            let errorMessage = 'Failed to generate explanation';
            
            // Determine error type and handle appropriately
            if (error.name === 'AnalysisError') {
                errorMessage = `Code analysis error: ${error.message}`;
                this.errorHandler.handleAnalysisError(error);
            } else if (error.name === 'ApiError') {
                errorMessage = `API error: ${error.message}`;
                this.errorHandler.handleApiError(error);
            } else if (error.name === 'ConfigurationError') {
                errorMessage = `Configuration error: ${error.message}`;
                this.errorHandler.handleConfigurationError(error);
            } else {
                // Generic error handling
                errorMessage = `Unexpected error: ${error.message || 'Unknown error occurred'}`;
                this.errorHandler.handleApiError(error);
            }
            
            // Ensure webview shows error instead of staying in loading state
            this.webviewProvider.showError(errorMessage);
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

    private buildEnhancedContext(
        fullFileContent: string, 
        selectedText: string, 
        startLine: number, 
        endLine: number, 
        context: any
    ): string {
        const lines = fullFileContent.split('\n');
        const maxContextLength = 8000; // Reasonable limit for API calls
        
        // If the file is small enough, send the whole thing with line numbers
        if (fullFileContent.length <= maxContextLength) {
            // Add line numbers and selection markers
            const markedLines = lines.map((line, index) => {
                const lineNumber = index + 1; // 1-based line numbers
                if (index >= startLine && index <= endLine) {
                    return `${lineNumber}: >>> ${line} <<<  // [SELECTED BY USER]`;
                }
                return `${lineNumber}: ${line}`;
            });
            
            return markedLines.join('\n');
        }
        
        // For larger files, include context around the selection WITH ACTUAL LINE NUMBERS
        const contextRadius = 20; // Lines of context before and after selection
        const contextStart = Math.max(0, startLine - contextRadius);
        const contextEnd = Math.min(lines.length - 1, endLine + contextRadius);
        
        let contextLines: string[] = [];
        
        // Add context info
        contextLines.push(`// Context: Lines ${contextStart + 1}-${contextEnd + 1} of ${lines.length} total lines`);
        contextLines.push(`// Selected: Lines ${startLine + 1}-${endLine + 1}`);
        contextLines.push('');
        
        // Add the contextual code with ACTUAL line numbers and selection markers
        for (let i = contextStart; i <= contextEnd; i++) {
            const lineNumber = i + 1; // 1-based line numbers
            if (i >= startLine && i <= endLine) {
                contextLines.push(`${lineNumber}: >>> ${lines[i]} <<<  // [SELECTED BY USER]`);
            } else {
                contextLines.push(`${lineNumber}: ${lines[i]}`);
            }
        }
        
        return contextLines.join('\n');
    }

    private parseRelatedLinesFromExplanation(explanation: string): number[] {
        const relatedLines: number[] = [];
        
        // Look for all line references in the format "Lines X-Y:" or "Line X:"
        const lineReferences = explanation.match(/^lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?:/gmi);
        if (lineReferences) {
            for (const ref of lineReferences) {
                const rangeMatch = ref.match(/^lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?:/i);
                if (rangeMatch) {
                    const start = parseInt(rangeMatch[1]) - 1; // Convert to 0-based
                    const end = rangeMatch[2] ? parseInt(rangeMatch[2]) - 1 : start;
                    
                    // Add all lines in the range
                    for (let line = start; line <= end; line++) {
                        if (line >= 0 && !relatedLines.includes(line)) {
                            relatedLines.push(line);
                        }
                    }
                }
            }
        }
        
        // Also try to find explicit "Related lines" sections (legacy format)
        const relatedSectionMatch = explanation.match(/related\s+lines?[:\s]*([^\n]*)/gi);
        if (relatedSectionMatch && relatedLines.length === 0) {
            for (const match of relatedSectionMatch) {
                // Look for ranges like "10-15" or "10, 12, 15-18"
                const content = match.toLowerCase().replace('related lines:', '').trim();
                
                // Split by commas to handle multiple ranges/numbers
                const parts = content.split(/[,;]\s*/);
                
                for (const part of parts) {
                    // Check if it's a range (e.g., "10-15")
                    const rangeMatch = part.match(/(\d+)\s*[-–]\s*(\d+)/);
                    if (rangeMatch) {
                        const start = parseInt(rangeMatch[1]) - 1; // Convert to 0-based
                        const end = parseInt(rangeMatch[2]) - 1;
                        
                        // Add all lines in the range
                        for (let line = start; line <= end; line++) {
                            if (line >= 0 && !relatedLines.includes(line)) {
                                relatedLines.push(line);
                            }
                        }
                    } else {
                        // Single line number
                        const singleMatch = part.match(/\d+/);
                        if (singleMatch) {
                            const lineNum = parseInt(singleMatch[0]) - 1;
                            if (lineNum >= 0 && !relatedLines.includes(lineNum)) {
                                relatedLines.push(lineNum);
                            }
                        }
                    }
                }
            }
        }

        console.log(`Parsed related lines from explanation:`, relatedLines.map(l => l + 1)); // Log as 1-based for readability
        return relatedLines.sort((a, b) => a - b);
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