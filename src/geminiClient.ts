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
            console.log('Sending request to Gemini API...');
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

            console.log('Received response from Gemini API:', response.text ? 'Success' : 'Empty');

            if (!response.text || response.text.trim().length === 0) {
                throw new ApiError('Empty response from Gemini API', undefined, true);
            }

            return response.text;
        } catch (error: any) {
            console.error('Gemini API Error:', error);
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
            console.error('API key validation error:', error);
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
        let prompt = `Analyze the selected code (marked with >>>) and provide a concise explanation.

**Code with line numbers:**
\`\`\`${context.language}
${codeSnippet}
\`\`\`

**Instructions:**
1. Focus ONLY on the selected code (marked with >>>)
2. Be concise - 3-5 short paragraphs maximum
3. If you identify related lines that help understand the selected code, mention their line numbers
4. Use the surrounding code as context but don't explain it unless directly relevant
5. Use compact formatting - no extra blank lines between sections

**Response format (no extra spacing):**
## Purpose
Brief explanation of what the selected code does.
## How it works
Concise explanation of the mechanism.
## Related lines
If applicable: "Lines X-Y: brief explanation" or "Lines X, Y: brief explanation"

Keep it focused and under 300 words. Use compact formatting.`;

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