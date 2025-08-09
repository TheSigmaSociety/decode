import * as vscode from 'vscode';
import { 
    CodeAnalysisEngine, 
    CodeAnalysisResult, 
    CodeContext, 
    LineRelationship, 
    RelationshipType,
    AnalysisError 
} from './types';

export class CodeAnalysisService implements CodeAnalysisEngine {
    
    async analyzeCodeSelection(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): Promise<CodeAnalysisResult> {
        try {
            const selectedLine = document.lineAt(selection.start.line).text;
            const relatedLineNumbers = this.findRelatedLines(document, selection.start.line);
            
            // Get the actual content of related lines
            const relatedLines = relatedLineNumbers.map(lineNum => 
                document.lineAt(lineNum).text
            );

            const context = await this.buildCodeContext(document, selection.start.line);

            return {
                selectedLine,
                relatedLines,
                context
            };
        } catch (error: any) {
            throw new AnalysisError(
                `Failed to analyze code selection: ${error.message}`,
                selection.start.line
            );
        }
    }

    findRelatedLines(document: vscode.TextDocument, targetLine: number): number[] {
        const relatedLines = new Set<number>();
        const targetLineText = document.lineAt(targetLine).text;
        
        // Always include the target line
        relatedLines.add(targetLine);

        try {
            // Find variable declarations and usages
            this.findVariableRelationships(document, targetLine, targetLineText, relatedLines);
            
            // Find function calls and definitions
            this.findFunctionRelationships(document, targetLine, targetLineText, relatedLines);
            
            // Find control flow relationships (enhanced)
            this.enhancedControlFlowAnalysis(document, targetLine, relatedLines);
            
            // Find import dependencies (enhanced)
            this.enhancedImportAnalysis(document, targetLineText, relatedLines);
            
            // Find class member relationships
            this.findClassMemberRelationships(document, targetLine, targetLineText, relatedLines);

        } catch (error: any) {
            // Log error but don't fail completely - return at least the target line
            console.warn(`Error finding relationships for line ${targetLine}: ${error.message}`);
        }

        return Array.from(relatedLines).sort((a, b) => a - b);
    }

    private findVariableRelationships(
        document: vscode.TextDocument,
        targetLine: number,
        targetLineText: string,
        relatedLines: Set<number>
    ): void {
        // Extract variable names from the target line
        const variablePatterns = [
            /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g, // Variable declarations
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g, // Assignments
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g, // Function calls
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\./g, // Property access
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\[/g // Array access
        ];

        const variables = new Set<string>();
        
        for (const pattern of variablePatterns) {
            let match;
            while ((match = pattern.exec(targetLineText)) !== null) {
                variables.add(match[1]);
            }
        }

        // Search for these variables in other lines
        for (let i = 0; i < document.lineCount; i++) {
            if (i === targetLine) continue;
            
            const lineText = document.lineAt(i).text;
            
            for (const variable of variables) {
                // Check if this line contains the variable
                const variableRegex = new RegExp(`\\b${variable}\\b`, 'g');
                if (variableRegex.test(lineText)) {
                    relatedLines.add(i);
                }
            }
        }
    }

    private findFunctionRelationships(
        document: vscode.TextDocument,
        targetLine: number,
        targetLineText: string,
        relatedLines: Set<number>
    ): void {
        // Find function calls in the target line
        const functionCallPattern = /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g;
        let match;
        
        while ((match = functionCallPattern.exec(targetLineText)) !== null) {
            const functionName = match[1];
            
            // Skip common keywords and built-in functions
            if (this.isBuiltInFunction(functionName)) {
                continue;
            }
            
            // Look for function definitions
            const functionDefPatterns = [
                new RegExp(`function\\s+${functionName}\\s*\\(`, 'g'),
                new RegExp(`const\\s+${functionName}\\s*=\\s*function`, 'g'),
                new RegExp(`const\\s+${functionName}\\s*=\\s*\\(`, 'g'),
                new RegExp(`${functionName}\\s*:\\s*function`, 'g'),
                new RegExp(`${functionName}\\s*\\(.*\\)\\s*=>`, 'g')
            ];
            
            for (let i = 0; i < document.lineCount; i++) {
                if (i === targetLine) continue;
                
                const lineText = document.lineAt(i).text;
                
                for (const pattern of functionDefPatterns) {
                    if (pattern.test(lineText)) {
                        relatedLines.add(i);
                    }
                }
            }
        }
    }

    private findControlFlowRelationships(
        document: vscode.TextDocument,
        targetLine: number,
        relatedLines: Set<number>
    ): void {
        const targetLineText = document.lineAt(targetLine).text.trim();
        
        // If target line is a control structure, find its boundaries
        if (this.isControlStructure(targetLineText)) {
            const boundaries = this.findControlStructureBoundaries(document, targetLine);
            boundaries.forEach(line => relatedLines.add(line));
        } else {
            // If target line is inside a control structure, find the control structure
            const controlLine = this.findContainingControlStructure(document, targetLine);
            if (controlLine !== -1) {
                relatedLines.add(controlLine);
                
                // Also add the boundaries of that control structure
                const boundaries = this.findControlStructureBoundaries(document, controlLine);
                boundaries.forEach(line => relatedLines.add(line));
            }
        }
    }

    private findImportRelationships(
        document: vscode.TextDocument,
        targetLineText: string,
        relatedLines: Set<number>
    ): void {
        // Extract imported names from target line usage
        const importedNames = this.extractPotentialImports(targetLineText);
        
        if (importedNames.length === 0) return;
        
        // Look for import statements that might be related
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            if (this.isImportStatement(lineText)) {
                for (const name of importedNames) {
                    if (lineText.includes(name)) {
                        relatedLines.add(i);
                    }
                }
            }
        }
    }

