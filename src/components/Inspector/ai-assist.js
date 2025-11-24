// src/components/Inspector/ai-assist.js
const { AvailableModels } = require('../../utils/enums.js');
const path = require('path');
const { ipcRenderer } = require('electron'); 
const { renderMarkdown } = require('../../utils/markdown.js');

const AI_ASSIST_SESSION_ID = -999; 
let assistStreamingMessageRef = null;
let assistLocalListener = null;

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

        <div id="ai-assist-content" class="inspector-content-inner" style="height: calc(100% - 40px); overflow: hidden; display: flex; flex-direction: column; padding: 0;">
            
            <div id="panel-ai" class="term-panel active" style="display:flex; flex-direction:column; height:100%; overflow: hidden;">
                
                <div class="term-chat-history" id="ai-assist-scroller" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px 16px 20px 16px; display: flex; flex-direction: column; gap: 16px;">
                    <div class="term-chat-msg ai markdown-content" style="padding: 0; background: transparent; overflow-wrap: anywhere;">
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
        <div class="chat-input-container" style="flex-shrink: 0; padding: 12px 0; background: var(--window-background-color); border-top: 1px solid var(--border-color); width: 100%;">
            <div class="chat-input-box" style="width: 100%; margin: 0; border-left: none; border-right: none; border-bottom: none; border-top: none; border-radius: 0; padding: 0; background: var(--window-background-color); box-shadow: none;">
                
                <textarea class="chat-textarea" id="ai-assist-input-textarea" 
                    placeholder="${isDisabled ? 'Select a file...' : 'Ask about this file...'}" 
                    rows="1" 
                    ${isDisabled ? 'disabled' : ''}
                    style="background: transparent; border: 1px solid var(--border-color); border-radius: 8px; width: calc(100% - 24px); margin: 0 12px; padding: 10px 12px; outline: none; resize: none; font-size: 13px; color: var(--peak-primary); font-family: inherit; line-height: 1.4; max-height: 100px; box-sizing: border-box;"></textarea>
                
                <div class="chat-controls" style="display: flex; justify-content: space-between; padding: 8px 12px 0 12px; align-items: center;">
                    <div class="left-controls" style="flex: 1;">
                         <div class="model-selector-wrapper" style="position:relative; width: 100%;">
                            <select id="ai-assist-model-select" class="model-select" ${isDisabled ? 'disabled' : ''} style="background: transparent; border: none; font-size: 11px; color: var(--peak-secondary); cursor: pointer; outline: none; width: 100%; text-overflow: ellipsis;">
                                ${AvailableModels.map(model => `<option value="${model.id}" ${model.id === defaultModel.id ? 'selected' : ''}>${model.name}</option>`).join('')}
                            </select>
                         </div>
                    </div>
                    <div class="right-controls">
                         <button id="ai-assist-submit-button" class="chat-submit-btn" disabled style="background: var(--peak-accent); border: none; border-radius: 6px; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; transition: opacity 0.2s; padding: 0;">
                            <i data-lucide="arrow-up" style="width: 14px; height: 14px; stroke-width: 2.5;"></i>
                         </button>
                         <button id="ai-assist-stop-button" class="chat-submit-btn" style="display: none; background: #ff3b30; border: none; border-radius: 6px; width: 24px; height: 24px; align-items: center; justify-content: center; color: white; cursor: pointer; padding: 0;">
                            <i data-lucide="square" style="width: 12px; height: 12px; fill: white;"></i>
                         </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function handleAssistStreamData(event, id, data) {
    if (id !== AI_ASSIST_SESSION_ID || !assistStreamingMessageRef) return;
    const assistContentArea = document.getElementById('streaming-message-container-assist');
    const assistScroller = document.getElementById('ai-assist-scroller');
    const assistMessageDiv = assistContentArea?.querySelector('.term-chat-msg.ai');

    if (data.type === 'data' && assistMessageDiv) {
        assistStreamingMessageRef.content += data.content;
        assistMessageDiv.innerHTML = renderMarkdown(assistStreamingMessageRef.content);
        if(assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;
        
    } else if (data.type === 'end' || data.type === 'error') {
        stopAssistStream(data.message);
    }
}

function stopAssistStream(errorMessage = null) {
    if (!assistStreamingMessageRef) return;
    const chatThread = document.getElementById('ai-assist-chat-thread');
    const assistContentArea = document.getElementById('streaming-message-container-assist');
    
    let finalContent = assistStreamingMessageRef.content;
    if (errorMessage) finalContent = `**Error:** ${errorMessage}\n\n${finalContent || ''}`;
    
    if (assistContentArea && chatThread) {
        const finalMessageHtml = `
            <div class="term-chat-msg ai markdown-content" style="padding: 0; font-size: 13px; line-height: 1.6; width: 100%; overflow-wrap: anywhere; white-space: normal; background: transparent; color: var(--peak-primary); align-self: flex-start; margin-bottom: 12px;">
                ${renderMarkdown(finalContent)}
            </div>
        `;
        if (finalContent.trim() !== '') chatThread.innerHTML += finalMessageHtml;
        assistContentArea.innerHTML = ''; 
        if(window.lucide) window.lucide.createIcons();
    }
    
    const submitButton = document.getElementById('ai-assist-submit-button');
    const stopButton = document.getElementById('ai-assist-stop-button');
    if (submitButton) submitButton.style.display = 'flex';
    if (stopButton) stopButton.style.display = 'none';
    
    const textarea = document.getElementById('ai-assist-input-textarea');
    if (textarea) {
        textarea.disabled = false;
        textarea.focus();
    }
    assistStreamingMessageRef = null;
}

function attachAIAssistListeners(currentFileContent, currentFilePath) {
    const container = document.getElementById('ai-assist-content');
    const parentContainer = container ? container.parentNode : document;

    // --- Tabs Logic ---
    const tabs = parentContainer.querySelectorAll('.tab-btn');
    const panels = parentContainer.querySelectorAll('.term-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
            const target = parentContainer.querySelector(`#panel-${tab.dataset.target}`);
            if (target) {
                target.style.display = tab.dataset.target === 'ai' ? 'flex' : 'flex';
                target.classList.add('active');
            }
        });
    });
    
    // --- Live Preview Logic ---
    const liveInput = document.getElementById('live-url-input');
    const liveWebview = document.getElementById('inspector-live-view');
    const btnRefresh = document.getElementById('btn-live-refresh');
    const btnPopout = document.getElementById('btn-live-popout');

    if (liveInput && liveWebview) {
        const loadUrl = () => {
            let url = liveInput.value.trim();
            if (!url.startsWith('http')) url = 'http://' + url;
            liveWebview.src = url;
        };
        liveInput.addEventListener('keydown', (e) => { if(e.key === 'Enter') loadUrl(); });
        if(btnRefresh) btnRefresh.addEventListener('click', () => liveWebview.reload());
        if(btnPopout) btnPopout.addEventListener('click', () => {
             if(window.tabManager) window.tabManager.handlePerformAction({ mode: 'Search', query: liveInput.value, engine: 'google' });
        });
    }

    const { currentFileContentError } = window.getProjectFileContext ? window.getProjectFileContext() : {};
    const isError = !!currentFileContentError;
    const isContentEmpty = !currentFileContent || currentFileContent.length === 0;
    const isFileContextUsable = !!currentFilePath && !isError && !isContentEmpty;
    
    const textarea = document.getElementById('ai-assist-input-textarea');
    const submitButton = document.getElementById('ai-assist-submit-button');
    const stopButton = document.getElementById('ai-assist-stop-button');
    const modelSelect = document.getElementById('ai-assist-model-select');
    const assistScroller = document.getElementById('ai-assist-scroller');

    assistLocalListener = handleAssistStreamData;
    ipcRenderer.on('llm-stream-data', assistLocalListener);

    const onInput = () => {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
        const isValid = isFileContextUsable && textarea.value.trim().length > 0 && !assistStreamingMessageRef;
        if (submitButton) {
            submitButton.disabled = !isValid;
            submitButton.style.opacity = isValid ? '1' : '0.3';
        }
    };
    
    if (textarea) {
        textarea.addEventListener('input', onInput);
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }
    
    const onSubmit = (e) => {
        e?.preventDefault();
        const userPrompt = textarea.value;
        const model = modelSelect.value;
        if (!isFileContextUsable || userPrompt.trim().length === 0 || !!assistStreamingMessageRef) return;
        
        const fullPrompt = `CONTEXT: The user has an open file named "${path.basename(currentFilePath)}". Its content is:\n\n---\n${currentFileContent}\n---\n\nUSER QUESTION: ${userPrompt}`;
        
        textarea.value = '';
        onInput(); 
        textarea.disabled = true;
        submitButton.style.display = 'none';
        stopButton.style.display = 'flex';
        
        const chatThread = document.getElementById('ai-assist-chat-thread');
        
        chatThread.innerHTML += `
            <div class="term-chat-msg user markdown-content" style="padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; max-width: 95%; width: fit-content; overflow-wrap: anywhere; white-space: normal; box-sizing: border-box; background: var(--peak-accent); color: white; align-self: flex-end; margin-bottom: 12px;">
                ${renderMarkdown(userPrompt)}
            </div>
        `;
        
        assistStreamingMessageRef = { role: 'assistant', content: '' };
        const assistContentArea = document.getElementById('streaming-message-container-assist');
        if (assistContentArea) {
            assistContentArea.innerHTML = `
                <div class="term-chat-msg ai markdown-content" style="padding: 0; font-size: 13px; line-height: 1.6; width: 100%; max-width: 100%; overflow-wrap: anywhere; background: transparent; color: var(--peak-primary); align-self: flex-start; margin-bottom: 12px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="loader-2" class="spin" style="width:14px; height:14px; animation: spin 1s linear infinite;"></i> Thinking...
                    </div>
                </div>
                <style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
            `;
            if(window.lucide) window.lucide.createIcons();
        }
        
        if(assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;
        const messages = [{ role: 'user', content: fullPrompt }];
        window.ipcRenderer.send('llm-stream-request', AI_ASSIST_SESSION_ID, model, messages);
    };

    if (submitButton) submitButton.addEventListener('click', onSubmit);
    if (textarea) textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) onSubmit(e); });
    if (stopButton) stopButton.addEventListener('click', () => stopAssistStream('User aborted stream.'));

    if(window.lucide) window.lucide.createIcons();

    return () => {
        stopAssistStream(); 
        if (textarea) textarea.removeEventListener('input', onInput);
        if (submitButton) submitButton.removeEventListener('click', onSubmit);
        if (assistLocalListener) ipcRenderer.removeListener('llm-stream-data', assistLocalListener);
    };
}

module.exports = { getAIAssistHTML, attachAIAssistListeners };