const path = require('path');
const { AvailableModels } = require('../../utils/enums.js');
const AgentRegistry = require('./core/AgentRegistry');
const ToolRegistry = require('./tools/ToolRegistry');
const InputBar = require('./ui/InputBar');
const ChatView = require('./ui/ChatView');
const fs = require('fs');
const ExtensionMarketplace = require('../Extensions/ExtensionMarketplace');

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
        // ChatView will handle the initial view
        initialHTML = '';
    }

    // REFINED COMPACT CSS (VS Code Sidebar Look)
    const taskCardCompactCSS = `
/* TaskCard Compact Design - Phase 2 */

/* === VARIABLES === */
:root {
    /* Ultra Compact Spacing */
    --task-card-padding: 8px;
    --task-card-gap: 4px;
    --step-padding: 4px 8px;
    --chip-padding: 2px 6px;
    --sub-item-indent: 20px;

    /* Colors */
    --task-border: rgba(255, 255, 255, 0.08);
    --task-bg: rgba(255, 255, 255, 0.02);
    --task-hover-bg: rgba(255, 255, 255, 0.04);
    --text-muted: #999;
    --text-dimmed: #666;

    /* File Type Colors */
    --file-js: #F7DF1E;
    --file-ts: #3178C6;
    --file-css: #264de4;
    --file-task: #7AA2F7;
    --file-md: #519aba;
}

/* === COMPACT TASK CARD === */
.task-card-compact {
    background: var(--task-bg);
    border: 1px solid var(--task-border);
    border-radius: 6px;
    padding: var(--task-card-padding);
    margin-bottom: 6px;
    font-size: 11px;
}

/* Live Container Compact Styling */
.task-live-container {
    font-size: 11px;
    line-height: 1.4;
}

.task-live-container .tool-card {
    padding: 4px 8px;
    margin: 3px 0;
    font-size: 10px;
    border-radius: 3px;
}

.task-live-container .tool-header {
    font-size: 10px;
    margin-bottom: 3px;
}

.task-live-container .tool-content {
    font-size: 11px;
    line-height: 1.4;
}

/* Header */
.task-card-header-compact {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
    padding-bottom: 2px;
}

.task-title-compact {
    font-size: 13px;
    font-weight: 600;
    margin: 0;
    color: var(--peak-primary);
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
    padding-right: 8px;
    cursor: pointer;
    transition: all 0.2s;
}

.task-title-compact.expanded {
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
}

.task-title-compact:hover {
    color: #fff;
}

/* Header Actions */
.header-actions {
    display: flex;
    gap: 2px;
    align-items: center;
    flex-shrink: 0;
}

.header-action-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 3px;
    border-radius: 3px;
    transition: all 0.15s;
    display: flex;
    align-items: center;
    justify-content: center;
}

.header-action-btn:hover {
    background: var(--task-hover-bg);
    color: var(--peak-primary);
}

/* Summary */
.task-summary-compact {
    font-size: 11px;
    line-height: 1.4;
    color: #B8B8B8;
    margin-bottom: 6px;
    margin-top: 0;
}

.task-summary-compact code {
    background: rgba(255, 255, 255, 0.08);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'SF Mono', monospace;
    font-size: 12px;
    color: var(--peak-accent);
}

/* Files Edited Section */
.files-edited-section {
    margin-bottom: 8px;
}

.files-edited-section h4 {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-muted);
    margin: 0 0 6px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.file-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.file-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: var(--chip-padding);
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.06);
    font-size: 11px;
    font-family: 'SF Mono', monospace;
    transition: background 0.2s;
}

.file-chip:hover {
    background: rgba(255, 255, 255, 0.1);
}

/* File type colors */
.file-chip.js {
    color: var(--file-js);
}

.file-chip.ts {
    color: var(--file-ts);
}

.file-chip.css {
    color: var(--file-css);
}

.file-chip.task {
    color: var(--file-task);
}

.file-chip.md {
    color: var(--file-md);
}

.file-chip i {
    width: 14px;
    height: 14px;
}

/* Progress Updates Section */
.progress-updates-section {
    margin-top: 8px;
}

.progress-updates-section h4 {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    margin: 0 0 8px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

/* Progress Step */
.progress-step {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: var(--step-padding);
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    transition: background 0.2s;
}

.progress-step:hover {
    background: var(--task-hover-bg);
}

.progress-step:last-child {
    border-bottom: none;
}

.step-number {
    color: var(--text-dimmed);
    font-size: 11px;
    font-weight: 600;
    min-width: 22px;
    text-align: right;
    flex-shrink: 0;
    margin-top: 2px;
}

.step-title {
    flex: 1;
    font-size: 13px;
    color: var(--peak-primary);
    line-height: 1.4;
}

.step-collapse {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 0;
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s, color 0.2s;
    flex-shrink: 0;
    margin-top: 2px;
}

.step-collapse:hover {
    color: var(--peak-primary);
}

.step-collapse.collapsed {
    transform: rotate(-90deg);
}

/* Step Details */
.step-details {
    padding-left: var(--sub-item-indent);
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
}

.step-details.hidden {
    display: none;
}

.step-action {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--text-muted);
    line-height: 1.4;
}

.step-action i {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
}

.step-action.thought {
    color: #9d7cd8;
}

.step-action.searched {
    color: #7dcfff;
}

.step-action.analyzed {
    color: #bb9af7;
}

.step-action.editing {
    color: #ff9e64;
}

.step-metadata {
    color: var(--text-dimmed);
    font-size: 11px;
    margin-left: auto;
}

/* Active Step (currently executing) */
.progress-step.active {
    background: rgba(114, 137, 218, 0.08);
    border-left: 2px solid #7289da;
    padding-left: 10px;
}

.progress-step.active .step-title {
    color: #7dcfff;
}

/* Spinner for active steps */
.step-spinner {
    width: 12px;
    height: 12px;
    animation: spin 1s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* === LIVE CONTAINER (Tool Cards) ===  */
.task-card-compact .task-live-container {
    margin-top: 6px;
}

/* Ultra Compact all tool cards */
.task-card-compact .tool-card,
.task-card-compact [class*="tool-"],
.task-card-compact [class*="-card"] {
    padding: 4px 6px !important;
    margin: 3px 0 !important;
    font-size: 10px !important;
    border-radius: 2px !important;
    line-height: 1.3 !important;
}

/* Compact tool buttons */
.task-card-compact .tool-action-btn-compact,
.task-card-compact .file-action-btn-compact {
    padding: 6px 10px !important;
    font-size: 12px !important;
}

/* Compact code blocks */
.task-card-compact pre {
    padding: 8px !important;
    margin: 6px 0 !important;
    font-size: 12px !important;
}

/* Compact headings */
.task-card-compact h4 {
    font-size: 13px !important;
    margin: 8px 0 4px 0 !important;
}

/* Compact paragraphs */
.task-card-compact p {
    margin: 6px 0 !important;
    line-height: 1.5 !important;
}

/* Compact Step Styling */
.compact-step {
    margin-bottom: 3px;
    border-radius: 3px;
    transition: all 0.2s;
}

.compact-step.finished {
    opacity: 0.65;
}

.compact-step-header {
    padding: 3px 6px;
    border-radius: 3px;
    transition: background 0.15s;
}

.compact-step-header:hover {
    background: rgba(255, 255, 255, 0.03);
}

.compact-step-body {
    padding: 0 6px 3px 16px;
    font-size: 10px;
    line-height: 1.35;
}

/* Tighter tool card spacing inside steps */
.compact-step-body .tool-card-compact,
.compact-step-body .file-edit-card-compact {
    margin: 2px 0;
    padding: 3px 5px;
}

.compact-step-body .tool-line,
.compact-step-body .file-edit-line {
    gap: 3px;
}

/* Reduce paragraph spacing */
.compact-step-body p {
    margin: 2px 0 !important;
    font-size: 10px !important;
}

/* === UNIFIED TASK CARD EXTRAS === */
.unified-task-card {
    display: flex;
    flex-direction: column;
}

.task-history-container {
    border-bottom: 1px solid var(--task-border);
    margin-bottom: 8px;
    padding-bottom: 8px;
    display: none; /* Hidden by default until populated */
}

.task-history-container:not(:empty) {
    display: block;
}

.task-status-bar {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--task-border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    color: var(--text-muted);
}

.task-status-bar .status-indicator {
    display: flex;
    align-items: center;
    gap: 6px;
}

.task-status-bar .spin {
    animation: spin 1s linear infinite;
}
`;

    const compactStyle = `
        <style>
            ${taskCardCompactCSS}
            
            /* Main Container */
            #ai-assist-content { background-color: var(--window-background-color); }

            /* Chat Messages */
            .term-chat-msg { font-size: 12px; margin-bottom: 12px; padding: 0; line-height: 1.6; box-sizing: border-box; }
            .term-chat-msg.user { 
                padding: 10px 12px 10px 12px; 
                background: var(--peak-accent); 
                color: white; 
                border-radius: 12px; 
                border-bottom-right-radius: 0;
                margin-left: auto; 
                margin-right: 0;
                max-width: 90%; 
                width: auto;
                font-weight: 500;
                font-size: 12px; 
                margin-bottom: 10px;
                text-align: left;
                position: relative;
                box-sizing: border-box;
                align-self: flex-end;
            }
            .term-chat-msg.ai { 
                padding: 0; /* Match style.css - no padding */
                margin: 0; /* Explicit margin to match user bubble */
                background: transparent;
                color: var(--peak-primary); 
                width: 100%; /* CRITICAL: Must match user bubble */
                max-width: 100%; 
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
                padding-left: 0;
                padding-right: 0;
            }

            /* Minimal Message Content Wrapper - Match style.css */
            .message-content-minimal {
                padding: 0; /* No padding here - applied to .markdown-content instead */
                margin: 0;
                width: 100%;
                box-sizing: border-box;
                background: transparent;
            }
            }
            
            .message-divider {
                display: none;
            }

            /* Details Element Reset */
            details.message-card-minimal {
                width: 100%;
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                background: var(--window-background-color) !important;
                border: 1px solid var(--border-color) !important;
                border-radius: 12px;
                border-bottom-left-radius: 0; /* Mirror user bubble */
                overflow: hidden;
            }
            summary.message-summary-minimal {
                margin: 0;
                padding: 6px 10px; /* Ultra compact padding */
                box-sizing: border-box;
                display: block;
                cursor: pointer;
                background: transparent !important;
                font-size: 11px;
                font-weight: 600;
            }
            .summary-header-row {
                display: flex;
                align-items: center;
                gap: 6px;
                margin-bottom: 0; /* Remove bottom margin for compactness */
            }
            .summary-content-wrapper {
                padding-left: 20px;
                margin-top: 2px;
            }
            
            /* Ultra Minimal Summaries */
            .summaries-card-minimal {
                font-size: 11px;
                color: var(--peak-secondary);
                padding: 0;
            }
            .key-points-list.minimal {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            .key-points-list.minimal li {
                margin-bottom: 2px;
                position: relative;
                padding-left: 10px;
                line-height: 1.4;
            }
            .key-points-list.minimal li::before {
                content: "•";
                position: absolute;
                left: 0;
                color: var(--peak-accent);
                opacity: 0.7;
            }
            .summaries-meta.minimal {
                margin-top: 2px;
                display: flex;
                gap: 6px;
                flex-wrap: wrap;
                opacity: 0.7;
            }
            
            /* Tool & Block Styles - Full Bleed */
            /* Cards inside .markdown-content within .message-content-minimal */
            .message-content-minimal .markdown-content .tool-block,
            .message-content-minimal .markdown-content .file-edit-card,
            .message-content-minimal .markdown-content .file-edit-card-compact,
            .message-content-minimal .markdown-content .section-card,
            .message-content-minimal .markdown-content .terminal-output-block,
            .message-content-minimal .markdown-content .thinking-block,
            .message-content-minimal .markdown-content .chat-code-block,
            .message-content-minimal .markdown-content .tool-card-compact,
            .message-content-minimal .markdown-content .command-result-card,
            .message-content-minimal .markdown-content .summaries-card {
                margin: 6px 0; /* Tighter spacing */
                width: 100%;
                border: 1px solid var(--border-color)!important;
                border-radius: 6px !important; /* Restore radius for children */
                overflow: hidden;
                background: var(--window-background-color);
                box-sizing: border-box;
            }
            
            /* Fallback for cards not inside message-content-minimal */
            .tool-block, .file-edit-card, .file-edit-card-compact, .section-card, .terminal-output-block, .thinking-block, .chat-code-block, .tool-card-compact, .command-result-card, .summaries-card {
                margin: 6px 0;
                width: 100%;
                border: 1px solid var(--border-color)!important;
                border-radius: 6px !important;
                overflow: hidden;
                background: var(--window-background-color);
                box-sizing: border-box;
            }

            /* Specific override for minimal summary card to ensure no borders */
            .summaries-card-minimal {
                width: 100%;
                margin: 0;
                border: none !important;
                background: transparent !important;
                box-sizing: border-box;
            }
            
            /* Markdown Content Refinements */
            .markdown-content {
                width: 100%;
                margin: 0;
                padding: 0; /* No padding on container */
                box-sizing: border-box;
                background: transparent;
            }
            /* Padding only on text elements, not cards */
            .markdown-content p { margin-bottom: 8px; padding-left: 12px; padding-right: 12px; }
            .markdown-content ul, .markdown-content ol { margin-bottom: 8px; padding-left: 32px; padding-right: 12px; }
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
                font-size: 13px; 
                padding: 4px 2px; 
                min-height: 24px; 
                max-height: 200px; 
                background: transparent; 
                border: none; 
                outline: none; 
                resize: none; 
                color: var(--peak-primary); 
                width: 100%; 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                line-height: 1.5;
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

            /* --- Phase 2: Agentic Task Card --- */

            .task-card {
                border: 1px solid var(--border-color);
                border-radius: 8px;
                background: var(--window-background-color);
                margin-bottom: 16px;
                overflow: hidden;
                transition: border-color 0.3s;
            }

            .task-context {
                padding: 10px 12px;
                background: var(--control-background-color);
                border-bottom: 1px solid var(--border-color);
                font-size: 13px;
                color: var(--peak-primary);
                font-weight: 500;
            }

            /* History (Folded) */
            .task-history-container {
                background: rgba(0,0,0,0.02);
                border-bottom: 1px solid var(--border-color);
                padding: 4px 0;
            }

            .history-item {
                padding: 4px 12px;
                opacity: 0.7;
                font-size: 11px;
                border-left: 2px solid var(--border-color);
                margin-left: 12px;
                margin-bottom: 4px;
            }

            .history-marker {
                padding: 6px 12px;
                font-size: 11px;
                color: var(--peak-secondary);
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 8px;
                background: var(--window-background-color);
                border-bottom: 1px solid var(--border-color);
                transition: background 0.2s;
            }
            .history-marker:hover {
                background: var(--control-background-color);
            }
            .history-marker .history-chevron {
                transition: transform 0.2s;
            }

            /* Live Area */
            .task-live-container {
                padding: 12px;
            }

            /* Status Bar */
            .task-status-bar {
                padding: 8px 12px;
                border-top: 1px solid var(--border-color);
                background: var(--window-background-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: 11px;
            }

            .status-indicator {
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--peak-accent);
                font-weight: 500;
            }

            .task-images img {
                height: 40px;
                border-radius: 4px;
                border: 1px solid var(--border-color);
                margin-right: 8px;
            }


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
                width: 100%;
                box-sizing: border-box;
            }

            /* Minimalistic Thinking Card - Ultra Minimal Design */
            .thinking-block-minimal {
                margin: 4px 0;
                font-family: 'GeistMono', monospace;
            }

            .thinking-summary-minimal {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 4px 0;
                cursor: pointer;
                font-size: 10px;
                color: var(--peak-secondary);
                opacity: 0.7;
                transition: opacity 0.2s;
                user-select: none;
                list-style: none; /* Hide default triangle */
            }

            .thinking-summary-minimal:hover {
                opacity: 1;
            }

            .thinking-summary-minimal::-webkit-details-marker {
                display: none;
            }

            .thinking-icon {
                display: flex;
                align-items: center;
            }

            .thinking-text {
                flex: 1;
            }

            .thinking-chevron {
                width: 12px;
                height: 12px;
                transition: transform 0.2s;
            }

            details[open] .thinking-chevron {
                transform: rotate(180deg);
            }

            .thinking-scroll-area {
                margin-top: 4px;
                padding-left: 12px; /* Indent line */
                border-left: 1px solid var(--border-color);
            }

            .thinking-content-raw {
                font-size: 10px;
                line-height: 1.5;
                color: var(--peak-secondary);
                max-height: 200px; /* Fixed scrollview */
                overflow-y: auto;
                white-space: pre-wrap;
                margin: 0;
                padding: 4px;
            }

            /* Loader Animation */
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }

            .spin {
                animation: spin 1s linear infinite;
            }

            /* Minimalistic Analysis Block (same style as thinking) */
            .analysis-block-minimal {
                margin: 4px 0;
                border: none;
                background: transparent;
            }
            .analysis-summary-minimal {
                list-style: none;
                cursor: pointer;
                padding: 4px 8px;
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
                padding: 4px 0 4px 12px; /* Indented content */
                font-size: 10px;
                line-height: 1.5;
                color: var(--peak-secondary);
                white-space: pre-wrap;
                font-family: 'GeistMono', 'Menlo', monospace;
                opacity: 0.7;
                max-height: 300px;
                overflow-y: auto;
                width: 100%;
                box-sizing: border-box;
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
            /* Removed conflicting definition - using the one from lines 124-134 instead */
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
                padding: 8px 0;
                width: 100%;
                box-sizing: border-box;
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
            .tool-block .header, .file-edit-header, .section-card summary, .summaries-header {
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
            .tool-block .content, .file-edit-content pre, .section-card .section-content, .summaries-content {
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

            /* Compact Card Styles */
            .file-edit-card-compact, .tool-card-compact {
                background: transparent;
                padding: 0; /* No padding on container - let parent handle spacing */
                box-sizing: border-box;
                width: 100%;
            }
            
            .file-edit-line {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px; /* Padding on content line instead of container */
                font-size: 11px;
                color: var(--peak-primary);
                width: 100%;
                box-sizing: border-box;
            }
            
            .file-path-compact {
                font-family: 'GeistMono', monospace;
                font-size: 10px;
                color: var(--peak-primary);
                flex: 1;
                min-width: 0;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .file-meta-compact {
                font-size: 9px;
                color: var(--peak-secondary);
                opacity: 0.6;
                margin-left: auto;
            }
            
            .toggle-code-btn-compact {
                background: transparent;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                padding: 4px;
                cursor: pointer;
                color: var(--peak-secondary);
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .toggle-code-btn-compact:hover {
                background: var(--control-background-color);
                color: var(--peak-primary);
                border-color: var(--peak-accent);
            }
            
            .file-action-btn-compact, .tool-action-btn-compact {
                font-size: 9px;
                padding: 4px 8px;
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
            
            .file-action-btn-compact:hover, .tool-action-btn-compact:hover {
                background: var(--peak-accent);
                border-color: var(--peak-accent);
                color: white;
            }
            
            .file-action-btn-compact:disabled, .tool-action-btn-compact:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            
            .file-code-collapsed, .file-edit-content {
                margin: 12px 0; /* Standard vertical spacing */
                width: 100%; /* Natural width */
                background: var(--window-background-color);
                border: none; /* Parent already has borders */
                border-radius: 0;
                overflow-x: auto;
            }
            
            .file-code-collapsed pre, .file-edit-content pre {
                margin: 0;
                padding: 0;
                font-size: 10px;
                line-height: 1.4;
            }
        </style>
    `;

    return `
        ${compactStyle}
        <div class="inspector-tabs-header">
            <button class="tab-btn active" data-target="ai">Chat</button>
            <button class="tab-btn" data-target="tasks">Tasks</button>
            <button class="tab-btn" data-target="mcp">MCP</button>
            <button class="tab-btn" data-target="extensions">Extensions</button>
            <button class="tab-btn" data-target="live">Live</button>
        </div>

        <div id="ai-assist-content" class="inspector-content-inner" style="height: 100%; display: flex; flex-direction: column; position: relative;">
            <div id="panel-ai" class="term-panel active" style="display:flex; flex-direction:column; height:100%; overflow: hidden;">
                <div class="term-chat-history" id="ai-assist-scroller" style="flex: 1; overflow-y: auto; padding: 16px 12px; display: flex; flex-direction: column;">
                    ${initialHTML ? `<div class="term-chat-msg ai markdown-content" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                        ${initialHTML}
                    </div>` : ''}
                    <div id="ai-assist-chat-thread" style="display: flex; flex-direction: column; width: 100%;"></div>
                    <div id="streaming-message-container-assist"></div>
                </div>
                ${new InputBar().render(isFileContextUsable, localStorage.getItem('peak-ai-agent'), localStorage.getItem('peak-agent-mode') === 'true')}
            </div>

            <div id="panel-tasks" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <div id="tasks-content" class="markdown-content" style="flex:1; overflow-y:auto; font-size:13px; line-height: 1.6; display: flex; flex-direction: column;">
                    <div style="color:var(--peak-secondary); text-align:center; margin-top:40px;">Loading plan...</div>
                </div>
            </div>

            <div id="panel-mcp" class="term-panel" style="display: none; flex-direction: column;">
                <div class="logs-header" style="padding: 8px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                    <div style="font-size: 11px; font-weight: 600; color: var(--peak-secondary);">MCP SERVERS</div>
                    <button id="btn-refresh-mcp" class="icon-btn" title="Refresh"><i data-lucide="refresh-cw"></i></button>
                </div>
                <div id="mcp-server-list" style="flex: 1; overflow-y: auto; padding: 0;">
                    <!-- MCP Servers will be rendered here -->
                </div>
            </div>


            <div id="panel-extensions" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <!-- Extension marketplace will be rendered here -->
            </div>

            <div id="panel-live" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <div style="padding: 8px 12px; background: transparent; border-bottom: 1px solid var(--border-color); display: flex; gap: 8px;">
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
                <h2 style="margin: 0; font-size: 16px; font-weight: 600; color: var(--peak-primary);">Peak Assistant Settings</h2>
                <p style="margin: 4px 0 0; font-size: 12px; color: var(--peak-secondary);">Configure agents, auto-accept rules, and documentation sources.</p>
            </div>
            <div id="ai-assist-settings-content" style="flex: 1; overflow-y: auto; padding: 16px;">
                <!-- Settings list will be rendered here by SettingsController -->
            </div>
        </div>
    `;
}

