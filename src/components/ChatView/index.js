const { ipcRenderer, clipboard, shell } = require('electron');
const { renderMarkdown } = require('../../utils/markdown.js');
const AgentRegistry = require('../AIAssistant/core/AgentRegistry.js');
const ToolRegistry = require('../AIAssistant/tools/ToolRegistry.js');
const DocsRegistry = require('../AIAssistant/core/DocsRegistry.js');

let currentFiles = [];
let streamListener = null;
let activeInspectorState = null;

function renderChatViewHTML(session, tabId) {
    const messages = session ? session.messages : [];
    const messagesHTML = messages.map(m => renderMessage(m)).join('');

    return `
        <div class="chat-view-container" id="chat-view-${tabId}">
            <div class="message-list" id="chat-scroller">
                ${messages.length === 0 ? renderEmptyState() : messagesHTML}
            </div>
            ${renderInputBar(session || {})}
            ${renderInspector(session)}
        </div>
    `;
}


function renderEmptyState() {
    return `
        <div class="empty-chat-state">
            <div class="empty-icon"><i data-lucide="message-square"></i></div>
            <h2>How can I help you?</h2>
            <p>Select an agent below and ask me anything.</p>
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
            return `<div class="file-chip"><i data-lucide="file"></i> <span class="file-name">${name}</span></div>`;
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

    // Collapsible User Messages
    if (msg.role === 'user') {
        if (content.length > 300 || (content.match(/\n/g) || []).length > 6) {
            contentHTML = `<div class="user-content-wrapper collapsed">${contentHTML}</div>`;
            readMoreHTML = `<button class="read-more-btn">Read more <i data-lucide="chevron-down" style="width:12px;height:12px;"></i></button>`;
        }
    }

    const roleClass = msg.role === 'user' ? 'user' : 'assistant';

    return `
        <div class="message-row ${roleClass}" id="msg-row-${msg.id}">
            ${msg.role === 'assistant' ? `<div class="avatar-gpt"><div class="peak-icon-masked" style="-webkit-mask-image: url('assets/Peak-icon.png'); mask-image: url('assets/Peak-icon.png');"></div></div>` : ''}
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
    const agents = AgentRegistry.getAgents();
    const currentAgentId = session.agentId || (agents.find(a => a.isDefault) || agents[0]).id;

    const fileChips = currentFiles.map((f, i) => `
        <div class="input-att-chip">
            <span class="att-name">${f.name}</span>
            <i data-lucide="x" class="att-remove" data-idx="${i}"></i>
        </div>
    `).join('');

    // Generate Tools Menu HTML
    const toolsMenuHTML = `
        <div id="tools-menu" class="tools-menu">
            <div class="menu-section-header">Tools</div>
            ${ToolRegistry.getTools().map(tool => `
                <div class="menu-item" data-action="insert-tool" data-tool="${tool.name}">
                    <i data-lucide="terminal-square"></i> ${tool.name}
                </div>
            `).join('')}
        </div>
    `;

    // Generate Docs Menu HTML
    const categories = {};
    DocsRegistry.forEach(doc => {
        if (!categories[doc.category]) categories[doc.category] = [];
        categories[doc.category].push(doc);
    });

    const docsMenuHTML = `
        <div id="docs-menu" class="tools-menu" style="left: 40px;">
            ${Object.keys(categories).map(cat => `
                <div class="menu-section-header">${cat}</div>
                ${categories[cat].map(doc => `
                    <div class="menu-item" data-action="open-docs" data-url="${doc.url}">
                        <i data-lucide="${doc.icon}"></i> ${doc.name}
                    </div>
                `).join('')}
            `).join('')}
        </div>
    `;

    return `
        <div class="chat-input-container">
            ${toolsMenuHTML}
            ${docsMenuHTML}
            <div class="chat-input-box">
                ${currentFiles.length > 0 ? `<div class="input-attachments">${fileChips}</div>` : ''}
                <textarea class="chat-textarea" id="chat-textarea" placeholder="Message..." rows="1"></textarea>
                <div class="chat-controls">
                    <div class="left-controls">
                         <button class="chat-icon-btn" id="btn-tools" title="Tools"><i data-lucide="sliders-horizontal"></i></button>
                         <button class="chat-icon-btn" id="btn-docs" title="Context"><i data-lucide="book"></i></button>
                         <button class="chat-icon-btn" id="btn-attach" title="Attach File"><i data-lucide="paperclip"></i></button>
                         <div class="model-selector-wrapper">
                            <select id="agent-select" class="model-select">
                                ${agents.map(a => `<option value="${a.id}" ${a.id === currentAgentId ? 'selected' : ''}>${a.name}</option>`).join('')}
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
    if (window.ipcRenderer) window.ipcRenderer.send('did-finish-content-swap');
    const sessionId = sessionData ? sessionData.id : null;
    if (!sessionId) return () => { };

    const root = container || document;
    const textarea = root.querySelector('#chat-textarea');
    const submitBtn = root.querySelector('#btn-submit');
    const scroller = root.querySelector('#chat-scroller');
    const viewContainer = root.querySelector('.chat-view-container');
    const agentSelect = root.querySelector('#agent-select');

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
                    if (msg && msg.reasoning) div.innerHTML = renderMarkdown(msg.reasoning);
                }
            }
            else {
                const bubble = lastRow.querySelector('.bubble.markdown-content');
                if (bubble) {
                    const session = window.tabManager.chatStore.get('sessions').find(s => s.id === sessionId);
                    const msg = session.messages[session.messages.length - 1];
                    if (msg) {
                        bubble.innerHTML = renderMarkdown(msg.content);
                        if (window.lucide) window.lucide.createIcons();
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

    if (scroller) requestAnimationFrame(() => scroller.scrollTop = scroller.scrollHeight);

    const adjustHeight = () => {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
        if (submitBtn) {
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
        const selectedAgentId = agentSelect ? agentSelect.value : null;

        if (submitBtn.classList.contains('stop')) {
            if (window.stopChatStream) window.stopChatStream();
            submitBtn.classList.remove('stop');
            submitBtn.innerHTML = '<i data-lucide="arrow-up"></i>';
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        if (content.length === 0 && currentFiles.length === 0) return;

        // Resolve Agent
        const agent = AgentRegistry.getAgent(selectedAgentId);

        // Update Session with Agent Info
        if (window.tabManager && window.tabManager.chatStore) {
            const sessions = window.tabManager.chatStore.get('sessions', []);
            const session = sessions.find(s => s.id === sessionId);
            if (session) {
                session.agentId = agent.id;
                session.systemPrompt = agent.systemPrompt;
                // We don't strictly need to save here because sendChatMessage will save, 
                // but we need to ensure the in-memory session object that sendChatMessage retrieves 
                // has the updated systemPrompt.
                // Since `sessions` is an array from `get('sessions')`, modifying `session` here 
                // modifies the object in that array. We just need to `set` it back to persist.
                window.tabManager.chatStore.set('sessions', sessions);
            }
        }

        if (window.sendChatMessage) {
            window.sendChatMessage(sessionId, content, agent.modelId, currentFiles.map(f => f.path));
        }

        currentFiles = [];
        textarea.value = '';
        adjustHeight();

        submitBtn.classList.add('stop');
        submitBtn.innerHTML = '<i data-lucide="square"></i>';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => { if (scroller) scroller.scrollTop = scroller.scrollHeight; }, 100);
    };

    if (submitBtn) submitBtn.addEventListener('click', submitAction);

    // Read More Toggle
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
                    if (window.lucide) window.lucide.createIcons();
                }
            }
        });
    }

    // Tools & Docs Menus
    const toolsBtn = root.querySelector('#btn-tools');
    const docsBtn = root.querySelector('#btn-docs');
    const toolsMenu = root.querySelector('#tools-menu');
    const docsMenu = root.querySelector('#docs-menu');

    if (toolsBtn && toolsMenu) {
        toolsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (docsMenu) docsMenu.classList.remove('visible');
            toolsMenu.classList.toggle('visible');
        });

        toolsMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (!item) return;
            const action = item.dataset.action;
            if (action === 'insert-tool') {
                const toolName = item.dataset.tool;
                textarea.value += `Use ${toolName} to `;
                textarea.focus();
                toolsMenu.classList.remove('visible');
                adjustHeight();
            }
        });
    }

    if (docsBtn && docsMenu) {
        docsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (toolsMenu) toolsMenu.classList.remove('visible');
            docsMenu.classList.toggle('visible');
        });

        docsMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.menu-item');
            if (!item) return;
            const action = item.dataset.action;
            if (action === 'open-docs') {
                const url = item.dataset.url;
                if (url) require('electron').shell.openExternal(url);
                docsMenu.classList.remove('visible');
            }
        });
    }

    // Close menus on outside click
    const closeMenus = (e) => {
        if (toolsMenu && !toolsMenu.contains(e.target) && !toolsBtn.contains(e.target)) {
            toolsMenu.classList.remove('visible');
        }
        if (docsMenu && !docsMenu.contains(e.target) && !docsBtn.contains(e.target)) {
            docsMenu.classList.remove('visible');
        }
    };
    document.addEventListener('click', closeMenus);

    // Attachments
    const attachBtn = root.querySelector('#btn-attach');
    if (attachBtn) {
        attachBtn.addEventListener('click', async () => {
            // Use generic file opener instead of just images
            const paths = await ipcRenderer.invoke('dialog:openFile');
            if (paths) {
                currentFiles.push({ name: paths.split(/[/\\]/).pop(), path: paths });
                if (window.tabManager) window.tabManager.renderView();
            }
        });
    }

    // Clear Chat
    const clearBtn = root.querySelector('#btn-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            activeInspectorState = 'clear';
            if (window.tabManager) window.tabManager.renderView();
        });
    }

    // Close Inspector
    const closeInspector = root.querySelectorAll('.inspector-close');
    closeInspector.forEach(btn => {
        btn.addEventListener('click', () => {
            activeInspectorState = null;
            if (window.tabManager) window.tabManager.renderView();
        });
    });

    // Confirm Clear
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

    // Copy Code
    const onCopy = (e) => {
        const copyBtn = e.target.closest('.copy-btn');
        if (copyBtn) {
            const codeBlock = copyBtn.closest('.chat-code-block');
            if (codeBlock) {
                const code = codeBlock.querySelector('code').innerText;
                clipboard.writeText(code);
                const originalHTML = copyBtn.innerHTML;
                copyBtn.innerHTML = '<i data-lucide="check"></i>';
                if (window.lucide) window.lucide.createIcons();
                setTimeout(() => {
                    copyBtn.innerHTML = originalHTML;
                    if (window.lucide) window.lucide.createIcons();
                }, 2000);
            }
        }
    };

    if (viewContainer) {
        viewContainer.addEventListener('click', onCopy);
    }

    // Agent Selection Change (Optional: Persist preference?)
    if (agentSelect) {
        agentSelect.addEventListener('change', (e) => {
            // We could update the session immediately if we wanted
            // But we do it on submit.
        });
    }

    return () => {
        if (viewContainer) viewContainer.removeEventListener('click', onCopy);
        if (streamListener) ipcRenderer.removeListener('llm-stream-data', streamListener);
    };
}

module.exports = { renderChatViewHTML, attachChatViewListeners };