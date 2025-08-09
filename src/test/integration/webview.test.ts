import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeExplanationWebview } from '../../webviewProvider';

suite('CodeExplanationWebview Integration Test Suite', () => {
    let webviewProvider: CodeExplanationWebview;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
        // Create a mock extension context
        mockContext = {
            subscriptions: [],
            workspaceState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => []
            },
            globalState: {
                get: () => undefined,
                update: () => Promise.resolve(),
                keys: () => [],
                setKeysForSync: () => {}
            },
            extensionUri: vscode.Uri.file(''),
            extension: {
                id: 'test.extension',
                extensionUri: vscode.Uri.file(''),
                extensionPath: '',
                isActive: true,
                packageJSON: {},
                exports: undefined,
                activate: jest.fn(),
                extensionKind: 1
            },
            languageModelAccessInformation: {
                onDidChange: jest.fn(),
                canSendRequest: jest.fn()
            },
            extensionPath: '',
            environmentVariableCollection: {} as any,
            asAbsolutePath: (relativePath: string) => relativePath,
            storageUri: undefined,
            storagePath: undefined,
            globalStorageUri: vscode.Uri.file(''),
            globalStoragePath: '',
            logUri: vscode.Uri.file(''),
            logPath: '',
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as any
        };

        webviewProvider = new CodeExplanationWebview(mockContext);
    });

    test('should initialize with welcome state', () => {
        assert.strictEqual(webviewProvider.getState(), 'welcome');
        assert.strictEqual(webviewProvider.getCurrentExplanation(), '');
        assert.strictEqual(webviewProvider.getExplanationHistory().length, 0);
    });

    test('should update content and manage state correctly', () => {
        const explanation = 'This is a test explanation';
        const codeSnippet = 'console.log("test");';
        const language = 'javascript';

        webviewProvider.updateContent(explanation, codeSnippet, language);

        assert.strictEqual(webviewProvider.getState(), 'explanation');
        assert.strictEqual(webviewProvider.getCurrentExplanation(), explanation);
        
        const history = webviewProvider.getExplanationHistory();
        assert.strictEqual(history.length, 1);
        assert.strictEqual(history[0].explanation, explanation);
        assert.strictEqual(history[0].codeSnippet, codeSnippet);
        assert.strictEqual(history[0].language, language);
    });

    test('should manage loading state correctly', () => {
        webviewProvider.showLoading();
        assert.strictEqual(webviewProvider.getState(), 'loading');

        webviewProvider.updateContent('Test explanation');
        assert.strictEqual(webviewProvider.getState(), 'explanation');
    });

    test('should manage error state correctly', () => {
        const errorMessage = 'Test error message';
        webviewProvider.showError(errorMessage);
        assert.strictEqual(webviewProvider.getState(), 'error');
    });

    test('should manage configuration needed state correctly', () => {
        webviewProvider.showConfigurationNeeded();
        assert.strictEqual(webviewProvider.getState(), 'configurationNeeded');
    });

    test('should manage explanation history correctly', () => {
        // Add multiple explanations
        webviewProvider.updateContent('Explanation 1', 'code1', 'javascript');
        webviewProvider.updateContent('Explanation 2', 'code2', 'typescript');
        webviewProvider.updateContent('Explanation 3', 'code3', 'python');

        const history = webviewProvider.getExplanationHistory();
        assert.strictEqual(history.length, 3);
        
        // History should be in reverse chronological order (newest first)
        assert.strictEqual(history[0].explanation, 'Explanation 3');
        assert.strictEqual(history[1].explanation, 'Explanation 2');
        assert.strictEqual(history[2].explanation, 'Explanation 1');
    });

    test('should limit history size correctly', () => {
        // Add more than the maximum number of history items
        for (let i = 0; i < 15; i++) {
            webviewProvider.updateContent(`Explanation ${i}`, `code${i}`, 'javascript');
        }

        const history = webviewProvider.getExplanationHistory();
        assert.strictEqual(history.length, 10); // Should be limited to 10 items
        
        // Should keep the most recent items
        assert.strictEqual(history[0].explanation, 'Explanation 14');
        assert.strictEqual(history[9].explanation, 'Explanation 5');
    });

    test('should clear history correctly', () => {
        webviewProvider.updateContent('Test explanation', 'test code', 'javascript');
        assert.strictEqual(webviewProvider.getExplanationHistory().length, 1);

        webviewProvider.clearHistory();
        assert.strictEqual(webviewProvider.getExplanationHistory().length, 0);
    });

    test('should handle state persistence correctly', () => {
        let savedState: any = undefined;
        
        // Mock the workspace state to capture saved data
        mockContext.workspaceState.update = (key: string, value: any) => {
            if (key === 'aiCodeExplanation.webviewState') {
                savedState = value;
            }
            return Promise.resolve();
        };

        // Update content to trigger state save
        webviewProvider.updateContent('Test explanation', 'test code', 'javascript');

        assert.ok(savedState, 'State should be saved');
        assert.strictEqual(savedState.currentState, 'explanation');
        assert.strictEqual(savedState.currentExplanation, 'Test explanation');
        assert.strictEqual(savedState.explanationHistory.length, 1);
    });

    test('should restore state correctly', () => {
        const mockState = {
            currentState: 'explanation',
            currentExplanation: 'Restored explanation',
            lastError: '',
            explanationHistory: [
                {
                    explanation: 'Restored explanation',
                    codeSnippet: 'restored code',
                    language: 'javascript',
                    timestamp: Date.now()
                }
            ]
        };

        // Mock the workspace state to return saved data
        mockContext.workspaceState.get = (key: string) => {
            if (key === 'aiCodeExplanation.webviewState') {
                return mockState;
            }
            return undefined;
        };

        // Create new provider to test state restoration
        const restoredProvider = new CodeExplanationWebview(mockContext);

        assert.strictEqual(restoredProvider.getState(), 'explanation');
        assert.strictEqual(restoredProvider.getCurrentExplanation(), 'Restored explanation');
        assert.strictEqual(restoredProvider.getExplanationHistory().length, 1);
    });

    test('should handle webview disposal correctly', () => {
        assert.doesNotThrow(() => {
            webviewProvider.dispose();
        }, 'Dispose should not throw');
    });

    test('should handle multiple state transitions correctly', () => {
        // Test a typical workflow
        webviewProvider.showConfigurationNeeded();
        assert.strictEqual(webviewProvider.getState(), 'configurationNeeded');

        webviewProvider.showLoading();
        assert.strictEqual(webviewProvider.getState(), 'loading');

        webviewProvider.updateContent('Success explanation', 'test code', 'javascript');
        assert.strictEqual(webviewProvider.getState(), 'explanation');

        webviewProvider.showError('Test error');
        assert.strictEqual(webviewProvider.getState(), 'error');

        webviewProvider.showWelcome();
        assert.strictEqual(webviewProvider.getState(), 'welcome');
    });

    test('should handle empty or invalid content gracefully', () => {
        // Test with empty explanation
        webviewProvider.updateContent('');
        assert.strictEqual(webviewProvider.getCurrentExplanation(), '');
        assert.strictEqual(webviewProvider.getState(), 'explanation');

        // Test with undefined values
        webviewProvider.updateContent('Valid explanation', undefined, undefined);
        assert.strictEqual(webviewProvider.getCurrentExplanation(), 'Valid explanation');
        
        // History should not be added without code snippet and language
        const history = webviewProvider.getExplanationHistory();
        assert.strictEqual(history.length, 0);
    });
});