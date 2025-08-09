import * as assert from 'assert';
import * as vscode from 'vscode';
import { activate, deactivate, getExtensionStatus } from '../../extension';

suite('Extension Integration Test Suite', () => {
    let context: vscode.ExtensionContext;

    setup(() => {
        // Create a mock extension context
        context = {
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
    });

    teardown(async () => {
        try {
            deactivate();
        } catch (error) {
            // Ignore deactivation errors in tests
        }
    });

    test('should activate extension successfully', async () => {
        await assert.doesNotReject(async () => {
            await activate(context);
        }, 'Extension activation should not throw');

        const status = getExtensionStatus();
        assert.strictEqual(status.isActive, true, 'Extension should be active');
    });

    test('should register commands during activation', async () => {
        const initialCommandCount = context.subscriptions.length;
        
        await activate(context);
        
        // Should have registered multiple commands
        assert.ok(context.subscriptions.length > initialCommandCount, 'Should register commands');
    });

    test('should initialize services correctly', async () => {
        await activate(context);
        
        const status = getExtensionStatus();
        assert.strictEqual(status.servicesInitialized, true, 'Services should be initialized');
    });

    test('should handle activation errors gracefully', async () => {
        // Create a context that will cause errors
        const errorContext = {
            ...context,
            subscriptions: null as any // This should cause an error
        };

        await assert.rejects(async () => {
            await activate(errorContext);
        }, 'Should throw error for invalid context');
    });

    test('should deactivate cleanly', async () => {
        await activate(context);
        
        assert.doesNotThrow(() => {
            deactivate();
        }, 'Deactivation should not throw');

        const status = getExtensionStatus();
        assert.strictEqual(status.isActive, false, 'Extension should be inactive after deactivation');
    });

    test('should handle multiple activation calls', async () => {
        await activate(context);
        
        // Second activation should not cause issues
        await assert.doesNotReject(async () => {
            await activate(context);
        }, 'Multiple activations should not throw');
    });

    test('should handle deactivation without activation', () => {
        assert.doesNotThrow(() => {
            deactivate();
        }, 'Deactivation without activation should not throw');
    });

    test('should provide correct extension status', async () => {
        // Before activation
        let status = getExtensionStatus();
        assert.strictEqual(status.isActive, false, 'Should be inactive before activation');
        assert.strictEqual(status.servicesInitialized, false, 'Services should not be initialized');

        // After activation
        await activate(context);
        status = getExtensionStatus();
        assert.strictEqual(status.isActive, true, 'Should be active after activation');
        assert.strictEqual(status.servicesInitialized, true, 'Services should be initialized');

        // After deactivation
        deactivate();
        status = getExtensionStatus();
        assert.strictEqual(status.isActive, false, 'Should be inactive after deactivation');
    });

    test('should handle configuration state correctly', async () => {
        await activate(context);
        
        const status = getExtensionStatus();
        // Should be false initially since no API key is configured in tests
        assert.strictEqual(status.isConfigured, false, 'Should not be configured initially');
    });

    test('should register webview provider', async () => {
        const registerWebviewViewProviderSpy = jest.spyOn(vscode.window, 'registerWebviewViewProvider');
        
        await activate(context);
        
        expect(registerWebviewViewProviderSpy).toHaveBeenCalledWith(
            'aiCodeExplanation',
            expect.any(Object),
            expect.any(Object)
        );
        
        registerWebviewViewProviderSpy.mockRestore();
    });

    test('should create output channel', async () => {
        const createOutputChannelSpy = jest.spyOn(vscode.window, 'createOutputChannel');
        
        await activate(context);
        
        expect(createOutputChannelSpy).toHaveBeenCalledWith('AI Code Explanation');
        
        createOutputChannelSpy.mockRestore();
    });

    test('should handle workspace state operations', async () => {
        let stateUpdates: { [key: string]: any } = {};
        
        context.workspaceState.update = (key: string, value: any) => {
            stateUpdates[key] = value;
            return Promise.resolve();
        };
        
        context.workspaceState.get = (key: string) => stateUpdates[key];
        
        await activate(context);
        
        // Extension should work with workspace state operations
        const status = getExtensionStatus();
        assert.strictEqual(status.isActive, true);
    });

    test('should handle global state operations', async () => {
        let globalStateUpdates: { [key: string]: any } = {};
        
        context.globalState.update = (key: string, value: any) => {
            globalStateUpdates[key] = value;
            return Promise.resolve();
        };
        
        context.globalState.get = (key: string) => globalStateUpdates[key];
        
        await activate(context);
        
        // Extension should work with global state operations
        const status = getExtensionStatus();
        assert.strictEqual(status.isActive, true);
    });
});