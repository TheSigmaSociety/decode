import * as assert from 'assert';

// Mock the @google/genai module
const mockGenerateContent = jest.fn();
const mockGoogleGenAI = jest.fn().mockImplementation(() => ({
    models: {
        generateContent: mockGenerateContent
    }
}));

jest.mock('@google/genai', () => ({
    GoogleGenAI: mockGoogleGenAI
}));

import { GeminiApiClient } from '../../geminiClient';
import { GeminiConfig, CodeContext, ApiError } from '../../types';

describe('GeminiApiClient Test Suite', () => {
    let client: GeminiApiClient;
    let testConfig: GeminiConfig;

    beforeEach(() => {
        testConfig = {
            apiKey: 'test-api-key-123',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        };

        client = new GeminiApiClient(testConfig);
        
        // Reset mocks
        mockGenerateContent.mockReset();
        mockGoogleGenAI.mockClear();
    });

    test('should initialize with config', () => {
        const newClient = new GeminiApiClient(testConfig);
        assert.ok(newClient, 'Client should be created');
    });

    test('should update config correctly', () => {
        const newConfig: GeminiConfig = {
            apiKey: 'new-api-key-456',
            model: 'gemini-2.0-flash-002',
            temperature: 0.5,
            maxTokens: 1500
        };

        client.updateConfig(newConfig);
        
        // Verify that GoogleGenAI was called with new API key
        expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'new-api-key-456' });
    });

    test('should build explanation prompt correctly', async () => {
        const codeSnippet = 'const x = 5;\nconsole.log(x);';
        const context: CodeContext = {
            language: 'javascript',
            functionName: 'testFunction',
            className: 'TestClass',
            variables: ['x', 'y'],
            imports: ['console']
        };

        mockGenerateContent.mockResolvedValue({ text: 'Mock explanation' });

        await client.explainCode(codeSnippet, context);

        expect(mockGenerateContent).toHaveBeenCalledWith({
            model: testConfig.model,
            contents: expect.stringContaining('const x = 5;'),
            config: {
                temperature: testConfig.temperature,
                maxOutputTokens: testConfig.maxTokens,
                topP: 0.8,
                topK: 40
            }
        });

        const callArgs = mockGenerateContent.mock.calls[0][0];
        const prompt = callArgs.contents;

        assert.ok(prompt.includes('testFunction'), 'Prompt should include function name');
        assert.ok(prompt.includes('TestClass'), 'Prompt should include class name');
        assert.ok(prompt.includes('x, y'), 'Prompt should include variables');
        assert.ok(prompt.includes('console'), 'Prompt should include imports');
        assert.ok(prompt.includes('javascript'), 'Prompt should include language');
    });

    test('should handle successful API response', async () => {
        const expectedExplanation = 'This code declares a variable and logs it to the console.';
        mockGenerateContent.mockResolvedValue({ text: expectedExplanation });

        const result = await client.explainCode('const x = 5;', {
            language: 'javascript',
            variables: [],
            imports: []
        });

        assert.strictEqual(result, expectedExplanation);
    });

    test('should handle empty API response', async () => {
        mockGenerateContent.mockResolvedValue({ text: '' });

        try {
            await client.explainCode('const x = 5;', {
                language: 'javascript',
                variables: [],
                imports: []
            });
            assert.fail('Should have thrown an error for empty response');
        } catch (error) {
            assert.ok(error instanceof ApiError);
            assert.ok(error.retryable, 'Empty response should be retryable');
        }
    });

    test('should handle API errors correctly', async () => {
        const apiError = new Error('API Error');
        (apiError as any).status = 401;
        mockGenerateContent.mockRejectedValue(apiError);

        try {
            await client.explainCode('const x = 5;', {
                language: 'javascript',
                variables: [],
                imports: []
            });
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof ApiError);
            assert.strictEqual(error.message, 'Invalid or expired API key');
        }
    });

    test('should validate API key correctly', async () => {
        // Test valid API key
        mockGenerateContent.mockResolvedValue({ text: 'test response' });
        const isValid = await client.validateApiKey('valid-api-key');
        assert.strictEqual(isValid, true);

        // Test invalid API key (401 error)
        const authError = new Error('Unauthorized');
        (authError as any).status = 401;
        mockGenerateContent.mockRejectedValue(authError);
        
        const isInvalid = await client.validateApiKey('invalid-api-key');
        assert.strictEqual(isInvalid, false);

        // Test other errors (should return true as we can't determine validity)
        const networkError = new Error('Network error');
        mockGenerateContent.mockRejectedValue(networkError);
        
        const isUndetermined = await client.validateApiKey('unknown-api-key');
        assert.strictEqual(isUndetermined, true);
    });

    test('should test connection correctly', async () => {
        // Test successful connection
        mockGenerateContent.mockResolvedValue({ text: 'test response' });
        const successResult = await client.testConnection();
        assert.strictEqual(successResult.success, true);
        assert.strictEqual(successResult.error, undefined);

        // Test failed connection
        mockGenerateContent.mockRejectedValue(new ApiError('Connection failed'));
        const failResult = await client.testConnection();
        assert.strictEqual(failResult.success, false);
        assert.strictEqual(failResult.error, 'Connection failed');
    });

    test('should throw error when not configured', async () => {
        const unconfiguredClient = new GeminiApiClient();

        try {
            await unconfiguredClient.explainCode('test', {
                language: 'javascript',
                variables: [],
                imports: []
            });
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof ApiError);
            assert.strictEqual(error.message, 'Gemini client not configured');
        }
    });

    test('should dispose correctly', () => {
        client.dispose();
        // After disposal, client should not be usable
        assert.doesNotThrow(() => client.dispose(), 'Dispose should not throw');
    });
});