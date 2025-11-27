// src/components/ChatView/index.js
const { ipcRenderer, clipboard } = require('electron');
const { renderMarkdown } = require('../../utils/markdown.js');

let currentFiles = []; 
let activeInspectorState = null;
let streamListener = null;

function renderChatViewHTML(sessionData) {
    const messages = (sessionData && sessionData.messages) ? sessionData.messages : [];
    const sessionId = sessionData ? sessionData.id : 'unknown';
    
    return `
        <div class="chat-view-container" data-session-id="${sessionId}">
            ${renderInspector(sessionData || {})}
            <div id="chat-scroller" class="chat-scroller">
                <div class="message-list">
                    ${messages.length === 0 ? renderEmptyState() : messages.map(renderMessage).join('')}
                </div>
            </div>
            ${renderInputBar(sessionData || {})}
        </div>
    `;
}

function renderEmptyState() {
    return `
        <div class="empty-chat-state">
            <div class="empty-icon"><i data-lucide="message-square"></i></div>
            <h2>How can I help you?</h2>
            <p>Select a model below and ask me anything.</p>
        </div>
    `;
}

function renderMessage(msg) {
    if (!msg) return '';
    const content = msg.content || '';
    const reasoning = msg.reasoning || '';
    
    if (!content && !reasoning && msg.role !== 'assistant') return '';

    let attachmentsHTML = '';
    if (msg.attachedFiles && msg.attachedFiles.length > 0) {
        attachmentsHTML = `
            <div class="attachment-grid">
                ${msg.attachedFiles.map(path => {
                    const name = path.split(/[/\\]/).pop();
                    return `<div class="file-chip"><i data-lucide="file"></i> ${name}</div>`;
                }).join('')}
            </div>`;
    }
    
    let reasoningHTML = '';
    if (msg.role === 'assistant') {
        const displayReasoning = reasoning ? 'block' : 'none';
        reasoningHTML = `
            <div class="reasoning-block" style="display:${displayReasoning}" id="reasoning-${msg.id}">
                <div class="reasoning-header" onclick="this.parentElement.classList.toggle('expanded')">
                    <i data-lucide="brain-circuit"></i> <span>Thinking Process</span> <i data-lucide="chevron-down" class="toggle-icon"></i>
                </div>
                <div class="reasoning-content">${renderMarkdown(reasoning)}</div>
            </div>
        `;
    }
    
    let contentHTML = renderMarkdown(content);
    let readMoreHTML = '';

    // --- FIX: Collapsible User Messages ---
    if (msg.role === 'user') {
        // Simple heuristic: if text length > 300 chars, collapse it
        // Or check line breaks. Length is usually safer for quick check.
        if (content.length > 300 || (content.match(/\n/g) || []).length > 6) {
            contentHTML = `<div class="user-content-wrapper collapsed">${contentHTML}</div>`;
            readMoreHTML = `<button class="read-more-btn">Read more <i data-lucide="chevron-down" style="width:12px;height:12px;"></i></button>`;
        }
    }

    const roleClass = msg.role === 'user' ? 'user' : 'assistant';

    return `
        <div class="message-row ${roleClass}" id="msg-row-${msg.id}">
            ${msg.role === 'assistant' ? `<div class="avatar-gpt"><i data-lucide="sparkles"></i></div>` : ''}
            <div class="bubble-container">
                ${attachmentsHTML}
                ${reasoningHTML}
                <div class="bubble markdown-content" id="msg-content-${msg.id}">
                    ${contentHTML}
                    ${readMoreHTML}
                </div>
            </div>
        </div>
    `;
}

