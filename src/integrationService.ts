import * as vscode from 'vscode';
import { CodeAnalysisService } from './codeAnalysis';
import { GeminiApiClient } from './geminiClient';
import { CodeExplanationWebview } from './webviewProvider';
import { ExtensionErrorHandler } from './errorHandler';
import { CodeAnalysisResult, CodeContext, ApiError, AnalysisError } from './types';

/**
 * Service that orchestrates the integration between code analysis and API client
 */
export class IntegrationService {
    constructor(
        private codeAnalysis: CodeAnalysisService,
        private geminiClient: GeminiApiClient,
        private webviewProvider: CodeExplanationWebview,
        private errorHandler: ExtensionErrorHandler
    ) {}

    /**
     * Main integration method that connects code analysis to API client
     */
    async processCodeExplanation(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): Promise<{ success: boolean; explanation?: string; error?: string }> {
        const startTime = Date.now();
        
        try {
            // Step 1: Analyze the code
            const analysisResult = await this.analyzeCode(document, selection);
            
            // Step 2: Generate explanation
            const explanation = await this.generateExplanation(analysisResult);
            
            // Step 3: Update UI
            await this.updateUserInterface(explanation, analysisResult);
            
            const duration = Date.now() - startTime;
            console.log(`Code explanation process completed successfully in ${duration}ms`);
            
            return { success: true, explanation };
            
        } catch (error: any) {
            const duration = Date.now() - startTime;
            console.error(`Code explanation process failed after ${duration}ms:`, error);
            
            const errorMessage = this.handleProcessingError(error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Analyze code and extract context
     */
    private async analyzeCode(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): Promise<CodeAnalysisResult> {
        try {
            console.log(`Analyzing code selection: ${document.languageId} at line ${selection.start.line}`);
            
            const result = await this.codeAnalysis.analyzeCodeSelection(document, selection);
            
            // Validate analysis result
            this.validateAnalysisResult(result);
            
            console.log(`Analysis complete: ${result.relatedLines.length} related lines found`);
            return result;
            
        } catch (error: any) {
            throw new AnalysisError(`Code analysis failed: ${error.message}`, selection.start.line);
        }
    }

    /**
     * Generate explanation using the API client
     */
    private async generateExplanation(analysisResult: CodeAnalysisResult): Promise<string> {
        try {
            // Prepare code snippet
            const codeSnippet = this.prepareCodeSnippet(analysisResult);
            
            // Enhance context with additional metadata
            const enhancedContext = this.enhanceContext(analysisResult.context);
            
            console.log(`Generating explanation for ${enhancedContext.language} code (${codeSnippet.length} chars)`);
            
            // Call API with retry logic
            const explanation = await this.errorHandler.retryWithBackoff(async () => {
                const result = await this.geminiClient.explainCode(codeSnippet, enhancedContext);
                
                // Validate API response
                this.validateApiResponse(result);
                
                return result;
            });
            
            console.log(`Explanation generated: ${explanation.length} characters`);
            return explanation;
            
        } catch (error: any) {
            if (error instanceof ApiError) {
                throw error;
            }
            throw new ApiError(`Failed to generate explanation: ${error.message}`);
        }
    }

    /**
     * Update the user interface with the explanation
     */
    private async updateUserInterface(explanation: string, analysisResult: CodeAnalysisResult): Promise<void> {
        try {
            const codeSnippet = this.prepareCodeSnippet(analysisResult);
            
            this.webviewProvider.updateContent(
                explanation,
                codeSnippet,
                analysisResult.context.language
            );
            
            console.log('UI updated successfully');
            
        } catch (error: any) {
            console.error('Failed to update UI:', error);
            throw new Error(`UI update failed: ${error.message}`);
        }
    }

    /**
     * Prepare code snippet for API consumption
     */
    private prepareCodeSnippet(analysisResult: CodeAnalysisResult): string {
        const allLines = [analysisResult.selectedLine, ...analysisResult.relatedLines];
        
        // Remove duplicates and empty lines
        const uniqueLines = Array.from(new Set(allLines))
            .filter(line => line.trim().length > 0)
            .map(line => line.trim());
        
        // Sort lines to maintain logical order if possible
        // This is a simple heuristic - in a real implementation, you might want
        // to preserve the original line order from the document
        const sortedLines = this.sortCodeLines(uniqueLines, analysisResult);
        
        return sortedLines.join('\n');
    }

    /**
     * Sort code lines to maintain logical flow
     */
    private sortCodeLines(lines: string[], analysisResult: CodeAnalysisResult): string[] {
        // Simple sorting: selected line first, then related lines
        const selectedLine = analysisResult.selectedLine.trim();
        const otherLines = lines.filter(line => line !== selectedLine);
        
        return [selectedLine, ...otherLines];
    }

    /**
     * Enhance context with additional metadata
     */
    private enhanceContext(context: CodeContext): CodeContext {
        return {
            ...context,
            // Add any additional context enhancement here
            variables: [...new Set(context.variables)], // Remove duplicates
            imports: [...new Set(context.imports)] // Remove duplicates
        };
    }

    /**
     * Validate analysis result
     */
    private validateAnalysisResult(result: CodeAnalysisResult): void {
        if (!result.selectedLine || result.selectedLine.trim().length === 0) {
            throw new Error('Selected line is empty or invalid');
        }
        
        if (!result.context || !result.context.language) {
            throw new Error('Code context is missing or invalid');
        }
        
        if (!Array.isArray(result.relatedLines)) {
            throw new Error('Related lines array is invalid');
        }
    }

    /**
     * Validate API response
     */
    private validateApiResponse(response: string): void {
        if (!response || typeof response !== 'string') {
            throw new Error('Invalid API response format');
        }
        
        if (response.trim().length === 0) {
            throw new Error('Empty API response');
        }
        
        if (response.length < 10) {
            throw new Error('API response too short to be meaningful');
        }
        
        // Check for common error indicators in the response
        const errorIndicators = [
            'error',
            'failed',
            'unable to',
            'cannot process',
            'invalid request'
        ];
        
        const lowerResponse = response.toLowerCase();
        for (const indicator of errorIndicators) {
            if (lowerResponse.includes(indicator)) {
                console.warn(`Potential error in API response: contains "${indicator}"`);
            }
        }
    }

    /**
     * Handle processing errors with appropriate error types
     */
    private handleProcessingError(error: any): string {
        if (error instanceof AnalysisError) {
            this.errorHandler.handleAnalysisError(error);
            return `Code analysis error: ${error.message}`;
        }
        
        if (error instanceof ApiError) {
            this.errorHandler.handleApiError(error);
            return `API error: ${error.message}`;
        }
        
        // Generic error
        console.error('Unexpected error in code explanation process:', error);
        return `Unexpected error: ${error.message || 'Unknown error occurred'}`;
    }

    /**
     * Get processing statistics
     */
    getProcessingStats(): {
        totalProcessed: number;
        successfulProcessed: number;
        failedProcessed: number;
        averageProcessingTime: number;
    } {
        // This would be implemented with actual tracking in a real system
        return {
            totalProcessed: 0,
            successfulProcessed: 0,
            failedProcessed: 0,
            averageProcessingTime: 0
        };
    }

    /**
     * Test the integration pipeline
     */
    async testIntegration(): Promise<{ success: boolean; message: string }> {
        try {
            // Create a simple test case
            const testDocument = {
                languageId: 'javascript',
                lineAt: (line: number) => ({ text: 'console.log("test");' }),
                lineCount: 1
            } as any;
            
            const testSelection = new vscode.Selection(0, 0, 0, 20);
            
            const result = await this.processCodeExplanation(testDocument, testSelection);
            
            if (result.success) {
                return { success: true, message: 'Integration test passed' };
            } else {
                return { success: false, message: `Integration test failed: ${result.error}` };
            }
            
        } catch (error: any) {
            return { success: false, message: `Integration test error: ${error.message}` };
        }
    }
}