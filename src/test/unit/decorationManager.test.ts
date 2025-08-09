import * as assert from 'assert';

// Mock vscode module first
const mockCreateTextEditorDecorationType = jest.fn();
const mockSetDecorations = jest.fn();
const mockRevealRange = jest.fn();

jest.mock('vscode', () => ({
    window: {
        createTextEditorDecorationType: mockCreateTextEditorDecorationType,
        onDidChangeVisibleTextEditors: jest.fn(() => ({ dispose: jest.fn() })),
        activeTextEditor: undefined
    },
    ThemeColor: jest.fn((color: string) => ({ id: color })),
    OverviewRulerLane: {
        Right: 1,
        Center: 2
    },
    Range: jest.fn((start, end) => ({ start, end })),
    Position: jest.fn((line, character) => ({ line, character })),
    TextEditorRevealType: {
        InCenterIfOutsideViewport: 1
    }
}));

import * as vscode from 'vscode';
import { CodeDecorationManager } from '../../decorationManager';

describe('CodeDecorationManager Test Suite', () => {
    let decorationManager: CodeDecorationManager;
    let mockEditor: any;
    let mockDocument: any;

    beforeEach(() => {
        // Reset mocks
        mockCreateTextEditorDecorationType.mockReset();
        mockSetDecorations.mockReset();
        mockRevealRange.mockReset();

        // Mock decoration type
        const mockDecorationType = {
            dispose: jest.fn()
        };
        mockCreateTextEditorDecorationType.mockReturnValue(mockDecorationType);

        // Mock document
        mockDocument = {
            lineCount: 10,
            lineAt: (line: number) => ({
                text: `Line ${line} content`,
                range: new vscode.Range(new vscode.Position(line, 0), new vscode.Position(line, 20))
            }),
            isClosed: false
        };

        // Mock editor
        mockEditor = {
            document: mockDocument,
            setDecorations: mockSetDecorations,
            revealRange: mockRevealRange
        };

        decorationManager = new CodeDecorationManager();
    });

    afterEach(() => {
        decorationManager.dispose();
    });

    test('should create decoration types on initialization', () => {
        expect(mockCreateTextEditorDecorationType).toHaveBeenCalledTimes(2);
    });

    test('should highlight lines correctly', () => {
        const lines = [5, 2, 8, 3];
        
        decorationManager.highlightLines(mockEditor, lines);

        // Should call setDecorations twice (selected line + related lines)
        expect(mockSetDecorations).toHaveBeenCalledTimes(2);
        
        // Should reveal the selected line (first line in array)
        expect(mockRevealRange).toHaveBeenCalledTimes(1);
    });

    test('should clear highlights correctly', () => {
        // First highlight some lines
        decorationManager.highlightLines(mockEditor, [1, 2, 3]);
        
        // Then clear
        decorationManager.clearHighlights();

        // Should call setDecorations with empty arrays to clear
        expect(mockSetDecorations).toHaveBeenCalledWith(expect.anything(), []);
    });

    test('should update highlights correctly', () => {
        const selectedLine = 3;
        const relatedLines = [1, 5, 7];

        decorationManager.updateHighlights(selectedLine, relatedLines, mockEditor);

        expect(mockSetDecorations).toHaveBeenCalledTimes(2);
        expect(mockRevealRange).toHaveBeenCalledTimes(1);
    });

    test('should get highlighted lines correctly', () => {
        const lines = [5, 2, 8];
        decorationManager.highlightLines(mockEditor, lines);

        const highlighted = decorationManager.getHighlightedLines(mockEditor);
        
        // First line should be selected line
        assert.strictEqual(highlighted.selectedLine, 5);
        // Rest should be related lines
        assert.deepStrictEqual(highlighted.relatedLines.sort(), [2, 8]);
    });

    test('should detect if line is highlighted', () => {
        const lines = [3, 7, 9];
        decorationManager.highlightLines(mockEditor, lines);

        assert.strictEqual(decorationManager.isLineHighlighted(3, mockEditor), true);
        assert.strictEqual(decorationManager.isLineHighlighted(7, mockEditor), true);
        assert.strictEqual(decorationManager.isLineHighlighted(9, mockEditor), true);
        assert.strictEqual(decorationManager.isLineHighlighted(1, mockEditor), false);
    });

    test('should handle empty lines array', () => {
        decorationManager.highlightLines(mockEditor, []);

        // Should clear highlights when empty array is passed
        expect(mockSetDecorations).toHaveBeenCalledWith(expect.anything(), []);
    });

    test('should handle invalid line numbers gracefully', () => {
        // Mock document with limited lines
        mockDocument.lineCount = 5;
        
        const lines = [2, 10, -1, 3]; // 10 and -1 are invalid
        
        assert.doesNotThrow(() => {
            decorationManager.highlightLines(mockEditor, lines);
        });
    });

    test('should clear highlights for specific editor', () => {
        const anotherMockEditor = {
            document: mockDocument,
            setDecorations: jest.fn(),
            revealRange: jest.fn(),
            selection: new vscode.Selection(0, 0, 0, 0),
            selections: [new vscode.Selection(0, 0, 0, 0)],
            visibleRanges: [new vscode.Range(0, 0, 10, 0)],
            options: {},
            viewColumn: 1,
            edit: jest.fn(),
            insertSnippet: jest.fn(),
            show: jest.fn(),
            hide: jest.fn()
        } as any;

        // Highlight lines in both editors
        decorationManager.highlightLines(mockEditor, [1, 2]);
        decorationManager.highlightLines(anotherMockEditor, [3, 4]);

        // Clear highlights should clear both editors
        decorationManager.clearHighlights();

        expect(mockSetDecorations).toHaveBeenCalledWith(expect.anything(), []);
        expect(anotherMockEditor.setDecorations).toHaveBeenCalledWith(expect.anything(), []);
    });

    test('should handle editor without active document', () => {
        const editorWithoutDoc = {
            document: null,
            setDecorations: mockSetDecorations,
            revealRange: mockRevealRange
        };

        assert.doesNotThrow(() => {
            decorationManager.highlightLines(editorWithoutDoc as any, [1, 2]);
        });
    });

    test('should return empty highlights for non-existent editor', () => {
        const highlighted = decorationManager.getHighlightedLines(undefined);
        
        assert.strictEqual(highlighted.selectedLine, null);
        assert.deepStrictEqual(highlighted.relatedLines, []);
    });

    test('should handle line range creation correctly', () => {
        // Test with valid line numbers
        decorationManager.updateHighlights(2, [4, 6], mockEditor);
        
        expect(mockSetDecorations).toHaveBeenCalledTimes(2);
        
        // Verify that ranges were created (indirectly through setDecorations calls)
        const selectedLineCall = mockSetDecorations.mock.calls.find(call => 
            call[1].length === 1 // Selected line decoration should have 1 range
        );
        const relatedLinesCall = mockSetDecorations.mock.calls.find(call => 
            call[1].length === 2 // Related lines decoration should have 2 ranges
        );
        
        expect(selectedLineCall).toBeDefined();
        expect(relatedLinesCall).toBeDefined();
    });

    test('should dispose correctly', () => {
        const mockDispose = jest.fn();
        mockCreateTextEditorDecorationType.mockReturnValue({
            dispose: mockDispose
        });

        const manager = new CodeDecorationManager();
        manager.dispose();

        // Should dispose decoration types
        expect(mockDispose).toHaveBeenCalledTimes(2);
    });

    test('should handle scroll to range', () => {
        decorationManager.updateHighlights(5, [2, 8], mockEditor);
        
        // Should call revealRange to scroll to the selected line
        expect(mockRevealRange).toHaveBeenCalledWith(
            expect.anything(),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport
        );
    });

    test('should filter out duplicate lines', () => {
        const selectedLine = 3;
        const relatedLines = [1, 3, 5, 3, 7]; // 3 appears multiple times
        
        decorationManager.updateHighlights(selectedLine, relatedLines, mockEditor);
        
        // Should not include the selected line in related lines decorations
        const relatedLinesCall = mockSetDecorations.mock.calls.find(call => 
            call[1].length > 1 // Related lines call
        );
        
        // Should have 3 ranges (1, 5, 7) not including the duplicate 3
        expect(relatedLinesCall[1]).toHaveLength(3);
    });
});