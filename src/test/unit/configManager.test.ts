import * as assert from 'assert';
import * as vscode from 'vscode';
import { ConfigManager } from '../../configManager';
import { ConfigurationError } from '../../types';

describe('ConfigManager Test Suite', () => {
    let configManager: ConfigManager;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
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

        configManager = new ConfigManager(mockContext);
    });

    test('should validate API key format correctly', () => {
        // Test valid API key formats
        const validKeys = [
            'AIzaSyDaGmWKa4JsXZ5iQTneitG02LuSBcOdBrE',
            'AIzaSyBGae7cpfa7VTiP39K6M37wD8YoS4MPbgE',
            'test-api-key-with-dashes-123',
            'test_api_key_with_underscores_456'
        ];

        // Test invalid API key formats
        const invalidKeys = [
            '',
            '   ',
            'short',
            'key with spaces',
            'key@with#special$chars',
            'key.with.dots'
        ];

        // Note: Since validateApiKeyFormat is private, we test it indirectly through setApiKey
        validKeys.forEach(async (key) => {
            try {
                await configManager.setApiKey(key);
                // If no error is thrown, the key is considered valid
                assert.ok(true, `Valid key should not throw error: ${key}`);
            } catch (error) {
                assert.fail(`Valid key threw error: ${key} - ${error}`);
            }
        });

        invalidKeys.forEach(async (key) => {
            try {
                await configManager.setApiKey(key);
                assert.fail(`Invalid key should throw error: ${key}`);
            } catch (error) {
                assert.ok(error instanceof ConfigurationError, `Should throw ConfigurationError for: ${key}`);
            }
        });
    });

    test('should detect configuration status correctly', () => {
        // Mock workspace configuration
        const mockConfig = {
            get: (key: string): any => {
                if (key === 'geminiApiKey') {
                    return 'AIzaSyDaGmWKa4JsXZ5iQTneitG02LuSBcOdBrE';
                }
                return undefined;
            },
            update: () => Promise.resolve(),
            inspect: () => undefined,
            has: () => true
        };

        // Mock vscode.workspace.getConfiguration
        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = () => mockConfig as any;

        assert.strictEqual(configManager.isConfigured(), true, 'Should detect configured state');

        // Test unconfigured state
        mockConfig.get = () => undefined;
        assert.strictEqual(configManager.isConfigured(), false, 'Should detect unconfigured state');

        // Test empty string
        mockConfig.get = (): any => '';
        assert.strictEqual(configManager.isConfigured(), false, 'Should detect empty string as unconfigured');

        // Test whitespace only
        mockConfig.get = (): any => '   ';
        assert.strictEqual(configManager.isConfigured(), false, 'Should detect whitespace as unconfigured');

        // Restore original function
        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    test('should get Gemini configuration correctly', () => {
        const mockConfig = {
            get: (key: string) => {
                switch (key) {
                    case 'geminiApiKey':
                        return 'AIzaSyDaGmWKa4JsXZ5iQTneitG02LuSBcOdBrE';
                    case 'model':
                        return 'gemini-2.0-flash-001';
                    case 'temperature':
                        return 0.5;
                    case 'maxTokens':
                        return 1500;
                    default:
                        return undefined;
                }
            },
            update: () => Promise.resolve(),
            inspect: () => undefined,
            has: () => true
        };

        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = () => mockConfig as any;

        const config = configManager.getGeminiConfig();
        
        assert.strictEqual(config.apiKey, 'AIzaSyDaGmWKa4JsXZ5iQTneitG02LuSBcOdBrE');
        assert.strictEqual(config.model, 'gemini-2.0-flash-001');
        assert.strictEqual(config.temperature, 0.5);
        assert.strictEqual(config.maxTokens, 1500);

        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    test('should throw error when getting config without API key', () => {
        const mockConfig = {
            get: () => undefined,
            update: () => Promise.resolve(),
            inspect: () => undefined,
            has: () => true
        };

        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = () => mockConfig as any;

        assert.throws(
            () => configManager.getGeminiConfig(),
            ConfigurationError,
            'Should throw ConfigurationError when API key is missing'
        );

        vscode.workspace.getConfiguration = originalGetConfiguration;
    });

    test('should use default values for missing configuration', () => {
        const mockConfig = {
            get: (key: string) => {
                if (key === 'geminiApiKey') {
                    return 'AIzaSyDaGmWKa4JsXZ5iQTneitG02LuSBcOdBrE';
                }
                return undefined; // All other config values are undefined
            },
            update: () => Promise.resolve(),
            inspect: () => undefined,
            has: () => true
        };

        const originalGetConfiguration = vscode.workspace.getConfiguration;
        vscode.workspace.getConfiguration = () => mockConfig as any;

        const config = configManager.getGeminiConfig();
        
        assert.strictEqual(config.model, 'gemini-2.0-flash-001', 'Should use default model');
        assert.strictEqual(config.temperature, 0.3, 'Should use default temperature');
        assert.strictEqual(config.maxTokens, 1000, 'Should use default maxTokens');

        vscode.workspace.getConfiguration = originalGetConfiguration;
    });
});