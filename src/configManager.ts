import * as vscode from 'vscode';
import { ConfigurationManager, ConfigurationError, GeminiConfig } from './types';

export class ConfigManager implements ConfigurationManager {
    private static readonly CONFIG_SECTION = 'aiCodeExplanation';
    private static readonly API_KEY_CONFIG = 'geminiApiKey';
    private static readonly MODEL_CONFIG = 'model';
    private static readonly TEMPERATURE_CONFIG = 'temperature';
    private static readonly MAX_TOKENS_CONFIG = 'maxTokens';

    constructor(private context: vscode.ExtensionContext) {}

    getApiKey(): string | undefined {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        const apiKey = config.get<string>(ConfigManager.API_KEY_CONFIG);
        return apiKey && apiKey.trim() !== '' ? apiKey : undefined;
    }

    async setApiKey(apiKey: string): Promise<void> {
        if (!this.validateApiKeyFormat(apiKey)) {
            throw new ConfigurationError('Invalid API key format', 'INVALID_FORMAT');
        }

        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        await config.update(ConfigManager.API_KEY_CONFIG, apiKey, vscode.ConfigurationTarget.Global);
    }

    isConfigured(): boolean {
        const apiKey = this.getApiKey();
        return apiKey !== undefined && apiKey.length > 0;
    }

    async promptForApiKey(): Promise<string | undefined> {
        const apiKey = await vscode.window.showInputBox({
            prompt: 'Enter your Gemini API key',
            placeHolder: 'Your Gemini API key from Google AI Studio',
            password: true,
            ignoreFocusOut: true,
            validateInput: (value: string) => {
                if (!value || value.trim() === '') {
                    return 'API key cannot be empty';
                }
                if (!this.validateApiKeyFormat(value)) {
                    return 'Invalid API key format';
                }
                return null;
            }
        });

        if (apiKey) {
            await this.setApiKey(apiKey);
            vscode.window.showInformationMessage('Gemini API key saved successfully!');
        }

        return apiKey;
    }

    getGeminiConfig(): GeminiConfig {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        const apiKey = this.getApiKey();
        
        if (!apiKey) {
            throw new ConfigurationError('API key not configured', 'MISSING_API_KEY');
        }

        return {
            apiKey,
            model: config.get<string>(ConfigManager.MODEL_CONFIG) || 'gemini-2.0-flash-001',
            temperature: config.get<number>(ConfigManager.TEMPERATURE_CONFIG) || 0.3,
            maxTokens: config.get<number>(ConfigManager.MAX_TOKENS_CONFIG) || 1000
        };
    }

    async updateConfiguration(updates: Partial<GeminiConfig>): Promise<void> {
        const config = vscode.workspace.getConfiguration(ConfigManager.CONFIG_SECTION);
        
        if (updates.apiKey !== undefined) {
            await this.setApiKey(updates.apiKey);
        }
        
        if (updates.model !== undefined) {
            await config.update(ConfigManager.MODEL_CONFIG, updates.model, vscode.ConfigurationTarget.Global);
        }
        
        if (updates.temperature !== undefined) {
            await config.update(ConfigManager.TEMPERATURE_CONFIG, updates.temperature, vscode.ConfigurationTarget.Global);
        }
        
        if (updates.maxTokens !== undefined) {
            await config.update(ConfigManager.MAX_TOKENS_CONFIG, updates.maxTokens, vscode.ConfigurationTarget.Global);
        }
    }

    private validateApiKeyFormat(apiKey: string): boolean {
        // Basic validation for Gemini API key format
        // Gemini API keys typically start with 'AIza' and are around 39 characters long
        const trimmed = apiKey.trim();
        return trimmed.length >= 20 && /^[A-Za-z0-9_-]+$/.test(trimmed);
    }

    async showConfigurationGuide(): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            'AI Code Explanation requires a Gemini API key to function. Would you like to set it up now?',
            'Set API Key',
            'Learn More',
            'Later'
        );

        switch (action) {
            case 'Set API Key':
                await this.promptForApiKey();
                break;
            case 'Learn More':
                vscode.env.openExternal(vscode.Uri.parse('https://ai.google.dev/gemini-api/docs/api-key'));
                break;
        }
    }

    onConfigurationChanged(callback: () => void): vscode.Disposable {
        return vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(ConfigManager.CONFIG_SECTION)) {
                callback();
            }
        });
    }
}