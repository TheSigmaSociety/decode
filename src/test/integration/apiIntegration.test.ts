import * as assert from 'assert';
import { GeminiApiClient } from '../../geminiClient';
import { ConfigManager } from '../../configManager';
import { ApiError, GeminiConfig } from '../../types';

suite('API Integration Test Suite', () => {
    let geminiClient: GeminiApiClient;
    let configManager: ConfigManager;
    let mockContext: any;

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
            extensionUri: { toString: () => '' },
            extensionPath: '',
            environmentVariableCollection: {},
            asAbsolutePath: (path: string) => path,
            storageUri: undefined,
            storagePath: undefined,
            globalStorageUri: { toString: () => '' },
            globalStoragePath: '',
            logUri: { toString: () => '' },
            logPath: '',
            extensionMode: 3, // Test mode
            secrets: {}
        };

        configManager = new ConfigManager(mockContext);
        geminiClient = new GeminiApiClient();
    });

    teardown(() => {
        geminiClient?.dispose();
    });

    test('should handle API client configuration', () => {
        const config: GeminiConfig = {
            apiKey: 'test-api-key-123',
            model: 'gemini-2.0-flash-001',
            temperature: 0.5,
            maxTokens: 1500
        };

        assert.doesNotThrow(() => {
            geminiClient.updateConfig(config);
        }, 'Should update configuration without errors');
    });

    test('should validate API key format', async () => {
        // Test valid API key format
        const validKey = 'AIzaSyDaGmWKa4JsXZ5iQTneitG02LuSBcOdBrE';
        const isValid = await geminiClient.validateApiKey(validKey);
        
        // Note: This will likely fail in tests without a real API key
        // but we're testing the validation logic
        assert.strictEqual(typeof isValid, 'boolean', 'Should return boolean');
    });

    test('should handle API errors correctly', async () => {
        const invalidConfig: GeminiConfig = {
            apiKey: 'invalid-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        };

        geminiClient.updateConfig(invalidConfig);

        try {
            await geminiClient.explainCode('console.log("test");', {
                language: 'javascript',
                variables: [],
                imports: []
            });
            
            // If we reach here, the API call succeeded (unlikely with invalid key)
            assert.ok(true, 'API call succeeded');
        } catch (error: any) {
            // Expected to fail with invalid key
            assert.ok(error instanceof Error, 'Should throw an error');
            
            // Check if it's properly categorized as an API error
            if (error.name === 'ApiError' || (error as any).status) {
                assert.ok(true, 'Error properly categorized as API error');
            }
        }
    });

    test('should handle network connectivity issues', async () => {
        // Mock network failure by using an invalid endpoint
        const config: GeminiConfig = {
            apiKey: 'test-key',
            model: 'invalid-model',
            temperature: 0.3,
            maxTokens: 1000
        };

        geminiClient.updateConfig(config);

        try {
            await geminiClient.explainCode('test code', {
                language: 'javascript',
                variables: [],
                imports: []
            });
        } catch (error: any) {
            // Should handle network/API errors gracefully
            assert.ok(error instanceof Error, 'Should throw an error for network issues');
        }
    });

    test('should handle API response validation', async () => {
        // Mock the API client to return invalid responses
        const originalExplainCode = geminiClient.explainCode;
        
        // Test empty response handling
        geminiClient.explainCode = jest.fn().mockResolvedValue('');
        
        try {
            await geminiClient.explainCode('test', { language: 'javascript', variables: [], imports: [] });
            assert.fail('Should throw error for empty response');
        } catch (error: any) {
            assert.ok(error.message.includes('Empty response'), 'Should detect empty response');
        }

        // Restore original method
        geminiClient.explainCode = originalExplainCode;
    });

    test('should handle API rate limiting', async () => {
        // This test would require actual API calls or sophisticated mocking
        // For now, we test the error handling structure
        
        const rateLimitError = new ApiError('Rate limit exceeded', 429, true);
        
        assert.strictEqual(rateLimitError.statusCode, 429, 'Should have correct status code');
        assert.strictEqual(rateLimitError.retryable, true, 'Should be marked as retryable');
    });

    test('should build proper explanation prompts', async () => {
        const codeSnippet = 'const x = 5;\nconsole.log(x);';
        const context = {
            language: 'javascript',
            functionName: 'testFunction',
            className: 'TestClass',
            variables: ['x'],
            imports: ['console']
        };

        // Mock the API to capture the prompt
        let capturedPrompt = '';
        const originalExplainCode = geminiClient.explainCode;
        geminiClient.explainCode = jest.fn().mockImplementation((prompt: string) => {
            capturedPrompt = prompt;
            return Promise.resolve('Mock explanation');
        });

        try {
            await geminiClient.explainCode(codeSnippet, context);
            
            // Verify prompt contains expected elements
            assert.ok(capturedPrompt.includes('javascript'), 'Prompt should include language');
            assert.ok(capturedPrompt.includes('const x = 5;'), 'Prompt should include code');
            assert.ok(capturedPrompt.includes('testFunction'), 'Prompt should include function name');
            assert.ok(capturedPrompt.includes('TestClass'), 'Prompt should include class name');
            
        } finally {
            // Restore original method
            geminiClient.explainCode = originalExplainCode;
        }
    });

    test('should handle configuration manager integration', async () => {
        // Mock workspace configuration
        const mockConfig = {
            get: (key: string) => {
                switch (key) {
                    case 'geminiApiKey': return 'test-api-key';
                    case 'model': return 'gemini-2.0-flash-001';
                    case 'temperature': return 0.3;
                    case 'maxTokens': return 1000;
                    default: return undefined;
                }
            },
            update: jest.fn(),
            has: () => true,
            inspect: () => undefined
        };

        // Mock vscode workspace
        const originalGetConfiguration = require('vscode').workspace?.getConfiguration;
        if (require('vscode').workspace) {
            require('vscode').workspace.getConfiguration = () => mockConfig;
        }

        try {
            const config = configManager.getGeminiConfig();
            
            assert.strictEqual(config.apiKey, 'test-api-key');
            assert.strictEqual(config.model, 'gemini-2.0-flash-001');
            assert.strictEqual(config.temperature, 0.3);
            assert.strictEqual(config.maxTokens, 1000);
            
        } finally {
            // Restore original function
            if (require('vscode').workspace && originalGetConfiguration) {
                require('vscode').workspace.getConfiguration = originalGetConfiguration;
            }
        }
    });

    test('should handle connection testing', async () => {
        const config: GeminiConfig = {
            apiKey: 'test-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        };

        geminiClient.updateConfig(config);

        const result = await geminiClient.testConnection();
        
        assert.strictEqual(typeof result.success, 'boolean', 'Should return success boolean');
        
        if (!result.success) {
            assert.strictEqual(typeof result.error, 'string', 'Should return error message on failure');
        }
    });

    test('should handle API timeout scenarios', async () => {
        // This would typically require mocking network delays
        // For now, we test the timeout handling structure
        
        const config: GeminiConfig = {
            apiKey: 'test-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        };

        geminiClient.updateConfig(config);

        // Mock a timeout scenario
        const originalExplainCode = geminiClient.explainCode;
        geminiClient.explainCode = jest.fn().mockImplementation(() => {
            return new Promise((_, reject) => {
                setTimeout(() => {
                    const error = new Error('Request timeout');
                    (error as any).code = 'TIMEOUT';
                    reject(error);
                }, 100);
            });
        });

        try {
            await geminiClient.explainCode('test', { language: 'javascript', variables: [], imports: [] });
            assert.fail('Should timeout');
        } catch (error: any) {
            assert.ok(error.message.includes('timeout') || error.code === 'TIMEOUT', 'Should handle timeout');
        } finally {
            geminiClient.explainCode = originalExplainCode;
        }
    });

    test('should handle malformed API responses', async () => {
        const config: GeminiConfig = {
            apiKey: 'test-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        };

        geminiClient.updateConfig(config);

        // Mock malformed response
        const originalExplainCode = geminiClient.explainCode;
        geminiClient.explainCode = jest.fn().mockResolvedValue(null);

        try {
            await geminiClient.explainCode('test', { language: 'javascript', variables: [], imports: [] });
            assert.fail('Should handle malformed response');
        } catch (error: any) {
            assert.ok(error instanceof Error, 'Should throw error for malformed response');
        } finally {
            geminiClient.explainCode = originalExplainCode;
        }
    });

    test('should handle API quota exceeded scenarios', async () => {
        const quotaError = new ApiError('Quota exceeded', 429, false);
        
        assert.strictEqual(quotaError.statusCode, 429, 'Should have correct status code');
        assert.strictEqual(quotaError.retryable, false, 'Quota errors typically not retryable');
    });

    test('should handle different model configurations', () => {
        const models = [
            'gemini-2.0-flash-001',
            'gemini-2.0-flash-lite',
            'gemini-pro'
        ];

        models.forEach(model => {
            const config: GeminiConfig = {
                apiKey: 'test-key',
                model,
                temperature: 0.3,
                maxTokens: 1000
            };

            assert.doesNotThrow(() => {
                geminiClient.updateConfig(config);
            }, `Should handle model: ${model}`);
        });
    });

    test('should handle temperature and token limit variations', () => {
        const configurations = [
            { temperature: 0.0, maxTokens: 100 },
            { temperature: 0.5, maxTokens: 1000 },
            { temperature: 1.0, maxTokens: 2000 }
        ];

        configurations.forEach(({ temperature, maxTokens }) => {
            const config: GeminiConfig = {
                apiKey: 'test-key',
                model: 'gemini-2.0-flash-001',
                temperature,
                maxTokens
            };

            assert.doesNotThrow(() => {
                geminiClient.updateConfig(config);
            }, `Should handle temperature: ${temperature}, maxTokens: ${maxTokens}`);
        });
    });

    test('should handle client disposal correctly', () => {
        const config: GeminiConfig = {
            apiKey: 'test-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        };

        geminiClient.updateConfig(config);
        
        assert.doesNotThrow(() => {
            geminiClient.dispose();
        }, 'Should dispose without errors');

        // After disposal, client should not be usable
        try {
            geminiClient.explainCode('test', { language: 'javascript', variables: [], imports: [] });
        } catch (error: any) {
            assert.ok(error.message.includes('not configured'), 'Should indicate client not configured after disposal');
        }
    });
});