import * as vscode from 'vscode';
import { ErrorHandler, ConfigurationError, ApiError, AnalysisError } from './types';

export class ExtensionErrorHandler implements ErrorHandler {
    private static readonly MAX_RETRIES = 3;
    private static readonly BASE_DELAY = 1000; // 1 second

    constructor(private outputChannel: vscode.OutputChannel) {}

    handleConfigurationError(error: ConfigurationError): void {
        this.logError('Configuration Error', error);

        switch (error.code) {
            case 'MISSING_API_KEY':
                vscode.window.showErrorMessage(
                    'Gemini API key is not configured. Please set your API key in the extension settings.',
                    'Set API Key'
                ).then(action => {
                    if (action === 'Set API Key') {
                        vscode.commands.executeCommand('aiCodeExplanation.setApiKey');
                    }
                });
                break;

            case 'INVALID_FORMAT':
                vscode.window.showErrorMessage(
                    'The provided API key format is invalid. Please check your API key and try again.',
                    'Set API Key'
                ).then(action => {
                    if (action === 'Set API Key') {
                        vscode.commands.executeCommand('aiCodeExplanation.setApiKey');
                    }
                });
                break;

            default:
                vscode.window.showErrorMessage(`Configuration error: ${error.message}`);
        }
    }

    handleApiError(error: ApiError): void {
        this.logError('API Error', error);

        if (error.statusCode === 401 || error.statusCode === 403) {
            vscode.window.showErrorMessage(
                'Invalid API key. Please check your Gemini API key.',
                'Update API Key'
            ).then(action => {
                if (action === 'Update API Key') {
                    vscode.commands.executeCommand('aiCodeExplanation.setApiKey');
                }
            });
        } else if (error.statusCode === 429) {
            vscode.window.showWarningMessage(
                'Rate limit exceeded. Please wait a moment before trying again.'
            );
        } else if (error.retryable) {
            vscode.window.showWarningMessage(
                'Temporary API issue. The request will be retried automatically.'
            );
        } else {
            vscode.window.showErrorMessage(
                `API Error: ${error.message}`,
                'Retry'
            ).then(action => {
                if (action === 'Retry') {
                    // Trigger a retry by re-executing the explain command
                    vscode.commands.executeCommand('aiCodeExplanation.explainCode');
                }
            });
        }
    }

    handleAnalysisError(error: AnalysisError): void {
        this.logError('Analysis Error', error);

        let message = `Code analysis failed: ${error.message}`;
        if (error.lineNumber) {
            message += ` (Line ${error.lineNumber})`;
        }

        vscode.window.showWarningMessage(message);
    }

    private logError(category: string, error: Error): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${category}: ${error.message}`);
        
        if (error.stack) {
            this.outputChannel.appendLine(`Stack trace: ${error.stack}`);
        }

        // Log additional properties for custom error types
        if (error instanceof ConfigurationError) {
            this.outputChannel.appendLine(`Error code: ${error.code}`);
        } else if (error instanceof ApiError) {
            this.outputChannel.appendLine(`Status code: ${error.statusCode || 'N/A'}`);
            this.outputChannel.appendLine(`Retryable: ${error.retryable}`);
        } else if (error instanceof AnalysisError) {
            this.outputChannel.appendLine(`Line number: ${error.lineNumber || 'N/A'}`);
        }
    }

    async retryWithBackoff<T>(
        operation: () => Promise<T>,
        maxRetries: number = ExtensionErrorHandler.MAX_RETRIES
    ): Promise<T> {
        let lastError: Error;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error: any) {
                lastError = error;

                // Don't retry non-retryable errors
                if (error instanceof ApiError && !error.retryable) {
                    throw error;
                }

                if (error instanceof ConfigurationError) {
                    throw error;
                }

                // Don't retry on the last attempt
                if (attempt === maxRetries) {
                    break;
                }

                // Calculate delay with exponential backoff
                const delay = ExtensionErrorHandler.BASE_DELAY * Math.pow(2, attempt);
                this.outputChannel.appendLine(
                    `Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${error.message}`
                );

                await this.sleep(delay);
            }
        }

        throw lastError!;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    showGenericError(message: string, actions?: string[]): Thenable<string | undefined> {
        if (actions && actions.length > 0) {
            return vscode.window.showErrorMessage(message, ...actions);
        } else {
            return vscode.window.showErrorMessage(message);
        }
    }

    showGenericWarning(message: string, actions?: string[]): Thenable<string | undefined> {
        if (actions && actions.length > 0) {
            return vscode.window.showWarningMessage(message, ...actions);
        } else {
            return vscode.window.showWarningMessage(message);
        }
    }

    showGenericInfo(message: string, actions?: string[]): Thenable<string | undefined> {
        if (actions && actions.length > 0) {
            return vscode.window.showInformationMessage(message, ...actions);
        } else {
            return vscode.window.showInformationMessage(message);
        }
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}