// renderAssistInputBar removed - moved to ui/InputBar.js

function attachAIAssistListeners(currentFileContent, currentFilePath) {
    console.log('[AIAssistantView] attachAIAssistListeners called');
    // Instantiate ChatView to attach its listeners
    const chatView = new ChatView();

    // --- Tab Switching Logic ---
    const tabs = document.querySelectorAll('.tab-btn');
    const panels = document.querySelectorAll('.term-panel');
    console.log('[AIAssistantView] Found tabs:', tabs.length, 'panels:', panels.length);

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
            console.log('[AIAssistantView] Tab clicked:', tab.dataset.target, 'Panel found:', !!targetPanel);
            if (targetPanel) {
                targetPanel.style.display = 'flex';
                targetPanel.classList.add('active');

                // Initialize extension marketplace when Extensions tab is opened
                if (tab.dataset.target === 'extensions' && !targetPanel.dataset.initialized) {
                    console.log('[AIAssistantView] Initializing ExtensionMarketplace...');
                    targetPanel.dataset.initialized = 'true';
                    try {
                        new ExtensionMarketplace(targetPanel);
                        console.log('[AIAssistantView] ExtensionMarketplace initialized successfully');
                    } catch (err) {
                        console.error('[AIAssistantView] Error initializing ExtensionMarketplace:', err);
                    }
                }
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