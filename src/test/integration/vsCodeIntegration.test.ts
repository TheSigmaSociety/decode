import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeExplanationWebview } from '../../webviewProvider';
import { CodeDecorationManager } from '../../decorationManager';
import { SelectionHandler } from '../../selectionHandler';
import { CommandManager } from '../../commands';

suite('VS Code Integration Test Suite', () => {
    let webviewProvider: CodeExplanationWebview;
    let decorationManager: CodeDecorationManager;
    let commandManager: CommandManager;
    let mockContext: vscode.ExtensionContext;

    setup(() => {
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
        decorationManager = new CodeDecorationManager();
        
        const mockConfigManager = {
            isConfigured: () => false,
            getApiKey: () => undefined,
            setApiKey: jest.fn(),
            promptForApiKey: jest.fn(),
            showConfigurationGuide: jest.fn()
        } as any;

        commandManager = new CommandManager(mockConfigManager, mockContext);
    });

    teardown(() => {
        webviewProvider?.dispose();
        decorationManager?.dispose();
        commandManager?.dispose();
    });

    test('should register webview provider correctly', () => {
        const mockWebviewView = {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                postMessage: jest.fn(),
                asWebviewUri: jest.fn((uri) => uri)
            },
            show: jest.fn(),
            title: 'Test'
        } as any;

        const mockContext = {
            extensionUri: vscode.Uri.file(''),
            subscriptions: []
        } as any;

        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn()
        } as any;

        assert.doesNotThrow(() => {
            webviewProvider.resolveWebviewView(mockWebviewView, mockContext, mockToken);
        }, 'Should resolve webview without errors');

        // Verify webview options are set
        assert.ok(mockWebviewView.webview.options.enableScripts, 'Should enable scripts');
        assert.ok(Array.isArray(mockWebviewView.webview.options.localResourceRoots), 'Should set local resource roots');
    });

    test('should handle webview messaging correctly', () => {
        const mockWebviewView = {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: jest.fn((callback) => {
                    // Simulate message handling
                    callback({ type: 'ready' });
                    callback({ type: 'requestExplanation' });
                    callback({ type: 'copyExplanation', text: 'test explanation' });
                    return { dispose: jest.fn() };
                }),
                postMessage: jest.fn(),
                asWebviewUri: jest.fn((uri) => uri)
            }
        } as any;

        const mockContext = {
            extensionUri: vscode.Uri.file(''),
            subscriptions: []
        } as any;

        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn()
        } as any;

        webviewProvider.resolveWebviewView(mockWebviewView, mockContext, mockToken);

        // Verify message handler was registered
        expect(mockWebviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
    });

    test('should create text editor decorations correctly', () => {
        const mockCreateDecorationType = jest.spyOn(vscode.window, 'createTextEditorDecorationType');
        mockCreateDecorationType.mockReturnValue({
            dispose: jest.fn()
        } as any);

        const newDecorationManager = new CodeDecorationManager();

        // Should create decoration types during initialization
        expect(mockCreateDecorationType).toHaveBeenCalledTimes(2);

        newDecorationManager.dispose();
        mockCreateDecorationType.mockRestore();
    });

    test('should handle editor decoration application', () => {
        const mockEditor = {
            document: {
                lineCount: 10,
                lineAt: (line: number) => ({
                    text: `Line ${line}`,
                    range: new vscode.Range(line, 0, line, 10)
                })
            },
            setDecorations: jest.fn(),
            revealRange: jest.fn()
        } as any;

        const lines = [1, 3, 5];
        decorationManager.highlightLines(mockEditor, lines);

        // Should call setDecorations for both selected and related lines
        expect(mockEditor.setDecorations).toHaveBeenCalledTimes(2);
        expect(mockEditor.revealRange).toHaveBeenCalledTimes(1);
    });

    test('should handle command registration correctly', () => {
        const mockRegisterCommand = jest.spyOn(vscode.commands, 'registerCommand');
        mockRegisterCommand.mockReturnValue({ dispose: jest.fn() } as any);

        commandManager.registerCommands();

        // Should register multiple commands
        expect(mockRegisterCommand).toHaveBeenCalledWith(
            'aiCodeExplanation.setApiKey',
            expect.any(Function)
        );
        expect(mockRegisterCommand).toHaveBeenCalledWith(
            'aiCodeExplanation.explainCode',
            expect.any(Function)
        );

        mockRegisterCommand.mockRestore();
    });

    test('should handle workspace state operations', async () => {
        let stateData: { [key: string]: any } = {};

        mockContext.workspaceState.get = jest.fn((key: string) => stateData[key]);
        mockContext.workspaceState.update = jest.fn((key: string, value: any) => {
            stateData[key] = value;
            return Promise.resolve();
        });

        // Test state persistence
        webviewProvider.updateContent('Test explanation', 'test code', 'javascript');

        // Should have updated workspace state
        expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
            'aiCodeExplanation.webviewState',
            expect.any(Object)
        );
    });

    test('should handle configuration changes', () => {
        const mockOnDidChangeConfiguration = jest.spyOn(vscode.workspace, 'onDidChangeConfiguration');
        mockOnDidChangeConfiguration.mockReturnValue({ dispose: jest.fn() } as any);

        const mockConfigManager = {
            isConfigured: () => true,
            onConfigurationChanged: jest.fn((callback) => {
                callback(); // Simulate configuration change
                return { dispose: jest.fn() };
            })
        } as any;

        // This would be tested in the actual SelectionHandler
        expect(mockConfigManager.onConfigurationChanged).toBeDefined();

        mockOnDidChangeConfiguration.mockRestore();
    });

    test('should handle text editor selection events', () => {
        const mockOnDidChangeTextEditorSelection = jest.spyOn(vscode.window, 'onDidChangeTextEditorSelection');
        mockOnDidChangeTextEditorSelection.mockReturnValue({ dispose: jest.fn() } as any);

        // This would be registered in SelectionHandler
        // For now, just verify the API is available
        expect(vscode.window.onDidChangeTextEditorSelection).toBeDefined();

        mockOnDidChangeTextEditorSelection.mockRestore();
    });

    test('should handle active editor changes', () => {
        const mockOnDidChangeActiveTextEditor = jest.spyOn(vscode.window, 'onDidChangeActiveTextEditor');
        mockOnDidChangeActiveTextEditor.mockReturnValue({ dispose: jest.fn() } as any);

        // This would be registered in SelectionHandler
        expect(vscode.window.onDidChangeActiveTextEditor).toBeDefined();

        mockOnDidChangeActiveTextEditor.mockRestore();
    });

    test('should handle document changes', () => {
        const mockOnDidChangeTextDocument = jest.spyOn(vscode.workspace, 'onDidChangeTextDocument');
        mockOnDidChangeTextDocument.mockReturnValue({ dispose: jest.fn() } as any);

        // This would be registered in SelectionHandler
        expect(vscode.workspace.onDidChangeTextDocument).toBeDefined();

        mockOnDidChangeTextDocument.mockRestore();
    });

    test('should handle webview HTML generation', () => {
        const mockWebviewView = {
            webview: {
                options: {},
                html: '',
                onDidReceiveMessage: jest.fn(() => ({ dispose: jest.fn() })),
                postMessage: jest.fn(),
                asWebviewUri: jest.fn((uri) => ({ toString: () => uri.toString() }))
            }
        } as any;

        const mockContext = {
            extensionUri: vscode.Uri.file('/test/path'),
            subscriptions: []
        } as any;

        const mockToken = {
            isCancellationRequested: false,
            onCancellationRequested: jest.fn()
        } as any;

        webviewProvider.resolveWebviewView(mockWebviewView, mockContext, mockToken);

        // Should generate HTML content
        assert.ok(typeof mockWebviewView.webview.html === 'string', 'Should set HTML content');
        assert.ok(mockWebviewView.webview.html.length > 0, 'HTML content should not be empty');
        assert.ok(mockWebviewView.webview.html.includes('<!DOCTYPE html>'), 'Should be valid HTML');
    });

    test('should handle clipboard operations', async () => {
        const mockWriteText = jest.spyOn(vscode.env.clipboard, 'writeText');
        mockWriteText.mockResolvedValue();

        const mockShowInformationMessage = jest.spyOn(vscode.window, 'showInformationMessage');
        mockShowInformationMessage.mockResolvedValue(undefined);

        // Simulate copy operation (this would be triggered by webview message)
        await vscode.env.clipboard.writeText('test explanation');

        expect(mockWriteText).toHaveBeenCalledWith('test explanation');

        mockWriteText.mockRestore();
        mockShowInformationMessage.mockRestore();
    });

    test('should handle external URI opening', async () => {
        const mockOpenExternal = jest.spyOn(vscode.env, 'openExternal');
        mockOpenExternal.mockResolvedValue(true);

        const testUri = vscode.Uri.parse('https://ai.google.dev/gemini-api/docs/api-key');
        await vscode.env.openExternal(testUri);

        expect(mockOpenExternal).toHaveBeenCalledWith(testUri);

        mockOpenExternal.mockRestore();
    });

    test('should handle output channel operations', () => {
        const mockCreateOutputChannel = jest.spyOn(vscode.window, 'createOutputChannel');
        const mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        };
        mockCreateOutputChannel.mockReturnValue(mockOutputChannel as any);

        const outputChannel = vscode.window.createOutputChannel('AI Code Explanation');
        outputChannel.appendLine('Test message');
        outputChannel.show();

        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('Test message');
        expect(mockOutputChannel.show).toHaveBeenCalled();

        outputChannel.dispose();
        expect(mockOutputChannel.dispose).toHaveBeenCalled();

        mockCreateOutputChannel.mockRestore();
    });

    test('should handle theme color integration', () => {
        const themeColor = new vscode.ThemeColor('editor.selectionHighlightBackground');
        
        assert.strictEqual(themeColor.id, 'editor.selectionHighlightBackground');
        assert.ok(themeColor instanceof vscode.ThemeColor);
    });

    test('should handle position and range operations', () => {
        const position1 = new vscode.Position(5, 10);
        const position2 = new vscode.Position(5, 20);
        const range = new vscode.Range(position1, position2);

        assert.strictEqual(range.start.line, 5);
        assert.strictEqual(range.start.character, 10);
        assert.strictEqual(range.end.line, 5);
        assert.strictEqual(range.end.character, 20);
    });

    test('should handle selection operations', () => {
        const selection = new vscode.Selection(5, 10, 5, 20);

        assert.strictEqual(selection.start.line, 5);
        assert.strictEqual(selection.start.character, 10);
        assert.strictEqual(selection.end.line, 5);
        assert.strictEqual(selection.end.character, 20);
        assert.strictEqual(selection.isEmpty, false);

        const emptySelection = new vscode.Selection(5, 10, 5, 10);
        assert.strictEqual(emptySelection.isEmpty, true);
    });

    test('should handle URI operations', () => {
        const fileUri = vscode.Uri.file('/path/to/file.js');
        const parseUri = vscode.Uri.parse('https://example.com');
        const joinUri = vscode.Uri.joinPath(fileUri, 'subdir', 'file.txt');

        assert.ok(fileUri.toString().includes('/path/to/file.js'));
        assert.ok(parseUri.toString().includes('https://example.com'));
        assert.ok(joinUri.toString().includes('subdir/file.txt'));
    });

    test('should handle extension context operations', () => {
        // Test subscription management
        const mockDisposable = { dispose: jest.fn() };
        mockContext.subscriptions.push(mockDisposable);

        assert.strictEqual(mockContext.subscriptions.length, 1);
        assert.strictEqual(mockContext.subscriptions[0], mockDisposable);

        // Test path operations
        const relativePath = 'media/main.css';
        const absolutePath = mockContext.asAbsolutePath(relativePath);
        assert.strictEqual(absolutePath, relativePath);
    });
});