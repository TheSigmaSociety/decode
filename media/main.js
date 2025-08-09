// Main JavaScript for the AI Code Explanation webview

(function() {
    const vscode = acquireVsCodeApi();
    
    // DOM elements
    console.log('Looking for DOM elements...');
    const welcomeSection = document.getElementById('welcome');
    const configurationSection = document.getElementById('configurationNeeded');
    const loadingSection = document.getElementById('loading');
    const explanationSection = document.getElementById('explanation');
    const errorSection = document.getElementById('error');
    const historySection = document.getElementById('history');
    
    const explainBtn = document.getElementById('explainBtn');
    const testBtn = document.getElementById('testBtn');
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
    
    console.log('DOM elements found:', {
        welcomeSection: !!welcomeSection,
        configurationSection: !!configurationSection,
        loadingSection: !!loadingSection,
        explanationSection: !!explanationSection,
        errorSection: !!errorSection,
        historySection: !!historySection,
        explanationContent: !!explanationContent,
        errorMessage: !!errorMessage,
        historyContent: !!historyContent
    });
    
    let currentExplanation = '';
    
    // Simple markdown parser for code explanations
    function parseMarkdown(text) {
        if (!text) return '';
        
        // Convert markdown to HTML
        let html = text
            // Headers
            .replace(/^### (.*$)/gim, '<h4>$1</h4>')
            .replace(/^## (.*$)/gim, '<h3>$1</h3>')
            .replace(/^# (.*$)/gim, '<h2>$1</h2>')
            // Bold
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Code blocks with syntax highlighting
            .replace(/\`\`\`(\w+)?\n([\s\S]*?)\`\`\`/g, function(match, lang, code) {
                const language = lang || 'javascript';
                const escapedCode = code.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return '<pre class="code-block"><code class="language-' + language + '">' + escapedCode + '</code></pre>';
            })
            // Inline code
            .replace(/\`([^\`]+)\`/g, '<code class="inline-code">$1</code>')
            // Numbered lists
            .replace(/^\d+\.\s+(.*)$/gim, '<li>$1</li>')
            // Bullet points
            .replace(/^[-*]\s+(.*)$/gim, '<li>$1</li>')
            // Line breaks
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>');
        
        // Wrap consecutive list items in ul tags
        html = html.replace(/(<li>.*?<\/li>)(\s*<br>\s*<li>.*?<\/li>)*/g, function(match) {
            return '<ul>' + match.replace(/<br>\s*/g, '') + '</ul>';
        });
        
        // Wrap in paragraph tags
        html = '<p>' + html + '</p>';
        
        // Clean up empty paragraphs
        html = html.replace(/<p><\/p>/g, '');
        html = html.replace(/<p><h/g, '<h').replace(/<\/h([1-6])><\/p>/g, '</h$1>');
        
        return html;
    }
    
    // Function to highlight code after inserting
    function highlightCode() {
        if (typeof Prism !== 'undefined') {
            Prism.highlightAll();
        }
    }
    
    // Event listeners
    explainBtn?.addEventListener('click', () => {
        console.log('Explain button clicked');
        vscode.postMessage({ type: 'requestExplanation' });
    });
    
    testBtn?.addEventListener('click', () => {
        console.log('Test button clicked');
        // Test showing different states
        showLoading();
        setTimeout(() => {
            showExplanation('# Test Explanation\n\nThis is a **test explanation** to verify the webview is working correctly.\n\n```javascript\nconsole.log("Hello, world!");\n```\n\nThe webview communication and rendering is functioning properly.');
        }, 2000);
    });
    
    configureBtn?.addEventListener('click', () => {
        console.log('Configure button clicked');
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
        console.log('Webview received message:', message.type, message);
        
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
            default:
                console.warn('Unknown message type:', message.type);
        }
    });
    
    // UI state management
    function hideAllSections() {
        console.log('hideAllSections called');
        const sections = [
            { name: 'welcome', element: welcomeSection },
            { name: 'configuration', element: configurationSection },
            { name: 'loading', element: loadingSection },
            { name: 'explanation', element: explanationSection },
            { name: 'error', element: errorSection },
            { name: 'history', element: historySection }
        ];
        
        sections.forEach(section => {
            if (section.element) {
                const wasHidden = section.element.classList.contains('hidden');
                section.element.classList.add('hidden');
                console.log(`${section.name} section: was hidden=${wasHidden}, now hidden=true`);
            } else {
                console.warn(`${section.name} section element not found`);
            }
        });
    }
    
    function showWelcome() {
        console.log('Showing welcome section');
        hideAllSections();
        welcomeSection?.classList.remove('hidden');
    }
    
    function showConfigurationNeeded() {
        console.log('Showing configuration needed section');
        hideAllSections();
        configurationSection?.classList.remove('hidden');
    }
    
    function showLoading() {
        console.log('Showing loading section');
        hideAllSections();
        loadingSection?.classList.remove('hidden');
    }
    
    function showExplanation(explanation) {
        console.log('Showing explanation section with content length:', explanation.length);
        hideAllSections();
        currentExplanation = explanation;
        
        if (explanationContent) {
            explanationContent.innerHTML = formatExplanation(explanation);
            console.log('Explanation content updated');
        } else {
            console.error('explanationContent element not found');
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
        console.log('Showing error section with message:', message);
        hideAllSections();
        
        if (errorMessage) {
            errorMessage.textContent = message;
        } else {
            console.error('errorMessage element not found');
        }
        
        errorSection?.classList.remove('hidden');
    }
    
    function formatExplanation(explanation) {
        console.log('Formatting explanation with length:', explanation.length);
        
        // Use the markdown parser from the HTML
        const formatted = parseMarkdown(explanation);
        console.log('Formatted explanation length:', formatted.length);
        
        // Trigger syntax highlighting after a short delay to ensure DOM is updated
        setTimeout(() => {
            highlightCode();
        }, 10);
        
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
        console.log('Initializing webview JavaScript');
        console.log('Document ready state:', document.readyState);
        console.log('DOM content loaded, body exists:', !!document.body);
        
        // Check if all required DOM elements exist
        const requiredElements = {
            welcomeSection,
            configurationSection,
            loadingSection,
            explanationSection,
            errorSection,
            historySection,
            explanationContent,
            errorMessage
        };
        
        for (const [name, element] of Object.entries(requiredElements)) {
            if (!element) {
                console.error(`Required DOM element not found: ${name}`);
            } else {
                console.log(`Found DOM element: ${name}`);
            }
        }
        
        // Test if we can manipulate DOM
        if (welcomeSection) {
            console.log('Welcome section classes before:', welcomeSection.className);
        }
        
        setupAccessibility();
        
        // Notify extension that webview is ready
        console.log('Sending ready message to extension');
        vscode.postMessage({ type: 'ready' });
        
        // Add a simple test to see if we can show content
        setTimeout(() => {
            console.log('Running post-init test...');
            if (welcomeSection && welcomeSection.classList.contains('hidden')) {
                console.log('Welcome section is hidden, trying to show it');
                showWelcome();
            }
        }, 1000);
    }
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();