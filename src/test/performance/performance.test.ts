import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeAnalysisService } from '../../codeAnalysis';
import { GeminiApiClient } from '../../geminiClient';
import { CodeExplanationWebview } from '../../webviewProvider';
import { CodeDecorationManager } from '../../decorationManager';
import { SelectionHandler } from '../../selectionHandler';
import { IntegrationService } from '../../integrationService';

suite('Performance Test Suite', () => {
    let codeAnalysis: CodeAnalysisService;
    let geminiClient: GeminiApiClient;
    let webviewProvider: CodeExplanationWebview;
    let decorationManager: CodeDecorationManager;
    let integrationService: IntegrationService;
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

        const outputChannel = vscode.window.createOutputChannel('Test');
        codeAnalysis = new CodeAnalysisService();
        geminiClient = new GeminiApiClient();
        webviewProvider = new CodeExplanationWebview(mockContext);
        decorationManager = new CodeDecorationManager();
        
        const mockErrorHandler = {
            retryWithBackoff: (fn: any) => fn(),
            handleAnalysisError: jest.fn(),
            handleApiError: jest.fn()
        } as any;

        integrationService = new IntegrationService(
            codeAnalysis,
            geminiClient,
            webviewProvider,
            mockErrorHandler
        );
    });

    teardown(() => {
        decorationManager?.dispose();
        geminiClient?.dispose();
        webviewProvider?.dispose();
    });

    test('should handle large file analysis within reasonable time', async () => {
        // Create a large mock document (1000 lines)
        const largeCode = Array.from({ length: 1000 }, (_, i) => {
            if (i % 10 === 0) return `function func${i}() {`;
            if (i % 10 === 5) return `  const var${i} = ${i};`;
            if (i % 10 === 9) return '}';
            return `  // Line ${i}`;
        });

        const mockDocument = {
            lineCount: largeCode.length,
            languageId: 'javascript',
            lineAt: (line: number) => ({
                text: largeCode[line] || '',
                lineNumber: line
            })
        } as any;

        const startTime = Date.now();
        const relatedLines = codeAnalysis.findRelatedLines(mockDocument, 500);
        const endTime = Date.now();

        const duration = endTime - startTime;
        
        // Should complete within 2 seconds for large files
        assert.ok(duration < 2000, `Large file analysis took ${duration}ms, should be under 2000ms`);
        assert.ok(relatedLines.length > 0, 'Should find related lines');
        assert.ok(relatedLines.includes(500), 'Should include target line');
    });

    test('should handle rapid selection changes efficiently', async () => {
        const mockDocument = {
            lineCount: 100,
            languageId: 'javascript',
            lineAt: (line: number) => ({
                text: `const var${line} = ${line};`,
                lineNumber: line
            })
        } as any;

        const startTime = Date.now();
        
        // Simulate rapid selection changes
        const promises = [];
        for (let i = 0; i < 50; i++) {
            const promise = codeAnalysis.findRelatedLines(mockDocument, i);
            promises.push(promise);
        }

        await Promise.all(promises);
        const endTime = Date.now();

        const duration = endTime - startTime;
        const averageTime = duration / 50;

        // Each analysis should average under 100ms
        assert.ok(averageTime < 100, `Average analysis time was ${averageTime}ms, should be under 100ms`);
    });

    test('should handle memory usage efficiently with multiple decorations', () => {
        const mockEditor = {
            document: {
                lineCount: 1000,
                lineAt: (line: number) => ({ text: `Line ${line}` })
            },
            setDecorations: jest.fn(),
            revealRange: jest.fn()
        } as any;

        const startMemory = process.memoryUsage().heapUsed;

        // Create many decorations
        for (let i = 0; i < 100; i++) {
            const lines = Array.from({ length: 10 }, (_, j) => i * 10 + j);
            decorationManager.highlightLines(mockEditor, lines);
        }

        const endMemory = process.memoryUsage().heapUsed;
        const memoryIncrease = endMemory - startMemory;

        // Memory increase should be reasonable (under 50MB)
        const maxMemoryIncrease = 50 * 1024 * 1024; // 50MB
        assert.ok(memoryIncrease < maxMemoryIncrease, 
            `Memory increase was ${memoryIncrease / 1024 / 1024}MB, should be under 50MB`);

        // Cleanup
        decorationManager.clearHighlights();
    });

    test('should handle concurrent API requests efficiently', async () => {
        // Mock successful API responses
        jest.spyOn(geminiClient, 'explainCode').mockImplementation(async (code: string) => {
            // Simulate API delay
            await new Promise(resolve => setTimeout(resolve, 100));
            return `Explanation for: ${code.substring(0, 20)}...`;
        });

        const mockDocument = {
            languageId: 'javascript',
            lineAt: (line: number) => ({ text: `const var${line} = ${line};` }),
            lineCount: 10
        } as any;

        const startTime = Date.now();

        // Make concurrent requests
        const promises = [];
        for (let i = 0; i < 10; i++) {
            const selection = new vscode.Selection(i, 0, i, 20);
            promises.push(integrationService.processCodeExplanation(mockDocument, selection));
        }

        const results = await Promise.all(promises);
        const endTime = Date.now();

        const duration = endTime - startTime;

        // All requests should succeed
        results.forEach((result, index) => {
            assert.strictEqual(result.success, true, `Request ${index} should succeed`);
        });

        // Concurrent requests should be faster than sequential
        // (10 requests * 100ms delay = 1000ms sequential, should be much less concurrent)
        assert.ok(duration < 800, `Concurrent requests took ${duration}ms, should be under 800ms`);
    });

    test('should handle webview state management efficiently', () => {
        const startTime = Date.now();

        // Perform many state changes
        for (let i = 0; i < 1000; i++) {
            webviewProvider.showLoading();
            webviewProvider.updateContent(`Explanation ${i}`, `code ${i}`, 'javascript');
            webviewProvider.showError(`Error ${i}`);
            webviewProvider.showWelcome();
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        // State changes should be fast (under 1 second for 1000 changes)
        assert.ok(duration < 1000, `State changes took ${duration}ms, should be under 1000ms`);

        // History should be limited
        const history = webviewProvider.getExplanationHistory();
        assert.ok(history.length <= 10, `History length is ${history.length}, should be <= 10`);
    });

    test('should handle code analysis for different file sizes', async () => {
        const fileSizes = [10, 50, 100, 500, 1000];
        const results: { size: number; duration: number }[] = [];

        for (const size of fileSizes) {
            const mockDocument = {
                lineCount: size,
                languageId: 'javascript',
                lineAt: (line: number) => ({
                    text: `const var${line} = func${line}(param${line});`,
                    lineNumber: line
                })
            } as any;

            const startTime = Date.now();
            const relatedLines = codeAnalysis.findRelatedLines(mockDocument, Math.floor(size / 2));
            const endTime = Date.now();

            const duration = endTime - startTime;
            results.push({ size, duration });

            // Each analysis should complete within reasonable time
            const maxTime = Math.max(100, size * 2); // Scale with file size
            assert.ok(duration < maxTime, 
                `Analysis of ${size} lines took ${duration}ms, should be under ${maxTime}ms`);
        }

        // Log performance characteristics
        console.log('Code analysis performance:');
        results.forEach(({ size, duration }) => {
            console.log(`  ${size} lines: ${duration}ms`);
        });
    });

    test('should handle decoration cleanup efficiently', () => {
        const mockEditors = Array.from({ length: 50 }, (_, i) => ({
            document: {
                lineCount: 100,
                lineAt: (line: number) => ({ text: `Line ${line}` }),
                isClosed: i % 10 === 0 // Some editors are closed
            },
            setDecorations: jest.fn(),
            revealRange: jest.fn()
        }));

        // Add decorations to all editors
        mockEditors.forEach((editor, i) => {
            const lines = [i, i + 1, i + 2];
            decorationManager.highlightLines(editor as any, lines);
        });

        const startTime = Date.now();
        decorationManager.clearHighlights();
        const endTime = Date.now();

        const duration = endTime - startTime;

        // Cleanup should be fast
        assert.ok(duration < 100, `Cleanup took ${duration}ms, should be under 100ms`);

        // Verify cleanup
        mockEditors.forEach(editor => {
            expect(editor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
        });
    });

    test('should handle API rate limiting gracefully', async () => {
        let requestCount = 0;
        
        // Mock API with rate limiting
        jest.spyOn(geminiClient, 'explainCode').mockImplementation(async () => {
            requestCount++;
            if (requestCount > 5) {
                const error = new Error('Rate limit exceeded');
                (error as any).status = 429;
                throw error;
            }
            return 'Test explanation';
        });

        const mockDocument = {
            languageId: 'javascript',
            lineAt: () => ({ text: 'const x = 5;' }),
            lineCount: 1
        } as any;

        const selection = new vscode.Selection(0, 0, 0, 10);
        const results = [];

        // Make requests until rate limited
        for (let i = 0; i < 10; i++) {
            try {
                const result = await integrationService.processCodeExplanation(mockDocument, selection);
                results.push(result);
            } catch (error) {
                results.push({ success: false, error: error instanceof Error ? error.message : String(error) });
            }
        }

        // First 5 should succeed, rest should fail
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        assert.ok(successCount > 0, 'Some requests should succeed');
        assert.ok(failCount > 0, 'Some requests should fail due to rate limiting');
    });

    test('should maintain performance with explanation history', () => {
        const startTime = Date.now();

        // Add many explanations to history
        for (let i = 0; i < 100; i++) {
            webviewProvider.updateContent(
                `Explanation ${i}`.repeat(100), // Large explanation
                `code snippet ${i}`,
                'javascript'
            );
        }

        const endTime = Date.now();
        const duration = endTime - startTime;

        // Should handle large history efficiently
        assert.ok(duration < 500, `History operations took ${duration}ms, should be under 500ms`);

        // History should be limited to prevent memory issues
        const history = webviewProvider.getExplanationHistory();
        assert.ok(history.length <= 10, `History should be limited to 10 items, got ${history.length}`);
    });

    test('should handle stress test with rapid operations', async () => {
        const mockDocument = {
            lineCount: 100,
            languageId: 'javascript',
            lineAt: (line: number) => ({ text: `const var${line} = ${line};` })
        } as any;

        const mockEditor = {
            document: mockDocument,
            setDecorations: jest.fn(),
            revealRange: jest.fn()
        } as any;

        const startTime = Date.now();
        const operations = [];

        // Perform many operations rapidly
        for (let i = 0; i < 50; i++) {
            // Code analysis
            operations.push(codeAnalysis.findRelatedLines(mockDocument, i % 100));
            
            // Decorations
            decorationManager.highlightLines(mockEditor, [i, i + 1, i + 2]);
            
            // Webview updates
            webviewProvider.updateContent(`Explanation ${i}`, `code ${i}`, 'javascript');
        }

        await Promise.all(operations);
        const endTime = Date.now();

        const duration = endTime - startTime;

        // Stress test should complete within reasonable time
        assert.ok(duration < 2000, `Stress test took ${duration}ms, should be under 2000ms`);

        // Cleanup
        decorationManager.clearHighlights();
    });
});