    private async buildCodeContext(
        document: vscode.TextDocument,
        targetLine: number
    ): Promise<CodeContext> {
        const language = document.languageId;
        const variables: string[] = [];
        const imports: string[] = [];
        
        // Find containing function
        const functionName = this.findContainingFunction(document, targetLine);
        
        // Find containing class
        const className = this.findContainingClass(document, targetLine);
        
        // Extract variables from the target line and nearby lines
        const startLine = Math.max(0, targetLine - 5);
        const endLine = Math.min(document.lineCount - 1, targetLine + 5);
        
        for (let i = startLine; i <= endLine; i++) {
            const lineText = document.lineAt(i).text;
            
            // Extract variable declarations
            const varMatches = lineText.match(/(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
            if (varMatches) {
                varMatches.forEach(match => {
                    const varName = match.split(/\s+/)[1];
                    if (!variables.includes(varName)) {
                        variables.push(varName);
                    }
                });
            }
        }
        
        // Extract imports from the beginning of the file
        for (let i = 0; i < Math.min(50, document.lineCount); i++) {
            const lineText = document.lineAt(i).text;
            if (this.isImportStatement(lineText)) {
                imports.push(lineText.trim());
            }
        }

        return {
            functionName,
            className,
            variables,
            imports,
            language
        };
    }

    private isBuiltInFunction(name: string): boolean {
        const builtIns = [
            'console', 'log', 'error', 'warn', 'info',
            'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite',
            'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean',
            'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'break', 'continue', 'return'
        ];
        return builtIns.includes(name);
    }

    private isControlStructure(lineText: string): boolean {
        const controlPatterns = [
            /^\s*if\s*\(/,
            /^\s*else\s*if\s*\(/,
            /^\s*else\s*{?/,
            /^\s*for\s*\(/,
            /^\s*while\s*\(/,
            /^\s*do\s*{/,
            /^\s*switch\s*\(/,
            /^\s*case\s+.*:/,
            /^\s*default\s*:/,
            /^\s*try\s*{/,
            /^\s*catch\s*\(/,
            /^\s*finally\s*{/
        ];
        
        return controlPatterns.some(pattern => pattern.test(lineText));
    }

    private findControlStructureBoundaries(document: vscode.TextDocument, controlLine: number): number[] {
        const boundaries: number[] = [controlLine];
        const controlText = document.lineAt(controlLine).text;
        
        // Simple bracket matching to find the end of the control structure
        let braceCount = 0;
        let foundOpenBrace = false;
        
        for (let i = controlLine; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            for (const char of lineText) {
                if (char === '{') {
                    braceCount++;
                    foundOpenBrace = true;
                } else if (char === '}') {
                    braceCount--;
                    if (foundOpenBrace && braceCount === 0) {
                        boundaries.push(i);
                        return boundaries;
                    }
                }
            }
        }
        
        return boundaries;
    }

    private findContainingControlStructure(document: vscode.TextDocument, targetLine: number): number {
        // Look backwards for control structures
        for (let i = targetLine - 1; i >= 0; i--) {
            const lineText = document.lineAt(i).text;
            if (this.isControlStructure(lineText)) {
                // Check if the target line is within this control structure's scope
                const boundaries = this.findControlStructureBoundaries(document, i);
                if (boundaries.length > 1 && targetLine <= boundaries[boundaries.length - 1]) {
                    return i;
                }
            }
        }
        return -1;
    }

    private extractPotentialImports(lineText: string): string[] {
        const names: string[] = [];
        
        // Look for identifiers that might be imported
        const identifierPattern = /([A-Z][a-zA-Z0-9_]*)/g;
        let match;
        
        while ((match = identifierPattern.exec(lineText)) !== null) {
            names.push(match[1]);
        }
        
        return names;
    }

    private isImportStatement(lineText: string): boolean {
        const importPatterns = [
            /^\s*import\s+/,
            /^\s*from\s+['"`]/,
            /^\s*const\s+.*=\s*require\(/,
            /^\s*#include\s*</,
            /^\s*using\s+/,
            /^\s*from\s+\w+\s+import/
        ];
        
        return importPatterns.some(pattern => pattern.test(lineText));
    }

    private findContainingFunction(document: vscode.TextDocument, targetLine: number): string | undefined {
        // Look backwards for function definitions
        for (let i = targetLine - 1; i >= 0; i--) {
            const lineText = document.lineAt(i).text;
            
            const functionPatterns = [
                /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
                /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*function/,
                /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*\(/,
                /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function/,
                /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(.*\)\s*=>/
            ];
            
            for (const pattern of functionPatterns) {
                const match = pattern.exec(lineText);
                if (match) {
                    return match[1];
                }
            }
        }
        
        return undefined;
    }

    private findContainingClass(document: vscode.TextDocument, targetLine: number): string | undefined {
        // Look backwards for class definitions
        for (let i = targetLine - 1; i >= 0; i--) {
            const lineText = document.lineAt(i).text;
            
            const classPatterns = [
                /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
                /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
                /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/
            ];
            
            for (const pattern of classPatterns) {
                const match = pattern.exec(lineText);
                if (match) {
                    return match[1];
                }
            }
        }
        
        return undefined;
    }

    // Advanced code context analysis methods

    findClassMemberRelationships(
        document: vscode.TextDocument,
        targetLine: number,
        targetLineText: string,
        relatedLines: Set<number>
    ): void {
        const className = this.findContainingClass(document, targetLine);
        if (!className) return;

        // Find class boundaries
        const classBoundaries = this.findClassBoundaries(document, className);
        if (classBoundaries.start === -1 || classBoundaries.end === -1) return;

        // Extract member names from target line
        const memberNames = this.extractMemberNames(targetLineText);
        
        // Search for these members within the class
        for (let i = classBoundaries.start; i <= classBoundaries.end; i++) {
            if (i === targetLine) continue;
            
            const lineText = document.lineAt(i).text;
            
            for (const memberName of memberNames) {
                if (this.lineContainsMember(lineText, memberName)) {
                    relatedLines.add(i);
                }
            }
        }

        // Also include constructor and class declaration
        relatedLines.add(classBoundaries.start);
        const constructorLine = this.findConstructor(document, classBoundaries);
        if (constructorLine !== -1) {
            relatedLines.add(constructorLine);
        }
    }

    private findClassBoundaries(document: vscode.TextDocument, className: string): { start: number; end: number } {
        let start = -1;
        let end = -1;
        
        // Find class declaration
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            const classPattern = new RegExp(`class\\s+${className}\\b`);
            
            if (classPattern.test(lineText)) {
                start = i;
                break;
            }
        }
        
        if (start === -1) return { start: -1, end: -1 };
        
        // Find class end using brace matching
        let braceCount = 0;
        let foundOpenBrace = false;
        
        for (let i = start; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            for (const char of lineText) {
                if (char === '{') {
                    braceCount++;
                    foundOpenBrace = true;
                } else if (char === '}') {
                    braceCount--;
                    if (foundOpenBrace && braceCount === 0) {
                        end = i;
                        return { start, end };
                    }
                }
            }
        }
        
        return { start, end: document.lineCount - 1 };
    }

    private extractMemberNames(lineText: string): string[] {
        const members: string[] = [];
        
        // Property access patterns
        const propertyPatterns = [
            /this\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
            /self\.([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
            /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g // Method calls
        ];
        
        for (const pattern of propertyPatterns) {
            let match;
            while ((match = pattern.exec(lineText)) !== null) {
                members.push(match[1]);
            }
        }
        
        return [...new Set(members)]; // Remove duplicates
    }

    private lineContainsMember(lineText: string, memberName: string): boolean {
        const memberPatterns = [
            new RegExp(`\\b${memberName}\\s*\\(`), // Method definition
            new RegExp(`\\b${memberName}\\s*:`), // Property definition
            new RegExp(`\\bthis\\.${memberName}\\b`), // Property access
            new RegExp(`\\bself\\.${memberName}\\b`), // Python-style property access
            new RegExp(`\\b${memberName}\\s*=`), // Assignment
        ];
        
        return memberPatterns.some(pattern => pattern.test(lineText));
    }

    private findConstructor(document: vscode.TextDocument, classBoundaries: { start: number; end: number }): number {
        for (let i = classBoundaries.start; i <= classBoundaries.end; i++) {
            const lineText = document.lineAt(i).text;
            
            const constructorPatterns = [
                /constructor\s*\(/,
                /__init__\s*\(/,
                /def\s+__init__\s*\(/
            ];
            
            if (constructorPatterns.some(pattern => pattern.test(lineText))) {
                return i;
            }
        }
        
        return -1;
    }

    enhancedControlFlowAnalysis(
        document: vscode.TextDocument,
        targetLine: number,
        relatedLines: Set<number>
    ): void {
        const targetLineText = document.lineAt(targetLine).text.trim();
        
        // Handle different types of control structures
        if (this.isLoopStructure(targetLineText)) {
            this.findLoopRelationships(document, targetLine, relatedLines);
        } else if (this.isConditionalStructure(targetLineText)) {
            this.findConditionalRelationships(document, targetLine, relatedLines);
        } else if (this.isTryCatchStructure(targetLineText)) {
            this.findTryCatchRelationships(document, targetLine, relatedLines);
        } else if (this.isSwitchStructure(targetLineText)) {
            this.findSwitchRelationships(document, targetLine, relatedLines);
        }
        
        // Find break/continue statements related to loops
        if (this.isBreakOrContinue(targetLineText)) {
            this.findRelatedLoopStructure(document, targetLine, relatedLines);
        }
        
        // Find return statements and their function
        if (this.isReturnStatement(targetLineText)) {
            this.findRelatedFunctionStructure(document, targetLine, relatedLines);
        }
    }

    private isLoopStructure(lineText: string): boolean {
        return /^\s*(for|while|do)\s*[\(\{]/.test(lineText);
    }

    private isConditionalStructure(lineText: string): boolean {
        return /^\s*(if|else\s*if|else)\s*[\(\{]/.test(lineText);
    }

    private isTryCatchStructure(lineText: string): boolean {
        return /^\s*(try|catch|finally)\s*[\(\{]/.test(lineText);
    }

    private isSwitchStructure(lineText: string): boolean {
        return /^\s*(switch|case|default)\s*[\(\:]/.test(lineText);
    }

    private isBreakOrContinue(lineText: string): boolean {
        return /^\s*(break|continue)\s*;?/.test(lineText);
    }

    private isReturnStatement(lineText: string): boolean {
        return /^\s*return\b/.test(lineText);
    }

    private findLoopRelationships(document: vscode.TextDocument, loopLine: number, relatedLines: Set<number>): void {
        const boundaries = this.findControlStructureBoundaries(document, loopLine);
        boundaries.forEach(line => relatedLines.add(line));
        
        // Find break/continue statements within the loop
        if (boundaries.length > 1) {
            for (let i = loopLine + 1; i < boundaries[boundaries.length - 1]; i++) {
                const lineText = document.lineAt(i).text;
                if (this.isBreakOrContinue(lineText)) {
                    relatedLines.add(i);
                }
            }
        }
    }

    private findConditionalRelationships(document: vscode.TextDocument, condLine: number, relatedLines: Set<number>): void {
        relatedLines.add(condLine);
        
        // Find all related if/else if/else statements
        let currentLine = condLine;
        
        // Look forward for else if/else
        for (let i = condLine + 1; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text.trim();
            
            if (/^\s*else\s*if\s*\(/.test(lineText) || /^\s*else\s*\{?/.test(lineText)) {
                relatedLines.add(i);
                currentLine = i;
            } else if (lineText && !lineText.startsWith('}') && !this.isWhitespaceOrComment(lineText)) {
                break;
            }
        }
        
        // Find the boundaries of each conditional block
        const boundaries = this.findControlStructureBoundaries(document, condLine);
        boundaries.forEach(line => relatedLines.add(line));
    }

    private findTryCatchRelationships(document: vscode.TextDocument, tryLine: number, relatedLines: Set<number>): void {
        relatedLines.add(tryLine);
        
        // Find associated catch and finally blocks
        const boundaries = this.findControlStructureBoundaries(document, tryLine);
        if (boundaries.length > 1) {
            for (let i = tryLine + 1; i <= boundaries[boundaries.length - 1]; i++) {
                const lineText = document.lineAt(i).text.trim();
                if (/^\s*(catch|finally)\s*[\(\{]/.test(lineText)) {
                    relatedLines.add(i);
                }
            }
        }
    }

    private findSwitchRelationships(document: vscode.TextDocument, switchLine: number, relatedLines: Set<number>): void {
        const lineText = document.lineAt(switchLine).text;
        
        if (/^\s*switch\s*\(/.test(lineText)) {
            // Find all case and default statements
            const boundaries = this.findControlStructureBoundaries(document, switchLine);
            if (boundaries.length > 1) {
                for (let i = switchLine + 1; i < boundaries[boundaries.length - 1]; i++) {
                    const caseLineText = document.lineAt(i).text;
                    if (/^\s*(case|default)\s*/.test(caseLineText)) {
                        relatedLines.add(i);
                    }
                }
            }
        } else if (/^\s*(case|default)\s*/.test(lineText)) {
            // Find the switch statement and other cases
            for (let i = switchLine - 1; i >= 0; i--) {
                const switchLineText = document.lineAt(i).text;
                if (/^\s*switch\s*\(/.test(switchLineText)) {
                    this.findSwitchRelationships(document, i, relatedLines);
                    break;
                }
            }
        }
    }

    private findRelatedLoopStructure(document: vscode.TextDocument, breakLine: number, relatedLines: Set<number>): void {
        // Find the containing loop
        for (let i = breakLine - 1; i >= 0; i--) {
            const lineText = document.lineAt(i).text;
            if (this.isLoopStructure(lineText)) {
                relatedLines.add(i);
                this.findLoopRelationships(document, i, relatedLines);
                break;
            }
        }
    }

    private findRelatedFunctionStructure(document: vscode.TextDocument, returnLine: number, relatedLines: Set<number>): void {
        // Find the containing function
        const functionName = this.findContainingFunction(document, returnLine);
        if (functionName) {
            for (let i = returnLine - 1; i >= 0; i--) {
                const lineText = document.lineAt(i).text;
                if (lineText.includes(functionName) && /function|=>|:/.test(lineText)) {
                    relatedLines.add(i);
                    break;
                }
            }
        }
    }

    private isWhitespaceOrComment(lineText: string): boolean {
        const trimmed = lineText.trim();
        return trimmed === '' || 
               trimmed.startsWith('//') || 
               trimmed.startsWith('/*') || 
               trimmed.startsWith('*') ||
               trimmed.startsWith('#');
    }

    enhancedImportAnalysis(
        document: vscode.TextDocument,
        targetLineText: string,
        relatedLines: Set<number>
    ): void {
        // Extract all identifiers that might be imported
        const identifiers = this.extractAllIdentifiers(targetLineText);
        
        // Group imports by type
        const importGroups = this.categorizeImports(document);
        
        // Find related imports for each identifier
        for (const identifier of identifiers) {
            this.findImportForIdentifier(identifier, importGroups, relatedLines);
        }
        
        // Find re-exports if any
        this.findReExports(document, identifiers, relatedLines);
    }

    private extractAllIdentifiers(lineText: string): string[] {
        const identifiers: string[] = [];
        
        // Various identifier patterns
        const patterns = [
            /([A-Z][a-zA-Z0-9_]*)/g, // PascalCase (likely classes/types)
            /([a-z][a-zA-Z0-9_]*)\s*\(/g, // Function calls
            /([a-z][a-zA-Z0-9_]*)\./g, // Property access
            /([a-z][a-zA-Z0-9_]*)\[/g, // Array access
        ];
        
        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(lineText)) !== null) {
                identifiers.push(match[1]);
            }
        }
        
        return [...new Set(identifiers)];
    }

    private categorizeImports(document: vscode.TextDocument): {
        namedImports: Map<string, number>;
        defaultImports: Map<string, number>;
        namespaceImports: Map<string, number>;
        requireImports: Map<string, number>;
    } {
        const namedImports = new Map<string, number>();
        const defaultImports = new Map<string, number>();
        const namespaceImports = new Map<string, number>();
        const requireImports = new Map<string, number>();
        
        for (let i = 0; i < Math.min(100, document.lineCount); i++) {
            const lineText = document.lineAt(i).text;
            
            // ES6 named imports: import { name1, name2 } from 'module'
            const namedImportMatch = lineText.match(/import\s*\{\s*([^}]+)\s*\}\s*from/);
            if (namedImportMatch) {
                const names = namedImportMatch[1].split(',').map(n => n.trim());
                names.forEach(name => namedImports.set(name, i));
            }
            
            // ES6 default imports: import name from 'module'
            const defaultImportMatch = lineText.match(/import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from/);
            if (defaultImportMatch) {
                defaultImports.set(defaultImportMatch[1], i);
            }
            
            // ES6 namespace imports: import * as name from 'module'
            const namespaceImportMatch = lineText.match(/import\s*\*\s*as\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from/);
            if (namespaceImportMatch) {
                namespaceImports.set(namespaceImportMatch[1], i);
            }
            
            // CommonJS require: const name = require('module')
            const requireMatch = lineText.match(/const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*require\(/);
            if (requireMatch) {
                requireImports.set(requireMatch[1], i);
            }
        }
        
        return { namedImports, defaultImports, namespaceImports, requireImports };
    }

    private findImportForIdentifier(
        identifier: string,
        importGroups: ReturnType<typeof this.categorizeImports>,
        relatedLines: Set<number>
    ): void {
        // Check each import type
        if (importGroups.namedImports.has(identifier)) {
            relatedLines.add(importGroups.namedImports.get(identifier)!);
        }
        
        if (importGroups.defaultImports.has(identifier)) {
            relatedLines.add(importGroups.defaultImports.get(identifier)!);
        }
        
        if (importGroups.namespaceImports.has(identifier)) {
            relatedLines.add(importGroups.namespaceImports.get(identifier)!);
        }
        
        if (importGroups.requireImports.has(identifier)) {
            relatedLines.add(importGroups.requireImports.get(identifier)!);
        }
    }

    private findReExports(document: vscode.TextDocument, identifiers: string[], relatedLines: Set<number>): void {
        for (let i = 0; i < document.lineCount; i++) {
            const lineText = document.lineAt(i).text;
            
            // Check for re-export statements
            if (/export\s*\{/.test(lineText) || /export\s*\*/.test(lineText)) {
                for (const identifier of identifiers) {
                    if (lineText.includes(identifier)) {
                        relatedLines.add(i);
                    }
                }
            }
        }
    }
}