function renderInputBar(session) {
    const models = window.AvailableModels || [{ id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', isPremium: false }];
    const currentModel = session.model || models[0].id;
    
    const fileChips = currentFiles.map((f, i) => `
        <div class="input-att-chip">
            <span class="att-name">${f.name}</span>
            <i data-lucide="x" class="att-remove" data-idx="${i}"></i>
        </div>
    `).join('');

    return `
        <div class="chat-input-container">
            <div class="chat-input-box">
                ${currentFiles.length > 0 ? `<div class="input-attachments">${fileChips}</div>` : ''}
                <textarea class="chat-textarea" id="chat-textarea" placeholder="Message..." rows="1"></textarea>
                <div class="chat-controls">
                    <div class="left-controls">
                         <button class="chat-icon-btn" id="btn-attach" title="Attach File"><i data-lucide="paperclip"></i></button>
                         <div class="model-selector-wrapper">
                            <select id="model-select" class="model-select">
                                ${models.map(m => `<option value="${m.id}" ${m.id === currentModel ? 'selected' : ''}>${m.name}</option>`).join('')}
                            </select>
                            <i data-lucide="chevron-down" class="select-arrow"></i>
                         </div>
                    </div>
                    <div class="right-controls">
                         <button class="chat-icon-btn" id="btn-clear" title="Clear Chat"><i data-lucide="trash-2"></i></button>
                         <button id="btn-submit" class="chat-submit-btn" disabled><i data-lucide="arrow-up"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderInspector(session) {
    if (!activeInspectorState) return '';
    if (activeInspectorState === 'clear') {
        return `
            <div class="modal-overlay">
                <div class="modal-box">
                    <h3>Clear Conversation?</h3>
                    <p>This cannot be undone.</p>
                    <div class="modal-actions">
                        <button class="modal-btn cancel inspector-close">Cancel</button>
                        <button class="modal-btn danger" id="btn-confirm-clear">Clear</button>
                    </div>
                </div>
            </div>
        `;
    }
    return '';
}

function attachChatViewListeners(sessionData, container) {
    if(window.ipcRenderer) window.ipcRenderer.send('did-finish-content-swap');
    const sessionId = sessionData ? sessionData.id : null;
    if (!sessionId) return () => {};

    const root = container || document;
    const textarea = root.querySelector('#chat-textarea');
    const submitBtn = root.querySelector('#btn-submit');
    const scroller = root.querySelector('#chat-scroller');
    const viewContainer = root.querySelector('.chat-view-container');

    // Stream Listener
    if (streamListener) ipcRenderer.removeListener('llm-stream-data', streamListener);
    
    streamListener = (event, id, response) => {
        if (id !== sessionId) return;
        const lastRow = root.querySelector('.message-list .message-row:last-child');
        if (!lastRow) return;

        if (response.type === 'data') {
            const content = response.content;
            
            if (content.includes('<think>') || content.includes('</think>')) {
                const reasonBlock = lastRow.querySelector('.reasoning-block');
                if (reasonBlock) {
                    reasonBlock.style.display = 'block';
                    const div = reasonBlock.querySelector('.reasoning-content');
                    const session = window.tabManager.chatStore.get('sessions').find(s => s.id === sessionId);
                    const msg = session.messages[session.messages.length - 1];
                    if(msg && msg.reasoning) div.innerHTML = renderMarkdown(msg.reasoning);
                }
            } 
            else {
                const bubble = lastRow.querySelector('.bubble.markdown-content');
                if (bubble) {
                    const session = window.tabManager.chatStore.get('sessions').find(s => s.id === sessionId);
                    const msg = session.messages[session.messages.length - 1];
                    if(msg) {
                        bubble.innerHTML = renderMarkdown(msg.content);
                        if(window.lucide) window.lucide.createIcons();
                    }
                }
            }

            if (scroller) {
                const isAtBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 150;
                if (isAtBottom) scroller.scrollTop = scroller.scrollHeight;
            }
        }
    };
    ipcRenderer.on('llm-stream-data', streamListener);

    if(scroller) requestAnimationFrame(() => scroller.scrollTop = scroller.scrollHeight);

    const adjustHeight = () => {
        if(!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        if(submitBtn) {
            const isValid = textarea.value.trim().length > 0 || currentFiles.length > 0;
            submitBtn.disabled = !isValid;
        }
    };
    
    if (textarea) {
        textarea.addEventListener('input', adjustHeight);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitAction(); }
        });
        setTimeout(() => textarea.focus(), 50);
    }

    const submitAction = () => {
        const content = textarea.value.trim();
        const modelSelect = root.querySelector('#model-select');
        const model = modelSelect ? modelSelect.value : null;
        
        if (submitBtn.classList.contains('stop')) {
            if (window.stopChatStream) window.stopChatStream();
            submitBtn.classList.remove('stop');
            submitBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
            if(window.lucide) window.lucide.createIcons();
            return;
        }

        if (content.length === 0 && currentFiles.length === 0) return;

        if (window.sendChatMessage) {
            window.sendChatMessage(sessionId, content, model, currentFiles.map(f => f.path));
        }
        
        currentFiles = []; 
        textarea.value = '';
        adjustHeight();
        
        submitBtn.classList.add('stop');
        submitBtn.innerHTML = '<i data-lucide="square"></i>'; 
        if(window.lucide) window.lucide.createIcons();
        setTimeout(() => { if(scroller) scroller.scrollTop = scroller.scrollHeight; }, 100);
    };
    
    if (submitBtn) submitBtn.addEventListener('click', submitAction);

    // --- READ MORE TOGGLE (Delegated) ---
    if (viewContainer) {
        viewContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.read-more-btn');
            if (btn) {
                e.stopPropagation();
                const wrapper = btn.previousElementSibling;
                if (wrapper && wrapper.classList.contains('user-content-wrapper')) {
                    const isCollapsed = wrapper.classList.contains('collapsed');
                    
                    if (isCollapsed) {
                        wrapper.classList.remove('collapsed');
                        btn.innerHTML = `Show less <i data-lucide="chevron-up" style="width:12px;height:12px;"></i>`;
                    } else {
                        wrapper.classList.add('collapsed');
                        btn.innerHTML = `Read more <i data-lucide="chevron-down" style="width:12px;height:12px;"></i>`;
                    }
                    if(window.lucide) window.lucide.createIcons();
                }
            }
        });
    }

    // ... (Attachments, Clear, Copy, Inspector logic) ...
    const attachBtn = root.querySelector('#btn-attach');
    if (attachBtn) {
        attachBtn.addEventListener('click', async () => {
            const paths = await ipcRenderer.invoke('select-image'); 
            if (paths) {
                currentFiles.push({ name: paths.split(/[/\\]/).pop(), path: paths });
                if (window.tabManager) window.tabManager.renderView(); 
            }
        });
    }

    const clearBtn = root.querySelector('#btn-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            activeInspectorState = 'clear';
            if (window.tabManager) window.tabManager.renderView();
        });
    }
    
    const closeInspector = root.querySelectorAll('.inspector-close');
    closeInspector.forEach(btn => {
        btn.addEventListener('click', () => {
            activeInspectorState = null;
            if (window.tabManager) window.tabManager.renderView();
        });
    });

    const confirmClear = root.querySelector('#btn-confirm-clear');
    if (confirmClear) {
        confirmClear.addEventListener('click', () => {
            if (window.tabManager && window.tabManager.chatStore) {
                 const sessions = window.tabManager.chatStore.get('sessions', []);
                 const session = sessions.find(s => s.id === sessionId);
                 if (session) {
                     session.messages = [];
                     window.tabManager.chatStore.set('sessions', sessions);
                 }
            }
            activeInspectorState = null;
            if (window.tabManager) window.tabManager.renderView();
        });
    }

    const onCopy = (e) => {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const codeBlock = copyBtn.closest('.chat-code-block');
            if (codeBlock) {
                const code = codeBlock.querySelector('code').innerText;
                clipboard.writeText(code);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i data-lucide="check"></i>';
                if(window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    if(window.lucide) window.lucide.createIcons();
                }, 2000);
            }
        }
    };

    if (viewContainer) {
        viewContainer.addEventListener('click', onCopy);
    }

    return () => {
        if (viewContainer) viewContainer.removeEventListener('click', onCopy);
        if (streamListener) ipcRenderer.removeListener('llm-stream-data', streamListener);
    };
}

module.exports = { renderChatViewHTML, attachChatViewListeners };