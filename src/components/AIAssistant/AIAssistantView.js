const path = require('path');
const { AvailableModels } = require('../../utils/enums.js');
const AgentRegistry = require('./core/AgentRegistry');
const ToolRegistry = require('./tools/ToolRegistry');
const InputBar = require('./ui/InputBar');
const ChatView = require('./ui/ChatView');
const fs = require('fs');

function getDocsUrl(filePath) {
    if (!filePath) return 'https://devdocs.io';
    const ext = path.extname(filePath).toLowerCase();
    const map = {
        '.js': 'javascript', '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
        '.html': 'html', '.css': 'css', '.scss': 'sass', '.py': 'python',
        '.java': 'java', '.rb': 'ruby', '.php': 'php', '.go': 'go',
        '.rs': 'rust', '.c': 'c', '.cpp': 'cpp', '.json': 'json', '.md': 'markdown',
        '.sh': 'bash', '.yaml': 'yaml', '.yml': 'yaml'
    };
    return map[ext] ? `https://devdocs.io/${map[ext]}/` : 'https://devdocs.io';
}

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getAIAssistHTML(currentFileContent, currentFilePath, currentFileContentError) {
    const isError = !!currentFileContentError;
    const isFileContextUsable = true;

    // Get Project Title
    const freshContext = window.getProjectFileContext ? window.getProjectFileContext() : {};
    const projectTitle = freshContext.projectTitle || 'Project';
    const fileName = currentFilePath ? path.basename(currentFilePath) : projectTitle;
    const docsUrl = getDocsUrl(currentFilePath);

    // Initial Welcome Screen
    let initialHTML = '';
    if (isError) {
        initialHTML = `
            <div class="welcome-container error">
                <i data-lucide="alert-triangle" class="welcome-icon error"></i>
                <h3>Error Reading File</h3>
                <p>${currentFileContentError}</p>
            </div>
        `;
    } else {
        const title = projectTitle;
        const subtitle = 'Ask me anything about your project, or select files for specific context.';

        initialHTML = `
            <div class="welcome-container">
                <div class="welcome-header">
                    <h2>${escapeHTML(title)}</h2>
                    <p>${escapeHTML(subtitle)}</p>
                </div>
                
                <div class="suggestion-chips">
                    <button class="suggestion-chip" onclick="document.getElementById('ai-assist-input-textarea').value='Explain this file'; document.getElementById('ai-assist-input-textarea').focus();">
                        <i data-lucide="book-open"></i> Explain
                    </button>
                    <button class="suggestion-chip" onclick="document.getElementById('ai-assist-input-textarea').value='Refactor this code'; document.getElementById('ai-assist-input-textarea').focus();">
                        <i data-lucide="hammer"></i> Refactor
                    </button>
                    <button class="suggestion-chip" onclick="document.getElementById('ai-assist-input-textarea').value='Find bugs in this file'; document.getElementById('ai-assist-input-textarea').focus();">
                        <i data-lucide="bug"></i> Debug
                    </button>
                </div>
            </div>
        `;
    }

    // REFINED COMPACT CSS (VS Code Sidebar Look)
    const compactStyle = `
        <style>
            /* Main Container */
            #ai-assist-content { background-color: var(--window-background-color); }

            /* Chat Messages */
            .term-chat-msg { font-size: 12px; margin-bottom: 12px; padding: 0; line-height: 1.6; box-sizing: border-box; }
            .term-chat-msg.user { 
                padding: 10px 12px 10px 12px; 
                background: var(--peak-accent); 
                color: white; 
                border-radius: 12px; 
                border-bottom-right-radius: 12px;
                margin-left: 0; 
                max-width: 100%; 
                width: 100%;
                font-weight: 500;
                font-size: 12px; 
                margin-bottom: 10px;
                text-align: left;
                position: relative;
            }
            .term-chat-msg.ai { 
                padding: 4px 0; 
                background: transparent; 
                color: var(--peak-primary); 
                max-width: 100%; 
                width: 100%;
                text-align: left;
            }
            
            /* Apply padding to text elements inside AI message */
            .term-chat-msg.ai > p,
            .term-chat-msg.ai > ul,
            .term-chat-msg.ai > ol,
            .term-chat-msg.ai > h1,
            .term-chat-msg.ai > h2,
            .term-chat-msg.ai > h3,
            .term-chat-msg.ai > h4,
            .term-chat-msg.ai > h5,
            .term-chat-msg.ai > h6,
            .term-chat-msg.ai > blockquote,
            .term-chat-msg.ai > table,
            .term-chat-msg.ai > img {
                padding-left: 12px;
                padding-right: 12px;
            }
            
            /* Tool & Block Styles - Full Bleed */
            .tool-block, .file-edit-card, .section-card, .terminal-output-block, .thinking-block, .chat-code-block {
                margin: 12px 0; /* Removed negative margins */
                width: 100%; /* Full width of content area */
                border: 1px solid var(--border-color)!important;
                /* border-left: none !important; */
                /* border-right: none !important; */
                border-radius: 12px !important;
                overflow: hidden;
                background: var(--window-background-color);
            }
            
            /* Markdown Content Refinements */
            .markdown-content p { margin-bottom: 8px; }
            .markdown-content ul, .markdown-content ol { margin-bottom: 8px; padding-left: 20px; }
            .markdown-content li { margin-bottom: 4px; }
            .markdown-content code { 
                font-family: 'GeistMono', monospace; 
                font-size: 11px; 
                background: var(--control-background-color); 
                padding: 2px 4px; 
                border-radius: 4px; 
                border: 1px solid var(--border-color);
            }
            .markdown-content pre {
                margin: 8px 0;
                padding: 10px;
                background: var(--text-background-color);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                overflow-x: auto;
            }
            .markdown-content pre code {
                background: none;
                padding: 0;
                border: none;
                font-size: 11px;
                color: var(--peak-primary);
            }
            
            /* Input Area */
            .inspector-input-container { 
                padding: 4px; 
                border-top: 1px solid var(--border-color); 
                background: var(--window-background-color); 
                position: relative;
            }
            .inspector-input-box { 
                border: 1px solid var(--border-color); 
                border-radius: 6px; 
                background: transparent; 
                padding: 2px 6px; 
                display: flex; 
                flex-direction: column; 
                transition: all 0.2s ease; 
                max-width: 100%;
                margin: 0 auto;
            }
            .inspector-input-box:focus-within { 
                border-color: var(--peak-accent); 
            }
            
            .chat-textarea { 
                font-size: 12px; 
                padding: 0; 
                min-height: 16px; 
                max-height: 200px; 
                background: transparent; 
                border: none; 
                outline: none; 
                resize: none; 
                color: var(--peak-primary); 
                width: 100%; 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                line-height: 1.3;
                overflow-y: auto;
            }
            .chat-textarea::placeholder {
                color: var(--peak-secondary);
                opacity: 0.6;
            }

            .model-select { 
                font-size: 9px; 
                height: auto; 
                padding: 0;
                padding-right: 12px;
                background: transparent; 
                border: none; 
                color: var(--peak-secondary); 
                outline: none; 
                cursor: pointer; 
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.2px;
            }
            .model-select:hover { color: var(--peak-primary); }

            /* File Picker & Chips */
            .file-chips-container {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                padding: 4px 12px;
                margin-bottom: 4px;
            }
            .file-chip {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 2px 8px;
                background: var(--control-background-color);
                border: 1px solid var(--border-color);
                border-radius: 4px;
                font-size: 10px;
                color: var(--peak-primary);
                max-width: 150px;
            }
            .file-chip span {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .file-chip.remove-btn {
                cursor: pointer;
                display: flex;
                align-items: center;
                color: var(--peak-secondary);
            }
            .file-chip.remove-btn:hover { color: var(--error-color); }

            .chat-controls { display: flex; justify-content: space-between; align-items: center; padding: 4px 2px; margin-top: 6px; }
            .left-controls { display: flex; align-items: center; gap: 8px; flex: 1; }
            
            .add-file-btn {
                width: 24px;
                height: 24px;
                border-radius: 4px;
                background: transparent;
                color: var(--peak-secondary);
                border: 1px solid transparent;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            .add-file-btn:hover {
                background: var(--control-background-color);
                color: var(--peak-primary);
                border-color: var(--border-color);
            }

            .chat-submit-btn {
                width: 28px;
                height: 28px;
                border-radius: 6px;
                background: transparent;
                color: var(--peak-secondary);
                border: none;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.2s;
            }
            .chat-submit-btn:hover {
                background: var(--control-background-color);
            }

            /* Tools Menu */
            .tools-menu {
                position: absolute;
                bottom: 100%; /* Dropup */
                left: 6px;
                margin-bottom: 4px; /* Space above toolbar */
                background: var(--window-background-color);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                z-index: 9999; /* Ensure it's above everything */
                min-width: 160px;
                padding: 4px;
                display: none; /* Hidden by default */
                flex-direction: column;
                gap: 2px;
            }
            .tools-menu.visible {
                display: flex !important; /* Force display when visible */
            }
            
            .menu-section-header {
                font-size: 9px;
                font-weight: 600;
                color: var(--peak-secondary);
                padding: 4px 8px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
                margin-top: 4px;
            }
            .menu-section-header:first-child { margin-top: 0; }
            
            .menu-item {
                font-size: 11px;
                color: var(--peak-primary);
                padding: 4px 8px;
                cursor: pointer;
                border-radius: 4px;
                display: flex;
                align-items: center;
                gap: 6px;
                transition: background 0.1s;
            }
            .menu-item:hover {
                background: var(--control-background-color);
                color: var(--peak-accent);
            }
            .menu-item i { width: 12px; height: 12px; opacity: 0.7; }
            .chat-submit-btn:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2); }
            .chat-submit-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
            .chat-submit-btn.stop { background: var(--error-color); }

            /* Response Card (Markdown Text) */
            .response-card {
                margin: 12px 0;
                padding: 12px;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                background: var(--window-background-color);
                font-size: 12px;
                line-height: 1.6;
                color: var(--peak-primary);
            }
            .response-card p { margin-bottom: 8px; }
            .response-card p:last-child { margin-bottom: 0; }
            .response-card ul, .response-card ol { margin-bottom: 8px; padding-left: 20px; }
            .response-card li { margin-bottom: 4px; }
            .response-card strong { font-weight: 600; color: var(--peak-primary); }
            .response-card code {
                font-family: 'GeistMono', monospace;
                font-size: 11px;
                background: var(--control-background-color);
                padding: 2px 4px;
                border-radius: 4px;
                border: 1px solid var(--border-color);
            }

            /* Chat Code Block (from markdown.js) */
            .chat-code-block {
                margin: 12px 0;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                overflow: hidden;
                background: var(--window-background-color);
            }
            .chat-code-block.code-header {
                padding: 6px 12px;
                background: var(--control-background-color);
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .chat-code-block.lang-badge {
                font-size: 10px;
                font-weight: 600;
                color: var(--peak-secondary);
                text-transform: uppercase;
            }

            /* Revert Button */
            .revert-btn {
                background: rgba(255, 255, 255, 0.2);
                border: none;
                color: white;
                cursor: pointer;
                padding: 4px;
                border-radius: 50%;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-left: auto; /* Push to right */
                opacity: 0.8;
                transition: all 0.2s;
            }
            .revert-btn:hover {
                opacity: 1;
                background: rgba(255, 255, 255, 0.3);
                transform: scale(1.1);
            }
            .revert-btn i { width: 12px; height: 12px; }

            .chat-code-block pre {
                margin: 0!important;
                border: none!important;
                border-radius: 0!important;
                background: var(--text-background-color)!important;
                padding: 12px!important;
            }

            /* Pulse Animation for Status */
            @keyframes pulse {
                0% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.5; transform: scale(1.2); }
                100% { opacity: 1; transform: scale(1); }
            }
            
            /* Input Toolbar Hover Effects */
            .input-toolbar .icon-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--peak-primary);
            }
            .chat-code-block.copy-btn {
                background: transparent;
                border: none;
                color: var(--peak-secondary);
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .chat-code-block.copy-btn:hover {
                background: rgba(255, 255, 255, 0.1);
                color: var(--peak-primary);
            }
            .chat-code-block.copy-btn i { width: 14px; height: 14px; }

            /* Tool & Block Styles */
            .tool-block, .file-edit-card, .section-card, .terminal-output-block, .thinking-block {
                margin: 12px 0;
                border: 1px solid var(--border-color)!important;
                border-radius: 6px;
                overflow: hidden;
                background: var(--window-background-color);
            }

            /* Thinking Block Specifics */
            .thinking-block {
                background: var(--control-background-color);
            }
            .thinking-block[open] {
                background: var(--window-background-color);
            }

            .thinking-summary {
                list-style: none;
                cursor: pointer;
                padding: 10px 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 500;
                color: var(--peak-secondary);
            }
            .inspector-header-controls { display: flex; gap: 5px; margin-left: auto; align-items: center; padding-right: 8px; }
            .inspector-header-controls .icon-btn { background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; border-radius: 4px; display: flex; align-items: center; justify-content: center; }
            .inspector-header-controls .icon-btn:hover { background: var(--hover-color); color: var(--text-primary); }
            .inspector-header-controls .icon-btn i { width: 14px; height: 14px; }

            .settings-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--window-background-color);
                z-index: 100;
                display: flex;
                flex-direction: column;
                padding: 16px;
                border-bottom: 1px solid var(--border-color);
            }
            .settings-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
            .settings-header h3 { margin: 0; font-size: 14px; font-weight: 600; }
            .settings-body { flex: 1; overflow-y: auto; }
            .settings-category { margin-bottom: 16px; }
            .settings-category-title { font-size: 11px; font-weight: 600; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px; }
            .settings-item { display: flex; align-items: center; gap: 8px; padding: 6px 0; font-size: 13px; }
            .settings-item input[type="checkbox"] { accent-color: var(--peak-accent); }
            .thinking-block[open] .thinking-summary {
                border-bottom-color: var(--border-color);
            }
            .thinking-summary:hover { color: var(--peak-primary); background: var(--hover-background); }
            .thinking-summary::-webkit-details-marker { display: none; }

            .thinking-content {
                padding: 12px;
                font-size: 11px;
                line-height: 1.6;
                color: var(--peak-secondary);
                max-height: 300px;
                overflow-y: auto;
                white-space: pre-wrap;
                font-family: 'GeistMono', 'Menlo', monospace;
                background: var(--window-background-color);
                text-align: left;
                margin-left: 0;
            }

            /* Minimalistic Thinking Bubble */
            .thinking-block-minimal {
                margin: 8px 0;
                border: none;
                background: transparent;
            }
            .thinking-summary-minimal {
                list-style: none;
                cursor: pointer;
                padding: 6px 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: var(--peak-secondary);
                border-radius: 4px;
                transition: background 0.15s;
            }
            .thinking-summary-minimal:hover {
                background: var(--control-background-color);
                color: var(--peak-primary);
            }
            .thinking-summary-minimal::-webkit-details-marker { 
                display: none; 
            }
            .thinking-chevron {
                transition: transform 0.2s;
                flex-shrink: 0;
            }
            .thinking-block-minimal[open] .thinking-chevron {
                transform: rotate(90deg);
            }
            .thinking-summary-text {
                flex: 1;
                opacity: 0.8;
                font-weight: 400;
            }
            .thinking-content-minimal {
                padding: 8px 12px 8px 26px;
                font-size: 10px;
                line-height: 1.5;
                color: var(--peak-secondary);
                white-space: pre-wrap;
                font-family: 'GeistMono', 'Menlo', monospace;
                opacity: 0.7;
                max-height: 300px;
                overflow-y: auto;
            }

            /* Minimalistic Analysis Block (same style as thinking) */
            .analysis-block-minimal {
                margin: 8px 0;
                border: none;
                background: transparent;
            }
            .analysis-summary-minimal {
                list-style: none;
                cursor: pointer;
                padding: 6px 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: var(--peak-secondary);
                border-radius: 4px;
                transition: background 0.15s;
            }
            .analysis-summary-minimal:hover {
                background: var(--control-background-color);
                color: var(--peak-primary);
            }
            .analysis-summary-minimal::-webkit-details-marker { 
                display: none; 
            }
            .analysis-chevron {
                transition: transform 0.2s;
                flex-shrink: 0;
            }
            .analysis-block-minimal[open] .analysis-chevron {
                transform: rotate(90deg);
            }
            .analysis-summary-text {
                flex: 1;
                opacity: 0.8;
                font-weight: 400;
            }
            .analysis-content-minimal {
                padding: 8px 12px 8px 26px;
                font-size: 10px;
                line-height: 1.5;
                color: var(--peak-secondary);
                white-space: pre-wrap;
                font-family: 'GeistMono', 'Menlo', monospace;
                opacity: 0.7;
                max-height: 300px;
                overflow-y: auto;
            }
            .analysis-content-minimal pre {
                margin: 0;
                padding: 0;
                background: none;
                border: none;
                font-size: inherit;
                line-height: inherit;
            }

            /* Minimalistic Message Card (for assistant responses) */
            .message-card-minimal {
                margin: 0;
                border: none;
                background: transparent;
            }
            .message-summary-minimal {
                list-style: none;
                cursor: pointer;
                padding: 6px 8px;
                display: flex;
                align-items: center;
                gap: 6px;
                font-size: 11px;
                color: var(--peak-secondary);
                border-radius: 4px;
                transition: background 0.15s;
            }
            .message-summary-minimal:hover {
                background: var(--control-background-color);
                color: var(--peak-primary);
            }
            .message-summary-minimal::-webkit-details-marker { 
                display: none; 
            }
            .message-chevron {
                transition: transform 0.2s;
                flex-shrink: 0;
            }
            .message-card-minimal[open] .message-chevron {
                transform: rotate(90deg);
            }
            .message-summary-text {
                flex: 1;
                opacity: 0.8;
                font-weight: 400;
            }
            .message-content-minimal {
                padding: 8px 12px 8px 26px;
            }
            .message-content-minimal p,
            .message-content-minimal ul,
            .message-content-minimal ol,
            .message-content-minimal h1,
            .message-content-minimal h2,
            .message-content-minimal h3,
            .message-content-minimal h4,
            .message-content-minimal h5,
            .message-content-minimal h6,
            .message-content-minimal blockquote,
            .message-content-minimal table,
            .message-content-minimal img {
                padding-left: 0;
                padding-right: 0;
            }

            /* Summaries Card */
            .summaries-card {
                background: var(--control-background-color);
                border: 1px solid var(--peak-border);
                border-radius: 6px;
                padding: 10px 12px;
                margin-bottom: 12px;
            }
            .summaries-header {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 8px;
                font-size: 11px;
                font-weight: 600;
                color: var(--peak-accent);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            .key-points-list {
                list-style: none;
                padding: 0;
                margin: 0;
                font-size: 12px;
                line-height: 1.6;
            }
            .key-points-list li {
                padding: 4px 0;
                padding-left: 16px;
                position: relative;
                color: var(--peak-primary);
            }
            .key-points-list li:before {
                content: '•';
                position: absolute;
                left: 4px;
                color: var(--peak-accent);
                font-weight: bold;
            }
            .key-points-list li.no-points {
                color: var(--peak-secondary);
                font-style: italic;
                opacity: 0.7;
            }
            .summaries-meta {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                margin-top: 8px;
                padding-top: 8px;
                border-top: 1px solid var(--peak-border);
            }
            .action-badge, .stat-badge {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 3px 8px;
                background: var(--peak-background);
                border: 1px solid var(--peak-border);
                border-radius: 12px;
                font-size: 10px;
                color: var(--peak-secondary);
                font-weight: 500;
            }
            .message-divider {
                height: 1px;
                background: var(--peak-border);
                margin: 12px 0;
                opacity: 0.5;
            }


            /* Headers */
            .tool-block .header, .file-edit-header, .section-card summary {
                padding: 8px 12px;
                font-size: 11px;
                font-weight: 600;
                background: var(--control-background-color);
                color: var(--peak-primary);
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid var(--border-color);
                user-select: none;
            }
            
            .file-edit-header { justify-content: space-between; }
            .file-title { font-family: 'GeistMono', monospace; font-size: 11px; }
            .icon-wrapper {
                display: flex; align-items: center; justify-content: center;
                width: 20px; height: 20px; border-radius: 4px;
                background: rgba(var(--peak-accent-rgb), 0.1);
                color: var(--peak-accent);
            }
            .icon-wrapper.create { color: var(--peak-accent); }

            /* Content Areas */
            .tool-block .content, .file-edit-content pre, .section-card .section-content {
                padding: 8px; /* Reduced from 12px to match user bubble tightness */
                font-size: 11px;
                font-family: 'GeistMono', 'Menlo', 'Monaco', monospace;
                background: var(--text-background-color);
                color: var(--peak-primary);
                border-bottom: 1px solid var(--border-color);
                white-space: pre-wrap;
                word-break: break-all;
                width: 100%;
                box-sizing: border-box;
                overflow-x: auto;
            }

            /* Footers */
            .tool-block .footer, .file-edit-footer {
                padding: 6px 12px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                background: var(--window-background-color);
            }
            .meta-info { font-size: 10px; color: var(--peak-secondary); }

            /* Buttons */
            .msg-action-btn {
                font-size: 10px;
                padding: 4px 10px;
                border-radius: 4px;
                border: 1px solid var(--border-color);
                background: var(--control-background-color);
                color: var(--peak-primary);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 4px;
                font-weight: 500;
                transition: all 0.2s;
            }
            .msg-action-btn:hover {
                background: var(--peak-accent);
                border-color: var(--peak-accent);
                color: white;
                transform: translateY(-1px);
                box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
            }

            /* Delete Block Specifics */
            .delete-block .header { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
            .delete-block .footer .msg-action-btn:hover { background: #ef4444; border-color: #ef4444; }

            /* Analysis Block Specifics */
            .analysis-block .header { color: #8b5cf6; background: rgba(139, 92, 246, 0.1); }
            .analysis-block .content { max-height: 200px; overflow-y: auto; font-size: 10px; color: var(--peak-secondary); }

            /* Error Block Specifics */
            .error-block .header { color: #ef4444; background: rgba(239, 68, 68, 0.1); }
            .error-block .content { max-height: 200px; overflow-y: auto; font-size: 10px; color: var(--peak-secondary); }
            .error-block { border-color: rgba(239, 68, 68, 0.3); }

            /* Active File Block Specifics */
            .active-file-block .header { color: #3b82f6; background: rgba(59, 130, 246, 0.1); }
            .active-file-block .content { max-height: 200px; overflow-y: auto; font-size: 10px; color: var(--peak-secondary); }
            .active-file-block { border-color: rgba(59, 130, 246, 0.3); }

            /* Command Executed Block Specifics */
            .command-executed-block .header { color: #10b981; background: rgba(16, 185, 129, 0.1); }
            .command-executed-block .content { max-height: 200px; overflow-y: auto; font-size: 10px; color: var(--peak-secondary); font-family: monospace; }
            .command-executed-block { border-color: rgba(16, 185, 129, 0.3); }

            .delete-block { border-color: var(--error-color)!important; }
            .delete-header { background: rgba(255, 0, 0, 0.05)!important; color: var(--error-color)!important; border-bottom-color: rgba(255, 0, 0, 0.1)!important; }
            .tool-delete-btn { color: var(--error-color); border-color: rgba(255, 0, 0, 0.2); }
            .tool-delete-btn:hover { background: var(--error-color); border-color: var(--error-color); color: white; }

            /* Tabs */
            .inspector-tabs-header {
                display: flex;
                align-items: center;
                height: 40px;
                padding: 0 16px;
                border-bottom: 1px solid var(--border-color);
                background: var(--window-background-color);
                gap: 20px;
            }
            .tab-btn {
                background: none;
                border: none;
                font-size: 12px;
                font-weight: 500;
                color: var(--peak-secondary);
                cursor: pointer;
                padding: 10px 0;
                border-bottom: 2px solid transparent;
                transition: all 0.2s;
            }
            .tab-btn:hover { color: var(--peak-primary); }
            .tab-btn.active {
                color: var(--peak-primary);
                font-weight: 600;
                border-bottom-color: var(--peak-accent);
            }

            /* Welcome Screen */
            .welcome-container {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 0 20px; /* Remove vertical padding to let flex handle centering */
                text-align: center;
                height: 100%;
                color: var(--peak-secondary);
                box-sizing: border-box;
                overflow: hidden; /* Prevent scrolling */
            }
            
            .welcome-header h2 {
                font-size: 16px;
                font-weight: 600;
                color: var(--peak-primary);
                margin: 0 0 8px 0;
            }
            .welcome-header p {
                font-size: 13px;
                line-height: 1.4;
                max-width: 280px;
                margin: 0 auto 24px auto;
                opacity: 0.8;
            }
            
            .suggestion-chips {
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                justify-content: center;
                max-width: 280px;
            }
            .suggestion-chip {
                display: flex;
                align-items: center;
                gap: 4px;
                padding: 6px 10px;
                background: var(--control-background-color);
                border: 1px solid var(--border-color);
                border-radius: 16px;
                font-size: 11px;
                color: var(--peak-primary);
                cursor: pointer;
                transition: all 0.2s;
            }
            .suggestion-chip:hover {
                border-color: var(--peak-accent);
                background: rgba(var(--peak-accent-rgb), 0.05);
                transform: translateY(-1px);
            }
            .suggestion-chip i { width: 12px; height: 12px; color: var(--peak-secondary); }
            .suggestion-chip:hover i { color: var(--peak-accent); }
            
            .welcome-container.error .welcome-icon { color: var(--error-color); margin-bottom: 12px; width: 24px; height: 24px; }
            .welcome-container.error h3 { color: var(--error-color); margin: 0 0 6px 0; font-size: 14px; }
        </style>
    `;

    return `
        ${compactStyle}
        <div class="inspector-tabs-header">
            <button class="tab-btn active" data-target="ai">Chat</button>
            <button class="tab-btn" data-target="tasks">Tasks</button>
            <button class="tab-btn" data-target="logs">Logs</button>
            <button class="tab-btn" data-target="docs">Docs</button>
            <button class="tab-btn" data-target="live">Live</button>
        </div>

        <div id="ai-assist-content" class="inspector-content-inner" style="height: 100%; display: flex; flex-direction: column; position: relative;">
            <div id="panel-ai" class="term-panel active" style="display:flex; flex-direction:column; height:100%; overflow: hidden;">
                <div class="term-chat-history" id="ai-assist-scroller" style="flex: 1; overflow-y: auto; padding: 16px 12px;">
                    <div class="term-chat-msg ai markdown-content" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                        ${initialHTML}
                    </div>
                    <div id="ai-assist-chat-thread"></div>
                    <div id="streaming-message-container-assist"></div>
                </div>
                ${new InputBar().render(isFileContextUsable, localStorage.getItem('peak-ai-agent'))}
            </div>

            <div id="panel-tasks" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <div style="padding: 12px; border-bottom: 1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; background: var(--control-background-color);">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <i data-lucide="list-todo" style="width:14px; height:14px; color:var(--peak-accent);"></i>
                        <span style="font-size:11px; font-weight:600; text-transform:uppercase; color:var(--peak-secondary);">Project Plan</span>
                    </div>
                    <button id="btn-refresh-tasks" class="icon-btn" style="padding:4px;" title="Refresh"><i data-lucide="rotate-cw" style="width:14px; height:14px;"></i></button>
                </div>
                <div id="tasks-content" class="markdown-content" style="flex:1; overflow-y:auto; padding:16px; font-size:13px; line-height: 1.6;">
                    <div style="color:var(--peak-secondary); text-align:center; margin-top:40px;">Loading plan...</div>
                </div>
            </div>

            <div id="panel-logs" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <div style="padding: 8px 12px; background: var(--control-background-color); border-bottom: 1px solid var(--border-color); display: flex; gap: 8px; align-items: center;">
                    <div style="flex: 1; display: flex; gap: 4px;">
                        <button class="log-filter-btn active" data-filter="all" style="padding: 4px 8px; font-size: 10px; border: 1px solid var(--border-color); background: var(--peak-accent); color: white; border-radius: 4px; cursor: pointer;">All</button>
                        <button class="log-filter-btn" data-filter="agent" style="padding: 4px 8px; font-size: 10px; border: 1px solid var(--border-color); background: var(--control-background-color); color: var(--peak-secondary); border-radius: 4px; cursor: pointer;">Agent</button>
                        <button class="log-filter-btn" data-filter="tools" style="padding: 4px 8px; font-size: 10px; border: 1px solid var(--border-color); background: var(--control-background-color); color: var(--peak-secondary); border-radius: 4px; cursor: pointer;">Tools</button>
                        <button class="log-filter-btn" data-filter="errors" style="padding: 4px 8px; font-size: 10px; border: 1px solid var(--border-color); background: var(--control-background-color); color: var(--peak-secondary); border-radius: 4px; cursor: pointer;">Errors</button>
                    </div>
                    <button id="btn-clear-logs" class="icon-btn" style="padding: 4px;" title="Clear Logs"><i data-lucide="trash-2" style="width: 14px; height: 14px;"></i></button>
                </div>
                <div id="logs-stream" style="flex: 1; overflow-y: auto; padding: 8px; font-family: 'GeistMono', monospace; font-size: 10px; line-height: 1.4; background: var(--text-background-color);">
                    <div style="color: var(--peak-secondary); text-align: center; padding: 20px;">No logs yet. Logs will appear here as the agent executes.</div>
                </div>
            </div>

            <div id="panel-docs" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <webview id="inspector-docs-view" src="${docsUrl}" style="flex: 1; width: 100%; height: 100%; border: none;" webpreferences="contextIsolation=true"></webview>
            </div>

            <div id="panel-live" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <div style="padding: 8px 12px; background: var(--control-background-color); border-bottom: 1px solid var(--border-color); display: flex; gap: 8px;">
                    <input type="text" id="live-url-input" value="http://localhost:3000" style="flex: 1; background: var(--text-background-color); border: 1px solid var(--border-color); border-radius: 4px; padding: 4px 8px; font-size: 12px; color: var(--peak-primary); outline: none;">
                    <button id="btn-live-refresh" class="icon-btn" style="padding: 4px;"><i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i></button>
                    <button id="btn-live-popout" class="icon-btn" style="padding: 4px;" title="Open in Tab"><i data-lucide="external-link" style="width: 14px; height: 14px;"></i></button>
                </div>
                <webview id="inspector-live-view" src="http://localhost:3000" style="flex: 1; width: 100%; height: 100%; border: none; background: white;" webpreferences="contextIsolation=true, nodeIntegration=false"></webview>
            </div>
        </div>
`;
}

