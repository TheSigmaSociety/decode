import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { ConfigurationError } from './types';

export class CommandManager {
    private selectionHandler?: any; // Will be injected later

    constructor(
        private configManager: ConfigManager,
        private context: vscode.ExtensionContext
    ) {}

    setSelectionHandler(selectionHandler: any): void {
        this.selectionHandler = selectionHandler;
    }

    registerCommands(): void {
        // Register the set API key command
        const setApiKeyCommand = vscode.commands.registerCommand(
            'aiCodeExplanation.setApiKey',
            this.handleSetApiKey.bind(this)
        );

        // Register the explain code command
        const explainCodeCommand = vscode.commands.registerCommand(
            'aiCodeExplanation.explainCode',
            this.handleExplainCode.bind(this)
        );

        // Register the show configuration guide command
        const showGuideCommand = vscode.commands.registerCommand(
            'aiCodeExplanation.showConfigurationGuide',
            this.handleShowConfigurationGuide.bind(this)
        );

        // Register the trigger explanation command (internal)
        const triggerExplanationCommand = vscode.commands.registerCommand(
            'aiCodeExplanation.triggerExplanation',
            this.handleTriggerExplanation.bind(this)
        );

        this.context.subscriptions.push(setApiKeyCommand, explainCodeCommand, showGuideCommand, triggerExplanationCommand);
    }

    private async handleSetApiKey(): Promise<void> {
        try {
            const currentApiKey = this.configManager.getApiKey();
            const hasExistingKey = currentApiKey !== undefined;

            let message = 'Enter your Gemini API key';
            if (hasExistingKey) {
                message = 'Update your Gemini API key (current key will be replaced)';
            }

            const apiKey = await vscode.window.showInputBox({
                prompt: message,
                placeHolder: 'Your Gemini API key from Google AI Studio',
                password: true,
                ignoreFocusOut: true,
                value: hasExistingKey ? '••••••••••••••••••••' : '',
                validateInput: (value: string) => {
                    if (!value || value.trim() === '') {
                        return 'API key cannot be empty';
                    }
                    // Skip validation if user hasn't changed the masked value
                    if (hasExistingKey && value === '••••••••••••••••••••') {
                        return null;
                    }
                    return this.validateApiKeyInput(value);
                }
            });

            if (apiKey && apiKey !== '••••••••••••••••••••') {
                await this.configManager.setApiKey(apiKey);
                vscode.window.showInformationMessage(
                    hasExistingKey 
                        ? 'Gemini API key updated successfully!' 
                        : 'Gemini API key saved successfully!'
                );
            } else if (apiKey === '••••••••••••••••••••') {
                vscode.window.showInformationMessage('API key unchanged.');
            }
        } catch (error) {
            if (error instanceof ConfigurationError) {
                vscode.window.showErrorMessage(`Configuration Error: ${error.message}`);
            } else {
                vscode.window.showErrorMessage('Failed to set API key. Please try again.');
            }
        }
    }

    private async handleExplainCode(): Promise<void> {
        if (!this.configManager.isConfigured()) {
            const action = await vscode.window.showWarningMessage(
                'AI Code Explanation is not configured. Please set your Gemini API key first.',
                'Set API Key',
                'Cancel'
            );

            if (action === 'Set API Key') {
                await this.handleSetApiKey();
            }
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active editor found. Please open a file and select some code.');
            return;
        }

        const selection = editor.selection;
        if (selection.isEmpty) {
            vscode.window.showInformationMessage('Please select some code to explain.');
            return;
        }

        // Trigger explanation through the selection handler
        if (this.selectionHandler) {
            await this.selectionHandler.explainCurrentSelection();
        } else {
            vscode.window.showWarningMessage('Extension is still initializing. Please try again in a moment.');
        }
    }

    private async handleShowConfigurationGuide(): Promise<void> {
        await this.configManager.showConfigurationGuide();
    }

    private validateApiKeyInput(apiKey: string): string | null {
        const trimmed = apiKey.trim();
        
        if (trimmed.length < 20) {
            return 'API key appears to be too short';
        }
        
        if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
            return 'API key contains invalid characters';
        }
        
        return null;
    }

    async checkInitialConfiguration(): Promise<void> {
        // Check if this is the first time the extension is being used
        const hasShownWelcome = this.context.globalState.get<boolean>('hasShownWelcome', false);
        
        if (!hasShownWelcome) {
            await this.context.globalState.update('hasShownWelcome', true);
            
            if (!this.configManager.isConfigured()) {
                // Show welcome message and configuration guide
                const action = await vscode.window.showInformationMessage(
                    'Welcome to AI Code Explanation! This extension helps you understand code using AI. To get started, you\'ll need a Gemini API key.',
                    'Set Up Now',
                    'Learn More',
                    'Later'
                );

                switch (action) {
                    case 'Set Up Now':
                        await this.handleSetApiKey();
                        break;
                    case 'Learn More':
                        await this.handleShowConfigurationGuide();
                        break;
                }
            }
        } else if (!this.configManager.isConfigured()) {
            // Show a less intrusive reminder for returning users
            const action = await vscode.window.showWarningMessage(
                'AI Code Explanation requires configuration to work.',
                'Configure Now'
            );

            if (action === 'Configure Now') {
                await this.handleSetApiKey();
            }
        }
    }

    private async handleTriggerExplanation(): Promise<void> {
        if (this.selectionHandler) {
            await this.selectionHandler.explainCurrentSelection();
        }
    }

    dispose(): void {
        // Cleanup if needed
    }
}