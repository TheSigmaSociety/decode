import { GoogleGenAI } from '@google/genai';
import { GeminiClient, GeminiConfig, CodeContext, ApiError } from './types';

export class GeminiApiClient implements GeminiClient {
    private client: GoogleGenAI | null = null;
    private config: GeminiConfig | null = null;

    constructor(config?: GeminiConfig) {
        if (config) {
            this.updateConfig(config);
        }
    }

    updateConfig(config: GeminiConfig): void {
        this.config = config;
        this.client = new GoogleGenAI({ apiKey: config.apiKey });
    }

    async explainCode(codeSnippet: string, context: CodeContext): Promise<string> {
        if (!this.client || !this.config) {
            throw new ApiError('Gemini client not configured', undefined, false);
        }

        try {
            const prompt = this.buildExplanationPrompt(codeSnippet, context);
            
            const response = await this.client.models.generateContent({
                model: this.config.model,
                contents: prompt,
                config: {
                    temperature: this.config.temperature,
                    maxOutputTokens: this.config.maxTokens,
                    topP: 0.8,
                    topK: 40
                }
            });

            if (!response.text) {
                throw new ApiError('Empty response from Gemini API', undefined, true);
            }

            return response.text;
        } catch (error: any) {
            this.handleApiError(error);
            throw error; // Re-throw after handling
        }
    }

    async validateApiKey(apiKey: string): Promise<boolean> {
        try {
            const testClient = new GoogleGenAI({ apiKey });
            
            // Make a minimal request to test the API key
            const response = await testClient.models.generateContent({
                model: 'gemini-2.0-flash-001',
                contents: 'Hello',
                config: {
                    maxOutputTokens: 10
                }
            });

            return response.text !== undefined;
        } catch (error: any) {
            // API key is invalid if we get authentication errors
            if (error.status === 401 || error.status === 403) {
                return false;
            }
            
            // For other errors, we can't determine validity, so assume it might be valid
            // but there's a temporary issue
            return true;
        }
    }

    private buildExplanationPrompt(codeSnippet: string, context: CodeContext): string {
        let prompt = `You are a helpful programming assistant. Please explain the following code in plain English, focusing on what it does and how it works.

**Code to explain:**
\`\`\`${context.language}
${codeSnippet}
\`\`\`

**Context:**`;

        if (context.functionName) {
            prompt += `\n- This code is part of the function: ${context.functionName}`;
        }

        if (context.className) {
            prompt += `\n- This code is part of the class: ${context.className}`;
        }

        if (context.variables.length > 0) {
            prompt += `\n- Related variables: ${context.variables.join(', ')}`;
        }

        if (context.imports.length > 0) {
            prompt += `\n- Relevant imports: ${context.imports.join(', ')}`;
        }

        prompt += `\n- Programming language: ${context.language}`;

        prompt += `\n\n**Please provide:**
1. A clear explanation of what this code does
2. How the different parts work together
3. Any important concepts or patterns used
4. Potential side effects or important behavior

Keep the explanation concise but comprehensive, suitable for a developer trying to understand the code.`;

        return prompt;
    }

    private handleApiError(error: any): void {
        let message = 'Unknown API error occurred';
        let statusCode: number | undefined;
        let retryable = false;

        if (error.status) {
            statusCode = error.status;
            
            switch (error.status) {
                case 400:
                    message = 'Invalid request to Gemini API';
                    break;
                case 401:
                    message = 'Invalid or expired API key';
                    break;
                case 403:
                    message = 'API key does not have permission to access Gemini';
                    break;
                case 429:
                    message = 'Rate limit exceeded. Please try again later';
                    retryable = true;
                    break;
                case 500:
                case 502:
                case 503:
                case 504:
                    message = 'Gemini API is temporarily unavailable';
                    retryable = true;
                    break;
                default:
                    message = `Gemini API error: ${error.message || 'Unknown error'}`;
            }
        } else if (error.message) {
            message = error.message;
            
            // Check for network-related errors that might be retryable
            if (error.message.includes('network') || 
                error.message.includes('timeout') || 
                error.message.includes('ECONNRESET')) {
                retryable = true;
            }
        }

        // Convert to our custom ApiError
        if (!(error instanceof ApiError)) {
            const apiError = new ApiError(message, statusCode, retryable);
            // Copy the original error as a property for debugging
            (apiError as any).originalError = error;
            throw apiError;
        }
    }

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        if (!this.client || !this.config) {
            return { success: false, error: 'Client not configured' };
        }

        try {
            await this.explainCode('console.log("test");', {
                language: 'javascript',
                variables: [],
                imports: []
            });
            return { success: true };
        } catch (error: any) {
            return { 
                success: false, 
                error: error instanceof ApiError ? error.message : 'Connection test failed'
            };
        }
    }

    dispose(): void {
        this.client = null;
        this.config = null;
    }
}