function getSettingsHTML() {
    return `
        <div class="inspector-content-inner" style="height: 100%; display: flex; flex-direction: column; background: var(--peak-background);">
            <div style="padding: 16px; border-bottom: 1px solid var(--border-color);">
                <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--peak-primary);">Documentation Settings</h2>
                <p style="margin: 4px 0 0; font-size: 12px; color: var(--peak-secondary);">Select which documentation sources appear in the AI Assistant menu.</p>
            </div>
            <div id="ai-assist-settings-content" style="flex: 1; overflow-y: auto; padding: 16px;">
                <!-- Settings list will be rendered here by SettingsController -->
            </div>
        </div>
    `;
}

// renderAssistInputBar removed - moved to ui/InputBar.js

function attachAIAssistListeners(currentFileContent, currentFilePath) {
    // Instantiate ChatView to attach its listeners
    const chatView = new ChatView();

    // --- Tab Switching Logic ---
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.term-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            panels.forEach(p => p.style.display = 'none');
            panels.forEach(p => p.classList.remove('active'));

            // Activate clicked
            tab.classList.add('active');
            const targetId = `panel-${tab.dataset.target}`;
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.style.display = 'flex';
                targetPanel.classList.add('active');
            }
        });
    });

    return () => {
        // Cleanup
        if (chatView) chatView.destroy();
    };
}

module.exports = {
    getAIAssistHTML,
    getSettingsHTML,
    attachAIAssistListeners
};