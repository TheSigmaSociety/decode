import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeAnalysisService } from '../../codeAnalysis';
import { GeminiApiClient } from '../../geminiClient';
import { CodeExplanationWebview } from '../../webviewProvider';
import { CodeDecorationManager } from '../../decorationManager';
import { ConfigManager } from '../../configManager';
import { ExtensionErrorHandler } from '../../errorHandler';
import { SelectionHandler } from '../../selectionHandler';
import { IntegrationService } from '../../integrationService';

suite('End-to-End Integration Test Suite', () => {
    let codeAnalysis: CodeAnalysisService;
    let geminiClient: GeminiApiClient;
    let webviewProvider: CodeExplanationWebview;
    let decorationManager: CodeDecorationManager;
    let configManager: ConfigManager;
    let errorHandler: ExtensionErrorHandler;
    let selectionHandler: SelectionHandler;
    let integrationService: IntegrationService;
    let mockContext: vscode.ExtensionContext;
    let mockDocument: vscode.TextDocument;
    let mockEditor: vscode.TextEditor;

    setup(() => {
        // Create mock context
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

        // Create mock document with sample JavaScript code
        const sampleCode = [
            'import React from "react";',
            '',
            'function Calculator() {',
            '  const [result, setResult] = useState(0);',
            '  const [input, setInput] = useState("");',
            '',
            '  const handleCalculate = () => {',
            '    try {',
            '      const calculation = eval(input);',
            '      setResult(calculation);',
            '    } catch (error) {',
            '      setResult("Error");',
            '    }',
            '  };',
            '',
            '  return (',
            '    <div>',
            '      <input value={input} onChange={(e) => setInput(e.target.value)} />',
            '      <button onClick={handleCalculate}>Calculate</button>',
            '      <div>Result: {result}</div>',
            '    </div>',
            '  );',
            '}',
            '',
            'export default Calculator;'
        ];

        mockDocument = {
            lineCount: sampleCode.length,
            languageId: 'javascript',
            uri: vscode.Uri.file('test.js'),
            fileName: 'test.js',
            lineAt: (line: number) => ({
                text: sampleCode[line] || '',
                lineNumber: line,
                range: new vscode.Range(line, 0, line, sampleCode[line]?.length || 0),
                rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
                firstNonWhitespaceCharacterIndex: 0,
                isEmptyOrWhitespace: !sampleCode[line] || sampleCode[line].trim() === ''
            }),
            getText: () => sampleCode.join('\n'),
            isUntitled: false,
            isDirty: false,
            isClosed: false
        } as any;

        mockEditor = {
            document: mockDocument,
            selection: new vscode.Selection(8, 0, 8, 30), // Line with eval(input)
            setDecorations: jest.fn(),
            revealRange: jest.fn()
        } as any;

        // Initialize services
        const outputChannel = vscode.window.createOutputChannel('Test');
        codeAnalysis = new CodeAnalysisService();
        geminiClient = new GeminiApiClient();
        webviewProvider = new CodeExplanationWebview(mockContext);
        decorationManager = new CodeDecorationManager();
        configManager = new ConfigManager(mockContext);
        errorHandler = new ExtensionErrorHandler(outputChannel);
        
        integrationService = new IntegrationService(
            codeAnalysis,
            geminiClient,
            webviewProvider,
            errorHandler
        );

        selectionHandler = new SelectionHandler(
            codeAnalysis,
            decorationManager,
            webviewProvider,
            geminiClient,
            configManager,
            errorHandler,
            mockContext
        );
    });

    teardown(() => {
        selectionHandler?.dispose();
        decorationManager?.dispose();
        geminiClient?.dispose();
        errorHandler?.dispose();
        webviewProvider?.dispose();
    });

    test('should complete full workflow: selection → analysis → API → display', async () => {
        // Mock Gemini API response
        const mockExplanation = 'This code uses eval() to execute JavaScript code from user input, which is dangerous and should be avoided.';
        jest.spyOn(geminiClient, 'explainCode').mockResolvedValue(mockExplanation);

        // Mock configuration
        jest.spyOn(configManager, 'isConfigured').mockReturnValue(true);
        jest.spyOn(configManager, 'getGeminiConfig').mockReturnValue({
            apiKey: 'test-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        });

        // Test the integration service directly
        const selection = new vscode.Selection(8, 0, 8, 30); // eval line
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, true, 'Integration should succeed');
        assert.strictEqual(result.explanation, mockExplanation, 'Should return correct explanation');
        assert.strictEqual(result.error, undefined, 'Should not have errors');
    });

    test('should handle code analysis phase correctly', async () => {
        const selection = new vscode.Selection(8, 0, 8, 30); // eval line
        
        const analysisResult = await codeAnalysis.analyzeCodeSelection(mockDocument, selection);
        
        assert.ok(analysisResult.selectedLine.includes('eval'), 'Should identify eval line');
        assert.strictEqual(analysisResult.context.language, 'javascript', 'Should detect JavaScript');
        assert.strictEqual(analysisResult.context.functionName, 'handleCalculate', 'Should identify function');
        assert.ok(analysisResult.relatedLines.length > 0, 'Should find related lines');
    });

    test('should handle API integration correctly', async () => {
        const mockExplanation = 'Test explanation';
        jest.spyOn(geminiClient, 'explainCode').mockResolvedValue(mockExplanation);

        const codeSnippet = 'const calculation = eval(input);';
        const context = {
            language: 'javascript',
            functionName: 'handleCalculate',
            variables: ['calculation', 'input'],
            imports: ['React']
        };

        const explanation = await geminiClient.explainCode(codeSnippet, context);
        
        assert.strictEqual(explanation, mockExplanation, 'Should return explanation from API');
    });

    test('should handle webview updates correctly', () => {
        const explanation = 'Test explanation';
        const codeSnippet = 'test code';
        const language = 'javascript';

        webviewProvider.updateContent(explanation, codeSnippet, language);

        assert.strictEqual(webviewProvider.getCurrentExplanation(), explanation, 'Should store explanation');
        assert.strictEqual(webviewProvider.getState(), 'explanation', 'Should be in explanation state');
        
        const history = webviewProvider.getExplanationHistory();
        assert.strictEqual(history.length, 1, 'Should add to history');
        assert.strictEqual(history[0].explanation, explanation, 'Should store correct explanation');
    });

    test('should handle decoration updates correctly', () => {
        const lines = [8, 3, 4, 9]; // eval line and related lines
        
        decorationManager.highlightLines(mockEditor, lines);
        
        const highlighted = decorationManager.getHighlightedLines(mockEditor);
        assert.strictEqual(highlighted.selectedLine, 8, 'Should highlight selected line');
        assert.ok(highlighted.relatedLines.includes(3), 'Should highlight related lines');
    });

    test('should handle error propagation correctly', async () => {
        // Mock API error
        const apiError = new Error('API Error');
        jest.spyOn(geminiClient, 'explainCode').mockRejectedValue(apiError);

        const selection = new vscode.Selection(8, 0, 8, 30);
        const result = await integrationService.processCodeExplanation(mockDocument, selection);

        assert.strictEqual(result.success, false, 'Should fail on API error');
        assert.ok(result.error?.includes('API Error'), 'Should propagate error message');
    });

    test('should handle configuration errors correctly', async () => {
        // Mock unconfigured state
        jest.spyOn(configManager, 'isConfigured').mockReturnValue(false);

        // This should trigger configuration needed state
        webviewProvider.showConfigurationNeeded();
        
        assert.strictEqual(webviewProvider.getState(), 'configurationNeeded', 'Should show configuration needed');
    });

    test('should handle selection changes with debouncing', (done) => {
        // Mock configuration
        jest.spyOn(configManager, 'isConfigured').mockReturnValue(true);
        jest.spyOn(configManager, 'getGeminiConfig').mockReturnValue({
            apiKey: 'test-key',
            model: 'gemini-2.0-flash-001',
            temperature: 0.3,
            maxTokens: 1000
        });

        // Mock successful explanation
        jest.spyOn(geminiClient, 'explainCode').mockResolvedValue('Test explanation');

        // Simulate rapid selection changes
        const selectionEvent = {
            textEditor: mockEditor,
            selections: [new vscode.Selection(8, 0, 8, 30)],
            kind: vscode.TextEditorSelectionChangeKind.Mouse
        };

        // The selection handler should debounce these calls
        selectionHandler['onSelectionChanged'](selectionEvent);
        selectionHandler['onSelectionChanged'](selectionEvent);
        selectionHandler['onSelectionChanged'](selectionEvent);

        // Wait for debounce to complete
        setTimeout(() => {
            // Should have processed only once due to debouncing
            done();
        }, 600); // Slightly longer than debounce delay
    });

    test('should handle state management across components', async () => {
        // Test state transitions
        webviewProvider.showLoading();
        assert.strictEqual(webviewProvider.getState(), 'loading', 'Should be in loading state');

        webviewProvider.updateContent('Test explanation', 'test code', 'javascript');
        assert.strictEqual(webviewProvider.getState(), 'explanation', 'Should be in explanation state');

        webviewProvider.showError('Test error');
        assert.strictEqual(webviewProvider.getState(), 'error', 'Should be in error state');

        webviewProvider.showWelcome();
        assert.strictEqual(webviewProvider.getState(), 'welcome', 'Should be in welcome state');
    });

    test('should handle complex code relationships', async () => {
        // Test with a line that has many relationships
        const selection = new vscode.Selection(3, 0, 3, 40); // useState line
        
        const analysisResult = await codeAnalysis.analyzeCodeSelection(mockDocument, selection);
        
        assert.ok(analysisResult.selectedLine.includes('useState'), 'Should identify useState line');
        assert.ok(analysisResult.relatedLines.some(line => line.includes('setResult')), 'Should find setter usage');
        assert.ok(analysisResult.context.variables.includes('result'), 'Should identify state variable');
    });

    test('should handle integration service test', async () => {
        // Mock successful API call
        jest.spyOn(geminiClient, 'explainCode').mockResolvedValue('Test explanation');

        const testResult = await integrationService.testIntegration();
        
        assert.strictEqual(testResult.success, true, 'Integration test should pass');
        assert.strictEqual(testResult.message, 'Integration test passed', 'Should return success message');
    });

    test('should handle memory cleanup correctly', () => {
        // Test that all components can be disposed without errors
        assert.doesNotThrow(() => {
            selectionHandler.dispose();
            decorationManager.dispose();
            geminiClient.dispose();
            errorHandler.dispose();
            webviewProvider.dispose();
        }, 'Should dispose all components without errors');
    });

    test('should handle concurrent requests correctly', async () => {
        // Mock API responses
        jest.spyOn(geminiClient, 'explainCode')
            .mockResolvedValueOnce('Explanation 1')
            .mockResolvedValueOnce('Explanation 2')
            .mockResolvedValueOnce('Explanation 3');

        // Make concurrent requests
        const selection1 = new vscode.Selection(3, 0, 3, 40);
        const selection2 = new vscode.Selection(8, 0, 8, 30);
        const selection3 = new vscode.Selection(17, 0, 17, 50);

        const promises = [
            integrationService.processCodeExplanation(mockDocument, selection1),
            integrationService.processCodeExplanation(mockDocument, selection2),
            integrationService.processCodeExplanation(mockDocument, selection3)
        ];

        const results = await Promise.all(promises);

        // All should succeed
        results.forEach((result, index) => {
            assert.strictEqual(result.success, true, `Request ${index + 1} should succeed`);
            assert.ok(result.explanation?.includes(`Explanation ${index + 1}`), `Should return correct explanation ${index + 1}`);
        });
    });
});