import * as vscode from 'vscode';
import { CodeExplanationWebview } from './webviewProvider';
import { CodeAnalysisService } from './codeAnalysis';
import { CodeDecorationManager } from './decorationManager';
import { GeminiApiClient } from './geminiClient';
import { ConfigManager } from './configManager';
import { ExtensionErrorHandler } from './errorHandler';
import { CommandManager } from './commands';
import { SelectionHandler } from './selectionHandler';
import { IntegrationService } from './integrationService';

// Global extension state
let extensionContext: vscode.ExtensionContext;
let outputChannel: vscode.OutputChannel;
let webviewProvider: CodeExplanationWebview;
let codeAnalysis: CodeAnalysisService;
let decorationManager: CodeDecorationManager;
let geminiClient: GeminiApiClient;
let configManager: ConfigManager;
let errorHandler: ExtensionErrorHandler;
let commandManager: CommandManager;
let selectionHandler: SelectionHandler;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
    console.log('AI Code Explanation extension is being activated...');
    
    try {
        // Store context globally
        extensionContext = context;
        
        // Initialize output channel for logging
        outputChannel = vscode.window.createOutputChannel('AI Code Explanation');
        context.subscriptions.push(outputChannel);
        
        // Log activation
        outputChannel.appendLine('Extension activation started');
        
        // Initialize core services
        await initializeServices(context);
        
        // Register webview provider
        registerWebviewProvider(context);
        
        // Register commands
        registerCommands();
        
        // Initialize selection handling
        initializeSelectionHandling();
        
        // Perform initial configuration check
        await performInitialSetup();
        
        // Show activation success
        outputChannel.appendLine('Extension activated successfully');
        console.log('AI Code Explanation extension activated successfully');
        
    } catch (error: any) {
        const errorMessage = `Failed to activate AI Code Explanation extension: ${error.message}`;
        outputChannel.appendLine(errorMessage);
        console.error(errorMessage, error);
        
        // Show error to user
        vscode.window.showErrorMessage(
            'Failed to activate AI Code Explanation extension. Check the output panel for details.',
            'Show Output'
        ).then(action => {
            if (action === 'Show Output') {
                outputChannel.show();
            }
        });
        
        throw error;
    }
}

async function initializeServices(context: vscode.ExtensionContext): Promise<void> {
    outputChannel.appendLine('Initializing services...');
    
    // Initialize configuration manager
    configManager = new ConfigManager(context);
    
    // Initialize error handler
    errorHandler = new ExtensionErrorHandler(outputChannel);
    
    // Initialize code analysis service
    codeAnalysis = new CodeAnalysisService();
    
    // Initialize decoration manager
    decorationManager = new CodeDecorationManager();
    
    // Initialize Gemini client
    geminiClient = new GeminiApiClient();
    
    // Configure Gemini client if API key is available
    if (configManager.isConfigured()) {
        try {
            const config = configManager.getGeminiConfig();
            geminiClient.updateConfig(config);
            outputChannel.appendLine('Gemini client configured successfully');
        } catch (error: any) {
            outputChannel.appendLine(`Warning: Failed to configure Gemini client: ${error.message}`);
        }
    }
    
    // Initialize webview provider
    webviewProvider = new CodeExplanationWebview(context);
    
    // Initialize command manager
    commandManager = new CommandManager(configManager, context);
    
    outputChannel.appendLine('Services initialized successfully');
}

function registerWebviewProvider(context: vscode.ExtensionContext): void {
    outputChannel.appendLine('Registering webview provider...');
    
    const provider = vscode.window.registerWebviewViewProvider(
        CodeExplanationWebview.viewType,
        webviewProvider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );
    
    context.subscriptions.push(provider);
    outputChannel.appendLine('Webview provider registered successfully');
}

function registerCommands(): void {
    outputChannel.appendLine('Registering commands...');
    
    // Register commands through command manager
    commandManager.registerCommands();
    
    // Register additional extension-specific commands
    const toggleHighlightsCommand = vscode.commands.registerCommand(
        'aiCodeExplanation.toggleHighlights',
        () => {
            if (selectionHandler) {
                selectionHandler.toggleHighlights();
            }
        }
    );
    
    const clearHighlightsCommand = vscode.commands.registerCommand(
        'aiCodeExplanation.clearHighlights',
        () => {
            if (selectionHandler) {
                selectionHandler.clearHighlights();
            }
        }
    );
    
    const showOutputCommand = vscode.commands.registerCommand(
        'aiCodeExplanation.showOutput',
        () => {
            outputChannel.show();
        }
    );
    
    const testConnectionCommand = vscode.commands.registerCommand(
        'aiCodeExplanation.testConnection',
        async () => {
            await testGeminiConnection();
        }
    );
    
    extensionContext.subscriptions.push(
        toggleHighlightsCommand,
        clearHighlightsCommand,
        showOutputCommand,
        testConnectionCommand
    );
    
    outputChannel.appendLine('Commands registered successfully');
}

