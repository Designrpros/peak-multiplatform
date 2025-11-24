// src/components/AIAssistant/AIAssistantView.js
const path = require('path');
const { AvailableModels } = require('../../utils/enums.js');
const { renderMarkdown } = require('../../utils/markdown.js');

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

function getAIAssistHTML(currentFileContent, currentFilePath, currentFileContentError) {
    const isError = !!currentFileContentError;
    const isContentEmpty = !currentFileContent || currentFileContent.length === 0;
    const isFileContextUsable = !!currentFilePath && !isError && !isContentEmpty;
    const fileName = currentFilePath ? path.basename(currentFilePath) : 'None';
    const docsUrl = getDocsUrl(currentFilePath);
    
    let initialText = '';
    if (isError) initialText = `Error reading file: ${currentFileContentError}`;
    else if (isFileContextUsable) initialText = `Hi! I'm ready to help with **${fileName}**.\n\nAsk me to explain, refactor, or debug this file.`;
    else initialText = `Select a non-empty file in the Project View to enable context-aware assistance.`;

    return `
        <div class="inspector-tabs-header">
            <button class="tab-btn active" data-target="ai">AI Assist</button>
            <button class="tab-btn" data-target="docs">Docs</button>
            <button class="tab-btn" data-target="live">Live</button>
        </div>

        <div id="ai-assist-content" class="inspector-content-inner">
            
            <div id="panel-ai" class="term-panel active" style="display:flex; flex-direction:column; height:100%; overflow: hidden;">
                
                <div class="term-chat-history" id="ai-assist-scroller">
                    <div class="term-chat-msg ai markdown-content">
                        ${renderMarkdown(initialText)}
                    </div>
                    <div id="ai-assist-chat-thread"></div>
                    <div id="streaming-message-container-assist"></div>
                </div>
                
                ${renderAssistInputBar(isFileContextUsable)}
            </div>

            <div id="panel-docs" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <webview id="inspector-docs-view" src="${docsUrl}" style="flex: 1; width: 100%; height: 100%; border: none;" webpreferences="contextIsolation=true"></webview>
            </div>

            <div id="panel-live" class="term-panel" style="display:none; height:100%; flex-direction: column;">
                <div style="padding: 8px 12px; background: var(--window-background-color); border-bottom: 1px solid var(--border-color); display: flex; gap: 8px;">
                    <input type="text" id="live-url-input" value="http://localhost:3000" style="flex: 1; background: var(--control-background-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 4px 8px; font-size: 12px; color: var(--peak-primary); outline: none;">
                    <button id="btn-live-refresh" class="icon-btn" style="padding: 4px;"><i data-lucide="rotate-cw" style="width: 14px; height: 14px;"></i></button>
                    <button id="btn-live-popout" class="icon-btn" style="padding: 4px;" title="Open in Tab"><i data-lucide="external-link" style="width: 14px; height: 14px;"></i></button>
                </div>
                <webview id="inspector-live-view" src="http://localhost:3000" style="flex: 1; width: 100%; height: 100%; border: none; background: white;" webpreferences="contextIsolation=true, nodeIntegration=false"></webview>
            </div>
        </div>
    `;
}

function renderAssistInputBar(isFileContextUsable) {
    const defaultModel = AvailableModels.find(m => m.id === 'openrouter/auto') || AvailableModels[0];
    const isDisabled = !isFileContextUsable;
    
    return `
        <div class="inspector-input-container">
            <div class="inspector-input-box">
                <textarea class="chat-textarea" id="ai-assist-input-textarea" 
                    placeholder="${isDisabled ? 'Select a file...' : 'Ask about this file...'}" 
                    rows="1" 
                    ${isDisabled ? 'disabled' : ''}></textarea>
                
                <div class="chat-controls">
                    <div class="left-controls" style="flex: 1;">
                         <div class="model-selector-wrapper" style="position:relative; width: 100%;">
                            <select id="ai-assist-model-select" class="model-select" ${isDisabled ? 'disabled' : ''}>
                                ${AvailableModels.map(model => `<option value="${model.id}" ${model.id === defaultModel.id ? 'selected' : ''}>${model.name}</option>`).join('')}
                            </select>
                         </div>
                    </div>
                    <div class="right-controls">
                         <button id="ai-assist-submit-button" class="chat-submit-btn" disabled>
                            <i data-lucide="arrow-up"></i>
                         </button>
                         <button id="ai-assist-stop-button" class="chat-submit-btn stop" style="display: none;">
                            <i data-lucide="square"></i>
                         </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

module.exports = { getAIAssistHTML };