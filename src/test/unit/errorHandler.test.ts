import * as assert from 'assert';

// Mock functions first
const mockShowErrorMessage = jest.fn();
const mockShowWarningMessage = jest.fn();
const mockShowInformationMessage = jest.fn();
const mockExecuteCommand = jest.fn();

jest.mock('vscode', () => ({
    window: {
        showErrorMessage: mockShowErrorMessage,
        showWarningMessage: mockShowWarningMessage,
        showInformationMessage: mockShowInformationMessage
    },
    commands: {
        executeCommand: mockExecuteCommand
    }
}));

import * as vscode from 'vscode';
import { ExtensionErrorHandler } from '../../errorHandler';
import { ConfigurationError, ApiError, AnalysisError } from '../../types';

describe('ExtensionErrorHandler Test Suite', () => {
    let errorHandler: ExtensionErrorHandler;
    let mockOutputChannel: any;

    beforeEach(() => {
        // Reset mocks
        mockShowErrorMessage.mockReset();
        mockShowWarningMessage.mockReset();
        mockShowInformationMessage.mockReset();
        mockExecuteCommand.mockReset();

        // Mock output channel
        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        };

        errorHandler = new ExtensionErrorHandler(mockOutputChannel);
    });

    afterEach(() => {
        errorHandler.dispose();
    });

    test('should handle configuration errors correctly', async () => {
        const error = new ConfigurationError('API key not found', 'MISSING_API_KEY');
        
        mockShowErrorMessage.mockResolvedValue('Set API Key');
        
        errorHandler.handleConfigurationError(error);
        
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringContaining('Configuration Error: API key not found')
        );
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockShowErrorMessage).toHaveBeenCalledWith(
            expect.stringContaining('Gemini API key is not configured'),
            'Set API Key'
        );
    });

    test('should handle API errors correctly', async () => {
        const error = new ApiError('Rate limit exceeded', 429, true);
        
        errorHandler.handleApiError(error);
        
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringContaining('API Error: Rate limit exceeded')
        );
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Rate limit exceeded. Please wait a moment before trying again.'
        );
    });

    test('should handle analysis errors correctly', () => {
        const error = new AnalysisError('Parse error', 42);
        
        errorHandler.handleAnalysisError(error);
        
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringContaining('Analysis Error: Parse error')
        );
        
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Code analysis failed: Parse error (Line 42)'
        );
    });

    test('should retry with exponential backoff', async () => {
        let attemptCount = 0;
        const operation = jest.fn().mockImplementation(() => {
            attemptCount++;
            if (attemptCount < 3) {
                throw new ApiError('Temporary error', 500, true);
            }
            return Promise.resolve('success');
        });

        const result = await errorHandler.retryWithBackoff(operation, 3);
        
        assert.strictEqual(result, 'success');
        assert.strictEqual(attemptCount, 3);
        expect(operation).toHaveBeenCalledTimes(3);
    });

    test('should not retry non-retryable errors', async () => {
        const operation = jest.fn().mockRejectedValue(
            new ApiError('Invalid API key', 401, false)
        );

        await assert.rejects(
            () => errorHandler.retryWithBackoff(operation, 3),
            (error: ApiError) => error.message === 'Invalid API key'
        );

        expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should not retry configuration errors', async () => {
        const operation = jest.fn().mockRejectedValue(
            new ConfigurationError('Missing config', 'MISSING_CONFIG')
        );

        await assert.rejects(
            () => errorHandler.retryWithBackoff(operation, 3),
            (error: ConfigurationError) => error.code === 'MISSING_CONFIG'
        );

        expect(operation).toHaveBeenCalledTimes(1);
    });

    test('should handle 401 API errors with API key prompt', async () => {
        const error = new ApiError('Invalid API key', 401, false);
        
        mockShowErrorMessage.mockResolvedValue('Update API Key');
        
        errorHandler.handleApiError(error);
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockShowErrorMessage).toHaveBeenCalledWith(
            'Invalid API key. Please check your Gemini API key.',
            'Update API Key'
        );
    });

    test('should handle 403 API errors with API key prompt', async () => {
        const error = new ApiError('Forbidden', 403, false);
        
        mockShowErrorMessage.mockResolvedValue('Update API Key');
        
        errorHandler.handleApiError(error);
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockShowErrorMessage).toHaveBeenCalledWith(
            'Invalid API key. Please check your Gemini API key.',
            'Update API Key'
        );
    });

    test('should handle retryable API errors', async () => {
        const error = new ApiError('Server error', 500, true);
        
        errorHandler.handleApiError(error);
        
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Temporary API issue. The request will be retried automatically.'
        );
    });

    test('should handle non-retryable API errors', async () => {
        const error = new ApiError('Bad request', 400, false);
        
        mockShowErrorMessage.mockResolvedValue('Retry');
        
        errorHandler.handleApiError(error);
        
        // Wait for async operations
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(mockShowErrorMessage).toHaveBeenCalledWith(
            'API Error: Bad request',
            'Retry'
        );
    });

    test('should log error details correctly', () => {
        const error = new ApiError('Test error', 500, true);
        
        errorHandler.handleApiError(error);
        
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            expect.stringContaining('API Error: Test error')
        );
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            'Status code: 500'
        );
        expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
            'Retryable: true'
        );
    });

    test('should handle analysis errors without line number', () => {
        const error = new AnalysisError('General analysis error');
        
        errorHandler.handleAnalysisError(error);
        
        expect(mockShowWarningMessage).toHaveBeenCalledWith(
            'Code analysis failed: General analysis error'
        );
    });

    test('should show generic error messages', async () => {
        const message = 'Generic error message';
        const actions = ['Action 1', 'Action 2'];
        
        mockShowErrorMessage.mockResolvedValue('Action 1');
        
        const result = await errorHandler.showGenericError(message, actions);
        
        expect(mockShowErrorMessage).toHaveBeenCalledWith(message, ...actions);
        assert.strictEqual(result, 'Action 1');
    });

    test('should show generic warning messages', async () => {
        const message = 'Warning message';
        
        await errorHandler.showGenericWarning(message);
        
        expect(mockShowWarningMessage).toHaveBeenCalledWith(message);
    });

    test('should show generic info messages', async () => {
        const message = 'Info message';
        
        await errorHandler.showGenericInfo(message);
        
        expect(mockShowInformationMessage).toHaveBeenCalledWith(message);
    });

    test('should handle sleep function correctly', async () => {
        const startTime = Date.now();
        
        await errorHandler['sleep'](100);
        
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        // Should sleep for approximately 100ms (with some tolerance)
        assert.ok(duration >= 90 && duration <= 150, `Sleep duration was ${duration}ms`);
    });

    test('should calculate exponential backoff correctly', async () => {
        let delays: number[] = [];
        const originalSleep = errorHandler['sleep'];
        
        // Mock sleep to capture delays
        errorHandler['sleep'] = jest.fn().mockImplementation((ms: number) => {
            delays.push(ms);
            return Promise.resolve();
        });

        const operation = jest.fn()
            .mockRejectedValueOnce(new ApiError('Error 1', 500, true))
            .mockRejectedValueOnce(new ApiError('Error 2', 500, true))
            .mockResolvedValueOnce('success');

        await errorHandler.retryWithBackoff(operation, 3);
        
        // Should have exponential backoff: 1000ms, 2000ms
        assert.strictEqual(delays.length, 2);
        assert.strictEqual(delays[0], 1000);
        assert.strictEqual(delays[1], 2000);
        
        // Restore original sleep
        errorHandler['sleep'] = originalSleep;
    });

    test('should dispose correctly', () => {
        errorHandler.dispose();
        
        expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });
});