function initializeSelectionHandling(): void {
    outputChannel.appendLine('Initializing selection handling...');
    
    // Initialize integration service
    const integrationService = new IntegrationService(
        codeAnalysis,
        geminiClient,
        webviewProvider,
        errorHandler
    );
    
    // Initialize selection handler
    selectionHandler = new SelectionHandler(
        codeAnalysis,
        decorationManager,
        webviewProvider,
        geminiClient,
        configManager,
        errorHandler,
        extensionContext
    );
    
    // Connect selection handler to command manager
    commandManager.setSelectionHandler(selectionHandler);
    
    outputChannel.appendLine('Selection handling initialized successfully');
}

async function performInitialSetup(): Promise<void> {
    outputChannel.appendLine('Performing initial setup...');
    
    try {
        // Check initial configuration and show welcome if needed
        await commandManager.checkInitialConfiguration();
        
        // Set initial webview state
        if (configManager.isConfigured()) {
            webviewProvider.showWelcome();
        } else {
            webviewProvider.showConfigurationNeeded();
        }
        
        outputChannel.appendLine('Initial setup completed successfully');
        
    } catch (error: any) {
        outputChannel.appendLine(`Warning during initial setup: ${error.message}`);
        // Don't throw here as this shouldn't prevent activation
    }
}

async function testGeminiConnection(): Promise<void> {
    if (!configManager.isConfigured()) {
        vscode.window.showWarningMessage(
            'Please configure your Gemini API key first.',
            'Configure'
        ).then(action => {
            if (action === 'Configure') {
                vscode.commands.executeCommand('aiCodeExplanation.setApiKey');
            }
        });
        return;
    }
    
    try {
        webviewProvider.showLoading();
        outputChannel.appendLine('Testing Gemini API connection...');
        
        const result = await geminiClient.testConnection();
        
        if (result.success) {
            vscode.window.showInformationMessage('✅ Gemini API connection successful!');
            outputChannel.appendLine('Gemini API connection test passed');
            webviewProvider.showWelcome();
        } else {
            vscode.window.showErrorMessage(`❌ Gemini API connection failed: ${result.error}`);
            outputChannel.appendLine(`Gemini API connection test failed: ${result.error}`);
            webviewProvider.showError(result.error || 'Connection test failed');
        }
        
    } catch (error: any) {
        const errorMessage = `Gemini API connection test failed: ${error.message}`;
        vscode.window.showErrorMessage(`❌ ${errorMessage}`);
        outputChannel.appendLine(errorMessage);
        webviewProvider.showError(errorMessage);
    }
}

// Extension status and health check
export function getExtensionStatus(): {
    isActive: boolean;
    isConfigured: boolean;
    servicesInitialized: boolean;
    lastError?: string;
} {
    return {
        isActive: !!extensionContext,
        isConfigured: configManager?.isConfigured() || false,
        servicesInitialized: !!(
            configManager && 
            errorHandler && 
            codeAnalysis && 
            decorationManager && 
            geminiClient && 
            webviewProvider
        ),
        lastError: undefined // Could be enhanced to track last error
    };
}

// Restart extension services
export async function restartExtension(): Promise<void> {
    outputChannel.appendLine('Restarting extension services...');
    
    try {
        // Dispose existing services
        if (selectionHandler) {
            selectionHandler.dispose();
        }
        if (decorationManager) {
            decorationManager.dispose();
        }
        if (geminiClient) {
            geminiClient.dispose();
        }
        if (errorHandler) {
            errorHandler.dispose();
        }
        
        // Reinitialize services
        await initializeServices(extensionContext);
        initializeSelectionHandling();
        await performInitialSetup();
        
        outputChannel.appendLine('Extension services restarted successfully');
        vscode.window.showInformationMessage('AI Code Explanation extension restarted successfully');
        
    } catch (error: any) {
        const errorMessage = `Failed to restart extension: ${error.message}`;
        outputChannel.appendLine(errorMessage);
        vscode.window.showErrorMessage(errorMessage);
        throw error;
    }
}

export function deactivate(): void {
    console.log('AI Code Explanation extension is being deactivated...');
    outputChannel.appendLine('Extension deactivation started');
    
    try {
        // Dispose services in reverse order
        if (selectionHandler) {
            selectionHandler.dispose();
        }
        
        if (commandManager) {
            commandManager.dispose();
        }
        
        if (decorationManager) {
            decorationManager.dispose();
        }
        
        if (geminiClient) {
            geminiClient.dispose();
        }
        
        if (errorHandler) {
            errorHandler.dispose();
        }
        
        if (webviewProvider) {
            webviewProvider.dispose();
        }
        
        // Clear global references
        extensionContext = undefined as any;
        outputChannel = undefined as any;
        webviewProvider = undefined as any;
        codeAnalysis = undefined as any;
        decorationManager = undefined as any;
        geminiClient = undefined as any;
        configManager = undefined as any;
        errorHandler = undefined as any;
        commandManager = undefined as any;
        selectionHandler = undefined as any;
        
        outputChannel?.appendLine('Extension deactivated successfully');
        console.log('AI Code Explanation extension deactivated successfully');
        
    } catch (error: any) {
        console.error('Error during extension deactivation:', error);
        outputChannel?.appendLine(`Error during deactivation: ${error.message}`);
    }
}