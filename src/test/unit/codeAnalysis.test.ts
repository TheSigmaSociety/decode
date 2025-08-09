import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeAnalysisService } from '../../codeAnalysis';
import { AnalysisError } from '../../types';

describe('CodeAnalysisService Test Suite', () => {
    let analysisService: CodeAnalysisService;
    let mockDocument: vscode.TextDocument;

    beforeEach(() => {
        analysisService = new CodeAnalysisService();
        
        // Create a mock document with sample code
        const sampleCode = [
            'import React from "react";',
            'import { useState } from "react";',
            '',
            'class TestClass {',
            '  constructor() {',
            '    this.value = 0;',
            '  }',
            '',
            '  testMethod() {',
            '    const x = 5;',
            '    const y = 10;',
            '    if (x > 0) {',
            '      console.log(x + y);',
            '      this.value = x;',
            '    }',
            '    return this.value;',
            '  }',
            '}',
            '',
            'function testFunction() {',
            '  const instance = new TestClass();',
            '  return instance.testMethod();',
            '}'
        ];

        mockDocument = {
            lineCount: sampleCode.length,
            lineAt: ((lineOrPosition: number | vscode.Position) => {
                const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
                return {
                    text: sampleCode[line] || '',
                    lineNumber: line,
                    range: new vscode.Range(line, 0, line, sampleCode[line]?.length || 0),
                    rangeIncludingLineBreak: new vscode.Range(line, 0, line + 1, 0),
                    firstNonWhitespaceCharacterIndex: 0,
                    isEmptyOrWhitespace: !sampleCode[line] || sampleCode[line].trim() === ''
                };
            }) as any,
            languageId: 'typescript',
            uri: vscode.Uri.file('test.ts'),
            fileName: 'test.ts',
            isUntitled: false,
            isDirty: false,
            isClosed: false,
            save: () => Promise.resolve(true),
            eol: vscode.EndOfLine.LF,
            version: 1,
            getText: (range?: vscode.Range) => {
                if (!range) {
                    return sampleCode.join('\n');
                }
                return sampleCode.slice(range.start.line, range.end.line + 1).join('\n');
            },
            getWordRangeAtPosition: () => undefined,
            validateRange: (range: vscode.Range) => range,
            validatePosition: (position: vscode.Position) => position,
            offsetAt: () => 0,
            positionAt: () => new vscode.Position(0, 0),
            encoding: 'utf8'
        } as vscode.TextDocument;
    });

    test('should find variable relationships correctly', () => {
        // Test line with variable usage: console.log(x + y);
        const targetLine = 12;
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include the target line and variable declarations
        assert.ok(relatedLines.includes(targetLine), 'Should include target line');
        assert.ok(relatedLines.includes(9), 'Should include x declaration line');
        assert.ok(relatedLines.includes(10), 'Should include y declaration line');
    });

    test('should find function relationships correctly', () => {
        // Test line with method call: return instance.testMethod();
        const targetLine = 21;
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include the target line and method definition
        assert.ok(relatedLines.includes(targetLine), 'Should include target line');
        assert.ok(relatedLines.includes(8), 'Should include testMethod definition');
    });

    test('should find control flow relationships correctly', () => {
        // Test if statement line
        const targetLine = 11;
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include the if statement and its closing brace
        assert.ok(relatedLines.includes(targetLine), 'Should include if statement');
        assert.ok(relatedLines.includes(14), 'Should include closing brace of if block');
    });

    test('should find import relationships correctly', () => {
        // Test line using React (imported)
        const targetLine = 20; // Line with TestClass usage
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include class definition
        assert.ok(relatedLines.includes(3), 'Should include class definition');
    });

    test('should find class member relationships correctly', () => {
        // Test line with this.value usage
        const targetLine = 13;
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include constructor where this.value is initialized
        assert.ok(relatedLines.includes(targetLine), 'Should include target line');
        assert.ok(relatedLines.includes(5), 'Should include constructor with this.value initialization');
    });

    test('should analyze code selection correctly', async () => {
        const selection = new vscode.Selection(12, 0, 12, 20); // console.log(x + y);
        
        const result = await analysisService.analyzeCodeSelection(mockDocument, selection);
        
        assert.strictEqual(result.selectedLine.trim(), 'console.log(x + y);');
        assert.ok(result.relatedLines.length > 0, 'Should have related lines');
        assert.strictEqual(result.context.language, 'typescript');
        assert.ok(result.context.variables.includes('x') || result.context.variables.includes('y'), 'Should include variables from context');
    });

    test('should build code context correctly', async () => {
        const selection = new vscode.Selection(13, 0, 13, 15); // this.value = x;
        
        const result = await analysisService.analyzeCodeSelection(mockDocument, selection);
        
        assert.strictEqual(result.context.functionName, 'testMethod');
        assert.strictEqual(result.context.className, 'TestClass');
        assert.strictEqual(result.context.language, 'typescript');
        assert.ok(result.context.imports.length > 0, 'Should have imports');
    });

    test('should handle control structure boundaries correctly', () => {
        // Test finding boundaries of if statement
        const targetLine = 11; // if (x > 0) {
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include both opening and closing of the if block
        assert.ok(relatedLines.includes(11), 'Should include if statement');
        assert.ok(relatedLines.includes(14), 'Should include closing brace');
    });

    test('should handle class boundaries correctly', () => {
        // Test line inside class
        const targetLine = 13; // this.value = x;
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include class declaration and constructor
        assert.ok(relatedLines.includes(3), 'Should include class declaration');
        assert.ok(relatedLines.includes(4), 'Should include constructor');
    });

    test('should handle errors gracefully', async () => {
        // Create a mock document that will cause an error
        const errorDocument = {
            ...mockDocument,
            lineAt: () => {
                throw new Error('Mock error');
            }
        } as vscode.TextDocument;

        const selection = new vscode.Selection(0, 0, 0, 5);
        
        try {
            await analysisService.analyzeCodeSelection(errorDocument, selection);
            assert.fail('Should have thrown an AnalysisError');
        } catch (error) {
            assert.ok(error instanceof AnalysisError);
            assert.ok(error.message.includes('Failed to analyze code selection'));
        }
    });

    test('should find return statement relationships', () => {
        // Test return statement
        const targetLine = 15; // return this.value;
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include the method definition
        assert.ok(relatedLines.includes(8), 'Should include method definition');
        assert.ok(relatedLines.includes(5), 'Should include this.value initialization');
    });

    test('should categorize imports correctly', () => {
        // This tests the private method indirectly through findRelatedLines
        const targetLine = 20; // Line that might use imported items
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should find import statements when relevant
        // The exact behavior depends on the identifiers found in the target line
        assert.ok(relatedLines.includes(targetLine), 'Should include target line');
    });

    test('should handle empty or whitespace lines', () => {
        const targetLine = 2; // Empty line
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should at least include the target line
        assert.ok(relatedLines.includes(targetLine), 'Should include target line even if empty');
        assert.strictEqual(relatedLines.length, 1, 'Empty line should only relate to itself');
    });

    test('should find constructor relationships', () => {
        // Test constructor line
        const targetLine = 4; // constructor() {
        const relatedLines = analysisService.findRelatedLines(mockDocument, targetLine);
        
        // Should include class declaration and property initializations
        assert.ok(relatedLines.includes(3), 'Should include class declaration');
        assert.ok(relatedLines.includes(5), 'Should include property initialization');
    });
});