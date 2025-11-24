// src/components/AIAssistant/AIAssistantLogic.js
const { ipcRenderer } = require('electron');
const path = require('path');
const { renderMarkdown } = require('../../utils/markdown.js');

const AI_ASSIST_SESSION_ID = -999; 
let assistStreamingMessageRef = null;
let assistLocalListener = null;

// CRITICAL: Force AI to use code blocks so the "Apply" button renders
const SYSTEM_PROMPT = `
You are an expert coding assistant inside a developer tool called Peak.
When asked to write, refactor, or fix code, YOU MUST OUTPUT THE CONTENT INSIDE MARKDOWN CODE BLOCKS (e.g., \`\`\`javascript ... \`\`\`).
Do not output plain text for file content. This is required for the 'Apply to Editor' feature to work.
If providing a full file replacement, provide the full code.
`;

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
    
    // Helper to escape HTML for the raw content storage
    const escapeRaw = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    if (assistContentArea && chatThread) {
        const finalMessageHtml = `
            <div class="term-chat-msg ai markdown-content" style="padding: 0; font-size: 13px; line-height: 1.6; width: 100%; overflow-wrap: anywhere; white-space: normal; background: transparent; color: var(--peak-primary); align-self: flex-start; margin-bottom: 12px;">
                ${renderMarkdown(finalContent)}
                
                <div class="raw-content" style="display:none;">${escapeRaw(finalContent)}</div>

                <div class="message-actions">
                    <button class="msg-action-btn copy-msg-btn" title="Copy Entire Message">
                        <i data-lucide="copy"></i> Copy
                    </button>
                    <button class="msg-action-btn insert-msg-btn" title="Insert Entire Message">
                        <i data-lucide="arrow-left-from-line"></i> Insert
                    </button>
                </div>
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
        
        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: fullPrompt }
        ];
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

module.exports = { attachAIAssistListeners };