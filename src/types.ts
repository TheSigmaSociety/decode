import * as vscode from 'vscode';

// Core interfaces for the extension

export interface CodeAnalysisEngine {
  analyzeCodeSelection(
    document: vscode.TextDocument,
    selection: vscode.Selection
  ): Promise<CodeAnalysisResult>;
  
  findRelatedLines(
    document: vscode.TextDocument,
    targetLine: number
  ): number[];
}

export interface CodeAnalysisResult {
  selectedLine: string;
  relatedLines: string[];
  context: CodeContext;
}

export interface CodeContext {
  functionName?: string;
  className?: string;
  variables: string[];
  imports: string[];
  language: string;
}

export interface GeminiClient {
  explainCode(codeSnippet: string, context: CodeContext): Promise<string>;
  validateApiKey(apiKey: string): Promise<boolean>;
}

export interface GeminiConfig {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

export interface ConfigurationManager {
  getApiKey(): string | undefined;
  setApiKey(apiKey: string): Promise<void>;
  isConfigured(): boolean;
  promptForApiKey(): Promise<string | undefined>;
}

export interface DecorationManager {
  highlightLines(editor: vscode.TextEditor, lines: number[]): void;
  highlightUserSelection(editor: vscode.TextEditor, selectedLines: number[]): void;
  addRelatedLines(editor: vscode.TextEditor, relatedLines: number[]): void;
  clearHighlights(): void;
  updateHighlights(selectedLine: number, relatedLines: number[]): void;
}

export interface CodeExplanationWebviewProvider extends vscode.WebviewViewProvider {
  resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    token: vscode.CancellationToken
  ): void;
  updateContent(explanation: string): void;
  showError(message: string): void;
  showLoading(): void;
}

// Data models

export interface LineRelationship {
  lineNumber: number;
  content: string;
  relationshipType: RelationshipType;
  confidence: number;
}

export enum RelationshipType {
  VARIABLE_DECLARATION = 'variable_declaration',
  VARIABLE_USAGE = 'variable_usage',
  FUNCTION_CALL = 'function_call',
  FUNCTION_DEFINITION = 'function_definition',
  CONTROL_FLOW = 'control_flow',
  IMPORT_DEPENDENCY = 'import_dependency',
  CLASS_MEMBER = 'class_member'
}

export interface ExplanationRequest {
  selectedCode: string;
  relatedCode: string[];
  context: CodeContext;
  language: string;
}

export interface ExplanationResponse {
  explanation: string;
  confidence: number;
  suggestions?: string[];
}

// Error handling interfaces

export interface ErrorHandler {
  handleConfigurationError(error: ConfigurationError): void;
  handleApiError(error: ApiError): void;
  handleAnalysisError(error: AnalysisError): void;
}

export class ConfigurationError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class ApiError extends Error {
  constructor(message: string, public statusCode?: number, public retryable: boolean = false) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AnalysisError extends Error {
  constructor(message: string, public lineNumber?: number) {
    super(message);
    this.name = 'AnalysisError';
  }
}