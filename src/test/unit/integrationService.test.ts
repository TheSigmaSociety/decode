import * as assert from 'assert';
import * as vscode from 'vscode';
import { IntegrationService } from '../../integrationService';
import { CodeAnalysisService } from '../../codeAnalysis';
import { GeminiApiClient } from '../../geminiClient';
import { CodeExplanationWebview } from '../../webviewProvider';
import { ExtensionErrorHandler } from '../../errorHandler';
import { ApiError, AnalysisError } from '../../types';

describe('IntegrationService Test Suite', () => {
    let integrationService: IntegrationService;
    let mockCodeAnalysis: any;
    let mockGeminiClient: any;
    let mockWebviewProvider: any;
    let mockErrorHandler: any;
    let mockDocument: vscode.TextDocument;

    beforeEach(() => {
        // Mock code analysis service
        mockCodeAnalysis = {
            analyzeCodeSelection: jest.fn()
        };

        // Mock Gemini client
        mockGeminiClient = {
            explainCode: jest.fn()
        };

        // Mock webview provider
        mockWebviewProvider = {
            updateContent: jest.fn()
        };

        // Mock error handler
        mockErrorHandler = {
            retryWithBackoff: jest.fn(),
            handleAnalysisError: jest.fn(),
            handleApiError: jest.fn()
        };

        // Mock document
        mockDocument = {
            languageId: 'javascript',
            lineAt: (line: number) => ({ text: `Line ${line}` }),
            lineCount: 10
        } as any;

        integrationService = new IntegrationService(
            mockCodeAnalysis,
            mockGeminiClient,
            mockWebviewProvider,
            mockErrorHandler
        );
    });

    test('should process code explanation successfully', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: ['let y = 10;', 'console.log(x + y);'],
            context: {
                language: 'javascript',
                functionName: 'testFunction',
                variables: ['x', 'y'],
                imports: []
            }
        };

        const mockExplanation = 'This code declares a constant variable x with value 5.';

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue(mockExplanation);

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.explanation, mockExplanation);
        assert.strictEqual(result.error, undefined);

        expect(mockCodeAnalysis.analyzeCodeSelection).toHaveBeenCalledWith(mockDocument, selection);
        expect(mockGeminiClient.explainCode).toHaveBeenCalled();
        expect(mockWebviewProvider.updateContent).toHaveBeenCalledWith(
            mockExplanation,
            expect.any(String),
            'javascript'
        );
    });

    test('should handle analysis errors correctly', async () => {
        const analysisError = new AnalysisError('Parse error', 5);
        mockCodeAnalysis.analyzeCodeSelection.mockRejectedValue(analysisError);

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Code analysis error'));
    });

    test('should handle API errors correctly', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        };

        const apiError = new ApiError('Rate limit exceeded', 429, true);
        
        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockRejectedValue(apiError);

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('API error'));
    });

    test('should validate analysis result correctly', async () => {
        const invalidAnalysisResult = {
            selectedLine: '', // Invalid: empty line
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        };

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(invalidAnalysisResult);

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Selected line is empty'));
    });

    test('should validate API response correctly', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        };

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue(''); // Invalid: empty response

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Empty API response'));
    });

    test('should prepare code snippet correctly', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: ['const x = 5;', 'let y = 10;', '', 'console.log(x + y);'], // Contains duplicate and empty line
            context: {
                language: 'javascript',
                variables: ['x', 'y'],
                imports: []
            }
        };

        const mockExplanation = 'Test explanation';

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue(mockExplanation);

        const selection = new vscode.Selection(0, 0, 0, 10);
        await integrationService.processCodeExplanation(mockDocument, selection);

        // Check that the code snippet was prepared correctly (no duplicates, no empty lines)
        const callArgs = mockGeminiClient.explainCode.mock.calls[0];
        const codeSnippet = callArgs[0];
        
        assert.ok(codeSnippet.includes('const x = 5;'));
        assert.ok(codeSnippet.includes('let y = 10;'));
        assert.ok(codeSnippet.includes('console.log(x + y);'));
        
        // Should not contain duplicate lines
        const lines = codeSnippet.split('\n');
        const uniqueLines = [...new Set(lines)];
        assert.strictEqual(lines.length, uniqueLines.length);
    });

    test('should enhance context correctly', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: ['x', 'x', 'y'], // Contains duplicates
                imports: ['react', 'react'] // Contains duplicates
            }
        };

        const mockExplanation = 'Test explanation';

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue(mockExplanation);

        const selection = new vscode.Selection(0, 0, 0, 10);
        await integrationService.processCodeExplanation(mockDocument, selection);

        // Check that context was enhanced (duplicates removed)
        const callArgs = mockGeminiClient.explainCode.mock.calls[0];
        const enhancedContext = callArgs[1];
        
        assert.deepStrictEqual(enhancedContext.variables, ['x', 'y']);
        assert.deepStrictEqual(enhancedContext.imports, ['react']);
    });

    test('should handle UI update errors gracefully', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        };

        const mockExplanation = 'Test explanation';

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue(mockExplanation);
        mockWebviewProvider.updateContent.mockImplementation(() => {
            throw new Error('UI update failed');
        });

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('UI update failed'));
    });

    test('should sort code lines correctly', () => {
        const lines = ['let y = 10;', 'const x = 5;', 'console.log(x + y);'];
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: lines,
            context: { language: 'javascript', variables: [], imports: [] }
        };

        // Access private method through any cast for testing
        const sortedLines = (integrationService as any).sortCodeLines(lines, mockAnalysisResult);

        // Selected line should be first
        assert.strictEqual(sortedLines[0], 'const x = 5;');
        assert.ok(sortedLines.includes('let y = 10;'));
        assert.ok(sortedLines.includes('console.log(x + y);'));
    });

    test('should detect error indicators in API response', async () => {
        const mockAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        };

        const responseWithError = 'Error: Unable to process this code';

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(mockAnalysisResult);
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue(responseWithError);

        // Should still succeed but log warning
        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.explanation, responseWithError);
    });

    test('should handle test integration correctly', async () => {
        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue({
            selectedLine: 'console.log("test");',
            relatedLines: [],
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        });
        mockErrorHandler.retryWithBackoff.mockImplementation((fn: any) => fn());
        mockGeminiClient.explainCode.mockResolvedValue('Test explanation');

        const result = await integrationService.testIntegration();

        assert.strictEqual(result.success, true);
        assert.strictEqual(result.message, 'Integration test passed');
    });

    test('should handle test integration failure', async () => {
        mockCodeAnalysis.analyzeCodeSelection.mockRejectedValue(new Error('Test error'));

        const result = await integrationService.testIntegration();

        assert.strictEqual(result.success, false);
        assert.ok(result.message.includes('Integration test error'));
    });

    test('should return processing stats', () => {
        const stats = integrationService.getProcessingStats();

        assert.strictEqual(typeof stats.totalProcessed, 'number');
        assert.strictEqual(typeof stats.successfulProcessed, 'number');
        assert.strictEqual(typeof stats.failedProcessed, 'number');
        assert.strictEqual(typeof stats.averageProcessingTime, 'number');
    });

    test('should handle missing context language', async () => {
        const invalidAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: [],
            context: {
                // Missing language
                variables: [],
                imports: []
            }
        };

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(invalidAnalysisResult);

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Code context is missing'));
    });

    test('should handle invalid related lines array', async () => {
        const invalidAnalysisResult = {
            selectedLine: 'const x = 5;',
            relatedLines: null, // Invalid: should be array
            context: {
                language: 'javascript',
                variables: [],
                imports: []
            }
        };

        mockCodeAnalysis.analyzeCodeSelection.mockResolvedValue(invalidAnalysisResult);

        const selection = new vscode.Selection(0, 0, 0, 10);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false);
        assert.ok(result.error?.includes('Related lines array is invalid'));
    });
});