// src/components/Inspector/ai-assist.js
const { AvailableModels } = require('../../utils/enums.js');
const path = require('path');
const { ipcRenderer } = require('electron'); 
const { renderMarkdown } = require('../../utils/markdown.js'); // NEW

const AI_ASSIST_SESSION_ID = -999; 
let assistStreamingMessageRef = null;
let assistLocalListener = null;

function getAIAssistHTML(currentFileContent, currentFilePath, currentFileContentError) {
    const isError = !!currentFileContentError;
    const isContentEmpty = !currentFileContent || currentFileContent.length === 0;
    const isFileContextUsable = !!currentFilePath && !isError && !isContentEmpty;
    const fileName = currentFilePath ? path.basename(currentFilePath) : 'None';
    
    let initialMessageHTML;
    if (isError) {
        initialMessageHTML = `<div class="message-bubble assistant-message"><div class="message-icon"><i data-lucide="alert-triangle"></i></div><div class="message-content" style="color:var(--peak-accent);">Error: ${currentFileContentError}</div></div>`;
    } else if (isFileContextUsable) {
        initialMessageHTML = `<div class="message-bubble assistant-message"><div class="message-icon"><i data-lucide="sparkle"></i></div><div class="message-content">Hi! I'm here to help with <strong>${fileName}</strong>.</div></div>`;
    } else {
        initialMessageHTML = `<div class="message-bubble assistant-message"><div class="message-icon"><i data-lucide="sparkle"></i></div><div class="message-content">Select a non-empty file to enable context.</div></div>`;
    }

    return `
        <div class="chat-view-container" style="flex-grow: 1;">
            <div id="ai-assist-scroller" class="chat-scroller">
                <div class="message-list">
                    ${initialMessageHTML}
                    <div id="ai-assist-chat-thread"></div>
                    <div id="streaming-message-container-assist"></div>
                </div>
            </div>
            ${renderAssistInputBar(isFileContextUsable)}
        </div>
    `;
}

function renderAssistInputBar(isFileContextUsable) {
    const defaultModel = AvailableModels.find(m => m.id === 'openrouter/auto') || AvailableModels[0];
    const isDisabled = !isFileContextUsable;
    
    return `
        <div class="chat-input-bar" style="position: relative; bottom: 0; left: 50%; transform: translateX(-50%); max-width: 100%; border: none; box-shadow: none;">
            <textarea id="ai-assist-input-textarea" placeholder="${isDisabled ? 'Select a file...' : 'Ask about the file...'}" rows="1" ${isDisabled ? 'disabled' : ''}></textarea>
            <div class="chat-input-controls">
                <select id="ai-assist-model-select" class="control-pill" ${isDisabled ? 'disabled' : ''}>
                    ${AvailableModels.map(model => `<option value="${model.id}" ${model.id === defaultModel.id ? 'selected' : ''}>${model.name} ${model.isPremium ? '(🔒)' : ''}</option>`).join('')}
                </select>
                <button id="ai-assist-submit-button" class="action-button" disabled><i data-lucide="arrow-up"></i></button>
                <button id="ai-assist-stop-button" class="action-button" style="display: none;"><i data-lucide="square"></i></button>
            </div>
        </div>
    `;
}

function handleAssistStreamData(event, id, data) {
    if (id !== AI_ASSIST_SESSION_ID || !assistStreamingMessageRef) return;
    const assistContentArea = document.getElementById('streaming-message-container-assist');
    const assistScroller = document.getElementById('ai-assist-scroller');
    const assistMessageDiv = assistContentArea?.querySelector('.message-content');

    if (data.type === 'data' && assistMessageDiv) {
        assistStreamingMessageRef.content += data.content;
        // Use unified renderer
        assistMessageDiv.innerHTML = renderMarkdown(assistStreamingMessageRef.content);
        if(assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;
        if(window.lucide) window.lucide.createIcons(); // Refresh icons in code blocks
        
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
            <div class="message-bubble assistant-message" data-id="${AI_ASSIST_SESSION_ID}">
                <div class="message-icon"><i data-lucide="sparkle"></i></div>
                <div class="message-content markdown-content">
                    ${renderMarkdown(finalContent)}
                </div>
            </div>
        `;
        if (finalContent.trim() !== '') chatThread.innerHTML += finalMessageHtml;
        assistContentArea.innerHTML = ''; 
        window.lucide.createIcons();
    }
    
    const submitButton = document.getElementById('ai-assist-submit-button');
    const stopButton = document.getElementById('ai-assist-stop-button');
    if (submitButton) submitButton.style.display = 'flex';
    if (stopButton) stopButton.style.display = 'none';
    
    const textarea = document.getElementById('ai-assist-input-textarea');
    if (textarea) textarea.dispatchEvent(new Event('input')); 
    assistStreamingMessageRef = null;
}

function attachAIAssistListeners(currentFileContent, currentFilePath) {
    const { currentFileContentError } = window.getProjectFileContext();
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
        textarea.style.height = 'auto';
        textarea.style.height = `${textarea.scrollHeight}px`;
        submitButton.disabled = !isFileContextUsable || textarea.value.trim().length === 0 || !!assistStreamingMessageRef;
    };
    textarea.addEventListener('input', onInput);
    onInput(); 
    
    const onSubmit = (e) => {
        e?.preventDefault();
        const userPrompt = textarea.value;
        const model = modelSelect.value;
        if (!isFileContextUsable || userPrompt.trim().length === 0 || !!assistStreamingMessageRef) return;
        
        const fullPrompt = `CONTEXT: The user has an open file named "${path.basename(currentFilePath)}". Its content is:\n\n---\n${currentFileContent}\n---\n\nUSER QUESTION: ${userPrompt}`;
        
        textarea.value = '';
        onInput(); 
        submitButton.style.display = 'none';
        stopButton.style.display = 'flex';
        
        const chatThread = document.getElementById('ai-assist-chat-thread');
        chatThread.innerHTML += `
            <div class="message-bubble user-message" data-id="${Date.now()}">
                <div class="message-content markdown-content">
                    ${renderMarkdown(userPrompt)}
                </div>
            </div>
        `;
        
        assistStreamingMessageRef = { role: 'assistant', content: '' };
        const assistContentArea = document.getElementById('streaming-message-container-assist');
        if (assistContentArea) {
            assistContentArea.innerHTML = `
                <div class="message-bubble assistant-message" data-id="${Date.now()}">
                    <div class="message-icon"><i data-lucide="sparkle"></i></div>
                    <div class="message-content markdown-content"></div>
                </div>
            `;
            window.lucide.createIcons();
        }
        
        if(assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;
        const messages = [{ role: 'user', content: fullPrompt }];
        window.ipcRenderer.send('llm-stream-request', AI_ASSIST_SESSION_ID, model, messages);
    };

    submitButton.addEventListener('click', onSubmit);
    textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) onSubmit(e); });
    stopButton.addEventListener('click', () => stopAssistStream('User aborted stream.'));

    return () => {
        stopAssistStream(); 
        textarea.removeEventListener('input', onInput);
        submitButton.removeEventListener('click', onSubmit);
        if (assistLocalListener) ipcRenderer.removeListener('llm-stream-data', assistLocalListener);
    };
}

module.exports = { getAIAssistHTML, attachAIAssistListeners };