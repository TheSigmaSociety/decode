// Main JavaScript for the AI Code Explanation webview

(function() {
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    const welcomeSection = document.getElementById('welcome');
    const configurationSection = document.getElementById('configurationNeeded');
    const loadingSection = document.getElementById('loading');
    const explanationSection = document.getElementById('explanation');
    const errorSection = document.getElementById('error');
    const historySection = document.getElementById('history');
    
    const explainBtn = document.getElementById('explainBtn');
    const configureBtn = document.getElementById('configureBtn');
    const copyBtn = document.getElementById('copyBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const retryBtn = document.getElementById('retryBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const historyBtn = document.getElementById('historyBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    const backToExplanationBtn = document.getElementById('backToExplanationBtn');
    
    const explanationContent = document.getElementById('explanationContent');
    const errorMessage = document.getElementById('errorMessage');
    const historyContent = document.getElementById('historyContent');
    
    let currentExplanation = '';
    
    // Event listeners
    explainBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'requestExplanation' });
    });
    
    configureBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
    });
    
    copyBtn?.addEventListener('click', () => {
        if (currentExplanation) {
            vscode.postMessage({ 
                type: 'copyExplanation', 
                text: currentExplanation 
            });
        }
    });
    
    refreshBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'requestExplanation' });
    });
    
    retryBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'requestExplanation' });
    });
    
    settingsBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'openSettings' });
    });
    
    historyBtn?.addEventListener('click', () => {
        vscode.postMessage({ type: 'showHistory' });
    });
    
    clearHistoryBtn?.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all explanation history?')) {
            vscode.postMessage({ type: 'clearHistory' });
        }
    });
    
    backToExplanationBtn?.addEventListener('click', () => {
        showExplanation(currentExplanation);
    });
    
    // Message handling from extension
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.type) {
            case 'updateExplanation':
                showExplanation(message.explanation);
                break;
            case 'showError':
                showError(message.message);
                break;
            case 'showLoading':
                showLoading();
                break;
            case 'showWelcome':
                showWelcome();
                break;
            case 'showConfigurationNeeded':
                showConfigurationNeeded();
                break;
            case 'showHistory':
                showHistory(message.history);
                break;
            case 'historyCleared':
                if (!historySection?.classList.contains('hidden')) {
                    showHistory([]);
                }
                break;
        }
    });
    
    // UI state management
    function hideAllSections() {
        welcomeSection?.classList.add('hidden');
        configurationSection?.classList.add('hidden');
        loadingSection?.classList.add('hidden');
        explanationSection?.classList.add('hidden');
        errorSection?.classList.add('hidden');
        historySection?.classList.add('hidden');
    }
    
    function showWelcome() {
        hideAllSections();
        welcomeSection?.classList.remove('hidden');
    }
    
    function showConfigurationNeeded() {
        hideAllSections();
        configurationSection?.classList.remove('hidden');
    }
    
    function showLoading() {
        hideAllSections();
        loadingSection?.classList.remove('hidden');
    }
    
    function showExplanation(explanation) {
        hideAllSections();
        currentExplanation = explanation;
        
        if (explanationContent) {
            explanationContent.innerHTML = formatExplanation(explanation);
        }
        
        explanationSection?.classList.remove('hidden');
    }
    
    function showHistory(historyItems) {
        hideAllSections();
        
        if (historyContent) {
            if (historyItems.length === 0) {
                historyContent.innerHTML = '<div class="history-empty">No explanation history yet. Generate some explanations to see them here!</div>';
            } else {
                historyContent.innerHTML = historyItems.map(item => createHistoryItemHtml(item)).join('');
                
                // Add click handlers to history items
                const historyItemElements = historyContent.querySelectorAll('.history-item');
                historyItemElements.forEach((element, index) => {
                    element.addEventListener('click', () => {
                        vscode.postMessage({ 
                            type: 'loadHistoryItem', 
                            index: historyItems[index].index 
                        });
                    });
                });
            }
        }
        
        historySection?.classList.remove('hidden');
    }
    
    function createHistoryItemHtml(item) {
        const date = new Date(item.timestamp);
        const timeString = date.toLocaleString();
        
        return `
            <div class="history-item" data-index="${item.index}">
                <div class="history-item-header">
                    <span class="history-item-language">${item.language}</span>
                    <span class="history-item-timestamp">${timeString}</span>
                </div>
                <div class="history-item-code">${escapeHtml(item.codeSnippet)}</div>
            </div>
        `;
    }
    
    function showError(message) {
        hideAllSections();
        
        if (errorMessage) {
            errorMessage.textContent = message;
        }
        
        errorSection?.classList.remove('hidden');
    }
    
    function formatExplanation(explanation) {
        // Convert markdown-like formatting to HTML
        let formatted = explanation
            // Convert headers
            .replace(/^### (.*$)/gm, '<h4>$1</h4>')
            .replace(/^## (.*$)/gm, '<h3>$1</h3>')
            .replace(/^# (.*$)/gm, '<h2>$1</h2>')
            
            // Convert bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            
            // Convert inline code
            .replace(/`([^`]+)`/g, '<code>$1</code>')
            
            // Convert code blocks
            .replace(/```[\s\S]*?```/g, (match) => {
                const code = match.replace(/```(\w+)?\n?/, '').replace(/```$/, '');
                return `<pre><code>${escapeHtml(code)}</code></pre>`;
            })
            
            // Convert numbered lists
            .replace(/^\d+\.\s+(.*)$/gm, '<li>$1</li>')
            
            // Convert bullet points
            .replace(/^[-*]\s+(.*)$/gm, '<li>$1</li>')
            
            // Convert line breaks
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        // Wrap in paragraphs if not already wrapped
        if (!formatted.startsWith('<')) {
            formatted = '<p>' + formatted + '</p>';
        }
        
        // Wrap consecutive list items in ul tags
        formatted = formatted.replace(/(<li>.*?<\/li>)(\s*<li>.*?<\/li>)*/g, (match) => {
            return '<ul>' + match + '</ul>';
        });
        
        return formatted;
    }
    
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
        // Ctrl/Cmd + Enter to request explanation
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            vscode.postMessage({ type: 'requestExplanation' });
        }
        
        // Ctrl/Cmd + C to copy explanation (when explanation is visible)
        if ((event.ctrlKey || event.metaKey) && event.key === 'c' && currentExplanation && !explanationSection?.classList.contains('hidden')) {
            // Only if no text is selected
            if (window.getSelection()?.toString() === '') {
                event.preventDefault();
                vscode.postMessage({ 
                    type: 'copyExplanation', 
                    text: currentExplanation 
                });
            }
        }
    });
    
    // Accessibility improvements
    function setupAccessibility() {
        // Add ARIA labels
        explainBtn?.setAttribute('aria-label', 'Request AI explanation for selected code');
        configureBtn?.setAttribute('aria-label', 'Configure Gemini API key');
        copyBtn?.setAttribute('aria-label', 'Copy explanation to clipboard');
        refreshBtn?.setAttribute('aria-label', 'Refresh explanation');
        retryBtn?.setAttribute('aria-label', 'Retry generating explanation');
        settingsBtn?.setAttribute('aria-label', 'Open extension settings');
        historyBtn?.setAttribute('aria-label', 'Show explanation history');
        clearHistoryBtn?.setAttribute('aria-label', 'Clear explanation history');
        backToExplanationBtn?.setAttribute('aria-label', 'Back to current explanation');
        
        // Add keyboard navigation
        const buttons = document.querySelectorAll('button');
        buttons.forEach(button => {
            button.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    button.click();
                }
            });
        });
    }
    
    // Initialize
    function init() {
        setupAccessibility();
        
        // Notify extension that webview is ready
        vscode.postMessage({ type: 'ready' });
    }
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();