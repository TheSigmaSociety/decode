import * as vscode from 'vscode';
import { CodeExplanationWebviewProvider } from './types';

enum WebviewState {
    Welcome = 'welcome',
    ConfigurationNeeded = 'configurationNeeded',
    Loading = 'loading',
    Explanation = 'explanation',
    Error = 'error'
}

interface ExplanationHistoryItem {
    explanation: string;
    timestamp: number;
    codeSnippet: string;
    language: string;
}

export class CodeExplanationWebview implements CodeExplanationWebviewProvider {
    public static readonly viewType = 'aiCodeExplanation';
    
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;
    private _currentExplanation: string = '';
    private _isLoading: boolean = false;
    private _currentState: WebviewState = WebviewState.Welcome;
    private _lastError: string = '';
    private _explanationHistory: ExplanationHistoryItem[] = [];
    private _maxHistoryItems: number = 10;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
        this._loadState();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('WebviewProvider.resolveWebviewView called');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._context.extensionUri
            ]
        };

        console.log('Setting webview HTML content');
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(
            message => {
                console.log('Received message from webview:', message.type, message);
                switch (message.type) {
                    case 'ready':
                        console.log('Webview is ready');
                        this._onWebviewReady();
                        break;
                    case 'requestExplanation':
                        console.log('Explanation requested from webview');
                        this._onExplanationRequested();
                        break;
                    case 'test':
                        console.log('Test message received from webview');
                        // Send a test explanation
                        this.updateContent('# Test Successful!\n\nThe webview communication is working correctly. This is a test explanation to verify that:\n\n- ✅ Messages are being sent from webview to extension\n- ✅ Extension can update webview content\n- ✅ Markdown formatting is working\n- ✅ UI state management is functional\n\n```typescript\nconsole.log("Webview test passed!");\n```', 'test code', 'typescript');
                        break;
                    case 'copyExplanation':
                        this._onCopyExplanation(message.text);
                        break;
                    case 'openSettings':
                        this._onOpenSettings();
                        break;
                    case 'showHistory':
                        this._onShowHistory();
                        break;
                    case 'clearHistory':
                        this._onClearHistory();
                        break;
                    case 'loadHistoryItem':
                        this._onLoadHistoryItem(message.index);
                        break;
                    default:
                        console.warn('Unknown message type from webview:', message.type);
                }
            },
            undefined,
            this._context.subscriptions
        );
        
        console.log('Webview provider setup complete');
    }

    public updateContent(explanation: string, codeSnippet?: string, language?: string): void {
        console.log('WebviewProvider.updateContent called with explanation length:', explanation.length);
        this._currentExplanation = explanation;
        this._isLoading = false;
        this._currentState = WebviewState.Explanation;
        
        // Add to history
        if (codeSnippet && language) {
            this._addToHistory(explanation, codeSnippet, language);
        }
        
        if (this._view) {
            console.log('Sending updateExplanation message to webview');
            this._view.webview.postMessage({
                type: 'updateExplanation',
                explanation: explanation,
                hasHistory: this._explanationHistory.length > 0
            });
        } else {
            console.warn('Webview is not available to update content');
        }
        
        this._saveState();
    }

    public showError(message: string): void {
        console.log('WebviewProvider.showError called with message:', message);
        this._isLoading = false;
        this._currentState = WebviewState.Error;
        this._lastError = message;
        
        if (this._view) {
            console.log('Sending showError message to webview');
            this._view.webview.postMessage({
                type: 'showError',
                message: message
            });
        } else {
            console.warn('Webview is not available to show error');
        }
        
        this._saveState();
    }

    public showLoading(): void {
        console.log('WebviewProvider.showLoading called');
        this._isLoading = true;
        this._currentState = WebviewState.Loading;
        
        if (this._view) {
            console.log('Sending showLoading message to webview');
            this._view.webview.postMessage({
                type: 'showLoading'
            });
        } else {
            console.warn('Webview is not available to show loading');
        }
        
        this._saveState();
    }

    public showWelcome(): void {
        this._currentState = WebviewState.Welcome;
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showWelcome'
            });
        }
        
        this._saveState();
    }

    public showConfigurationNeeded(): void {
        this._currentState = WebviewState.ConfigurationNeeded;
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showConfigurationNeeded'
            });
        }
        
        this._saveState();
    }

    public getState(): WebviewState {
        return this._currentState;
    }

    public getCurrentExplanation(): string {
        return this._currentExplanation;
    }

    public getExplanationHistory(): ExplanationHistoryItem[] {
        return [...this._explanationHistory];
    }

    public clearHistory(): void {
        this._explanationHistory = [];
        this._saveState();
        
        if (this._view) {
            this._view.webview.postMessage({
                type: 'historyCleared'
            });
        }
    }

    private _onWebviewReady(): void {
        console.log('_onWebviewReady called, current state:', this._currentState);
        // Webview is ready, restore previous state
        switch (this._currentState) {
            case WebviewState.Explanation:
                console.log('Restoring explanation state, has explanation:', !!this._currentExplanation);
                if (this._currentExplanation) {
                    this._view?.webview.postMessage({
                        type: 'updateExplanation',
                        explanation: this._currentExplanation,
                        hasHistory: this._explanationHistory.length > 0
                    });
                } else {
                    console.log('No current explanation, showing welcome');
                    this.showWelcome();
                }
                break;
            case WebviewState.Loading:
                console.log('Restoring loading state');
                this.showLoading();
                break;
            case WebviewState.Error:
                console.log('Restoring error state, error:', this._lastError);
                if (this._lastError) {
                    this.showError(this._lastError);
                } else {
                    console.log('No last error, showing welcome');
                    this.showWelcome();
                }
                break;
            case WebviewState.ConfigurationNeeded:
                console.log('Showing configuration needed');
                this.showConfigurationNeeded();
                break;
            default:
                console.log('Default case, showing welcome');
                this.showWelcome();
        }
    }

    private _onExplanationRequested(): void {
        // Trigger explanation for current selection
        vscode.commands.executeCommand('aiCodeExplanation.explainCode');
    }

    private _onCopyExplanation(text: string): void {
        vscode.env.clipboard.writeText(text).then(() => {
            vscode.window.showInformationMessage('Explanation copied to clipboard!');
        });
    }

    private _onOpenSettings(): void {
        vscode.commands.executeCommand('workbench.action.openSettings', 'aiCodeExplanation');
    }

    private _onShowHistory(): void {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'showHistory',
                history: this._explanationHistory.map((item, index) => ({
                    index,
                    timestamp: item.timestamp,
                    codeSnippet: item.codeSnippet.substring(0, 100) + (item.codeSnippet.length > 100 ? '...' : ''),
                    language: item.language
                }))
            });
        }
    }

    private _onClearHistory(): void {
        this.clearHistory();
        vscode.window.showInformationMessage('Explanation history cleared.');
    }

    private _onLoadHistoryItem(index: number): void {
        if (index >= 0 && index < this._explanationHistory.length) {
            const item = this._explanationHistory[index];
            this.updateContent(item.explanation);
        }
    }

    private _addToHistory(explanation: string, codeSnippet: string, language: string): void {
        const historyItem: ExplanationHistoryItem = {
            explanation,
            codeSnippet,
            language,
            timestamp: Date.now()
        };

        // Add to beginning of array
        this._explanationHistory.unshift(historyItem);

        // Limit history size
        if (this._explanationHistory.length > this._maxHistoryItems) {
            this._explanationHistory = this._explanationHistory.slice(0, this._maxHistoryItems);
        }
    }

    private _saveState(): void {
        const state = {
            currentState: this._currentState,
            currentExplanation: this._currentExplanation,
            lastError: this._lastError,
            explanationHistory: this._explanationHistory
        };

        this._context.workspaceState.update('aiCodeExplanation.webviewState', state);
    }

    private _loadState(): void {
        const state = this._context.workspaceState.get<any>('aiCodeExplanation.webviewState');
        
        if (state) {
            this._currentState = state.currentState || WebviewState.Welcome;
            this._currentExplanation = state.currentExplanation || '';
            this._lastError = state.lastError || '';
            this._explanationHistory = state.explanationHistory || [];
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.js'));
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'media', 'main.css'));

        // Use a nonce to only allow a specific script to be run.
        const nonce = getNonce();

        return `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} https://cdnjs.cloudflare.com; script-src 'nonce-${nonce}' https://cdnjs.cloudflare.com;">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleResetUri}" rel="stylesheet">
                <link href="${styleVSCodeUri}" rel="stylesheet">
                <link href="${styleMainUri}" rel="stylesheet">
                <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism-tomorrow.min.css" rel="stylesheet">
                <style>
                    /* Debug styles to ensure visibility */
                    body { 
                        background-color: var(--vscode-editor-background, #1e1e1e) !important; 
                        color: var(--vscode-editor-foreground, #d4d4d4) !important;
                        margin: 0;
                        padding: 10px;
                        font-family: var(--vscode-font-family);
                    }
                    .section { 
                        display: block !important; 
                        min-height: 50px;
                        border: 1px solid rgba(255,255,255,0.1);
                        padding: 10px;
                        margin: 5px 0;
                        background: rgba(255,255,255,0.05);
                    }
                    .section.hidden { 
                        display: none !important; 
                    }
                    .primary-button, .secondary-button {
                        background: var(--vscode-button-background, #0e639c);
                        color: var(--vscode-button-foreground, white);
                        border: none;
                        padding: 8px 16px;
                        cursor: pointer;
                        margin: 5px;
                    }
                    .primary-button:hover, .secondary-button:hover {
                        background: var(--vscode-button-hoverBackground, #1177bb);
                    }
                    /* Compact explanation styling */
                    .explanation-content h2, .explanation-content h3, .explanation-content h4 {
                        margin: 8px 0 4px 0;
                        line-height: 1.2;
                    }
                    .explanation-content p {
                        margin: 4px 0;
                        line-height: 1.4;
                    }
                    .explanation-content ul {
                        margin: 4px 0;
                        padding-left: 20px;
                    }
                    .explanation-content li {
                        margin: 2px 0;
                    }
                    .explanation-content pre {
                        margin: 6px 0;
                        padding: 8px;
                        background: rgba(0,0,0,0.2);
                        border-radius: 4px;
                    }
                </style>
                <title>AI Code Explanation</title>
            </head>
            <body>
                <div id="app">
                    <div id="welcome" class="section">
                        <h2>🤖 AI Code Explanation</h2>
                        <p>Select a line of code in the editor to get an AI-powered explanation.</p>
                        <div class="actions">
                            <button id="explainBtn" class="primary-button">
                                <span class="codicon codicon-lightbulb"></span>
                                Explain Selected Code
                            </button>
                            <button id="testBtn" class="secondary-button" style="margin-top: 10px;">
                                🧪 Test Webview
                            </button>
                        </div>
                    </div>

                    <div id="configurationNeeded" class="section hidden">
                        <h2>⚙️ Configuration Required</h2>
                        <p>To use AI Code Explanation, you need to configure your Gemini API key.</p>
                        <div class="actions">
                            <button id="configureBtn" class="primary-button">
                                <span class="codicon codicon-settings-gear"></span>
                                Configure API Key
                            </button>
                        </div>
                        <div class="help-text">
                            <p>Get your free API key from <a href="https://ai.google.dev/gemini-api/docs/api-key">Google AI Studio</a></p>
                        </div>
                    </div>

                    <div id="loading" class="section hidden">
                        <div class="loading-container">
                            <div class="loading-spinner"></div>
                            <p>Analyzing code and generating explanation...</p>
                        </div>
                    </div>

                    <div id="explanation" class="section hidden">
                        <div class="explanation-header">
                            <h3>Code Explanation</h3>
                            <div class="actions">
                                <button id="historyBtn" class="icon-button" title="Show history">
                                    <span class="codicon codicon-history"></span>
                                </button>
                                <button id="copyBtn" class="icon-button" title="Copy explanation">
                                    <span class="codicon codicon-copy"></span>
                                </button>
                                <button id="refreshBtn" class="icon-button" title="Refresh explanation">
                                    <span class="codicon codicon-refresh"></span>
                                </button>
                            </div>
                        </div>
                        <div id="explanationContent" class="explanation-content">
                            <!-- Explanation content will be inserted here -->
                        </div>
                    </div>

                    <div id="history" class="section hidden">
                        <div class="history-header">
                            <h3>Explanation History</h3>
                            <div class="actions">
                                <button id="clearHistoryBtn" class="icon-button" title="Clear history">
                                    <span class="codicon codicon-trash"></span>
                                </button>
                                <button id="backToExplanationBtn" class="icon-button" title="Back to explanation">
                                    <span class="codicon codicon-arrow-left"></span>
                                </button>
                            </div>
                        </div>
                        <div id="historyContent" class="history-content">
                            <!-- History items will be inserted here -->
                        </div>
                    </div>

                    <div id="error" class="section hidden">
                        <div class="error-container">
                            <h3>⚠️ Error</h3>
                            <p id="errorMessage">An error occurred while generating the explanation.</p>
                            <div class="actions">
                                <button id="retryBtn" class="primary-button">
                                    <span class="codicon codicon-refresh"></span>
                                    Try Again
                                </button>
                                <button id="settingsBtn" class="secondary-button">
                                    <span class="codicon codicon-settings-gear"></span>
                                    Open Settings
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
                <script nonce="${nonce}" src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
                <script nonce="${nonce}" src="${scriptUri}"></script>
            </body>
            </html>`;
    }

    public dispose(): void {
        this._view = undefined;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}