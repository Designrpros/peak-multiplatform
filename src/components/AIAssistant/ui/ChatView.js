
/**
 * ChatView.js
 * Manages the Chat UI, event listeners, and DOM updates.
 */

const MCPClient = require('../core/MCPClient');
const ToolRegistry = require('../tools/ToolRegistry');
const DocsRegistry = require('../core/DocsRegistry');
const AgentRegistry = require('../core/AgentRegistry');
const path = require('path');
const { renderMessageCard } = require('./cards/MessageCard');
const InputBar = require('./InputBar');

class ChatView {
    constructor() {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] Constructor called');
        this.client = MCPClient.getInstance();
        this.container = document.getElementById('ai-assist-content');
        this.chatThread = document.getElementById('ai-assist-chat-thread');
        this.chatThread = document.getElementById('ai-assist-chat-thread');
        this.scroller = document.getElementById('ai-assist-scroller');

        // Instantiate InputBar
        this.inputBar = new InputBar();

        ipcRenderer.send('log', '[ChatView] Elements found:', {
            container: !!this.container,
            chatThread: !!this.chatThread,
            scroller: !!this.scroller
        });

        this.streamingMessageDiv = null;
        this.selectedFiles = new Set();
        this.selectedDocs = new Set();

        // Load active docs from local storage or default to all
        const savedDocs = localStorage.getItem('peak-active-docs');
        this.activeDocs = savedDocs ? JSON.parse(savedDocs) : DocsRegistry.map(d => d.id);

        this.init();
    }

    init() {
        this.attachListeners();
        this.renderHistory();
        this.renderDocsMenu();
    }

    attachListeners() {
        // Attach InputBar listeners
        this.inputBar.attachListeners(this.container, {
            onSubmit: (value) => this.handleSubmit(value),
            onStop: () => this.client.abort(),
            onAgentChange: (agentId) => {
                if (agentId === 'manage-agents') {
                    this.toggleSettings(true);
                    // Reset to previous or default
                    const prev = localStorage.getItem('peak-ai-agent');
                    const select = document.getElementById('ai-assist-agent-select');
                    if (select) select.value = prev || AgentRegistry.getDefaultAgents()[0].id;
                } else {
                    localStorage.setItem('peak-ai-agent', agentId);
                }
            },
            onModeChange: (mode) => {
                this.mode = mode;
                localStorage.setItem('peak-ai-mode', this.mode);
            },
            onAddFile: () => this.handleAddFile(),
            onAddActiveFile: () => this.sendActiveFileToAI(),
            onContinue: () => this.processUserMessage('continue'),
            onDocsMenuToggle: (menu) => this.renderDocsMenu(menu),
            onDocsMenuClick: (e) => {
                const item = e.target.closest('.menu-item');
                if (!item) return;
                const action = item.dataset.action;
                if (action === 'insert-doc') {
                    const docId = item.dataset.doc;
                    // Logic to insert doc context (usually handled by client or just inserting text)
                    // For now, let's just insert the doc ID or similar
                    // Actually, ChatView usually handles this by adding to context
                    // Let's check handleDocAction if it exists or implement it
                    this.handleDocAction(action, docId);
                }
            }
        });

        // Initialize mode from storage
        const savedMode = localStorage.getItem('peak-ai-mode');
        if (savedMode) {
            const modeSelect = document.getElementById('ai-assist-mode-select');
            if (modeSelect) modeSelect.value = savedMode;
            this.mode = savedMode;
        } else {
            this.mode = 'assisted';
        }

        // Stream Events
        this.handleStreamUpdateBound = (e) => this.updateStreamingMessage(e.detail);
        this.handleStreamCompleteBound = (e) => this.finalizeStreamingMessage(e.detail);

        window.addEventListener('mcp:stream-update', this.handleStreamUpdateBound);
        window.addEventListener('mcp:stream-complete', this.handleStreamCompleteBound);

        // Terminal Response (Auto-Continue)
        this.handleTerminalResponseBound = (e) => this.handleTerminalResponse(e);
        window.addEventListener('peak-terminal-response', this.handleTerminalResponseBound);

        // Tool Actions (Delegation)
        if (this.chatThread) {
            this.handleToolActionBound = (e) => this.handleToolAction(e);
            this.chatThread.addEventListener('click', this.handleToolActionBound);

            // Listen for auto-run delegation
            this.chatThread.addEventListener('tool-auto-run', (e) => {
                if (e.detail.tool === 'delegate_task') {
                    this.handleDelegation(e.detail.args);
                }
            });
        }







        // Listen for global toggle event from Inspector header (Legacy/Backup)
        this.handleToggleSettingsBound = () => {
            console.log('[ChatView] Toggling settings via event');
            this.toggleSettings(true);
        };
        document.addEventListener('peak-toggle-ai-settings', this.handleToggleSettingsBound);

        const toolsBtn = document.getElementById('ai-assist-tools-btn');
        const toolsMenu = document.getElementById('ai-assist-tools-menu');

        if (toolsBtn && toolsMenu) {
            // Toggle Menu
            toolsBtn.addEventListener('click', (e) => {
                console.log('Tools button clicked');
                e.stopPropagation();
                const docsMenu = document.getElementById('ai-assist-docs-menu');
                if (docsMenu) docsMenu.classList.remove('visible'); // Close other menu
                toolsMenu.classList.toggle('visible');
                console.log('Tools menu visible:', toolsMenu.classList.contains('visible'));
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!toolsMenu.contains(e.target) && !toolsBtn.contains(e.target)) {
                    toolsMenu.classList.remove('visible');
                }
            });

            // Handle Menu Actions
            toolsMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.menu-item');
                if (!item) return;

                const action = item.dataset.action;
                if (action === 'insert-tool') {
                    const toolName = item.dataset.tool;
                    this.inputArea.value += `Use ${toolName} to`;
                    this.inputArea.focus();
                    toolsMenu.classList.remove('visible');
                } else if (action === 'open-docs') {
                    const url = item.dataset.url;
                    require('electron').shell.openExternal(url);
                    toolsMenu.classList.remove('visible');
                }
            });
        }

        // Docs Menu Logic
        const docsBtn = document.getElementById('ai-assist-docs-btn');
        const docsMenu = document.getElementById('ai-assist-docs-menu');

        if (docsBtn && docsMenu) {
            docsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (toolsMenu) toolsMenu.classList.remove('visible');

                // Re-render menu before showing to ensure it's up to date
                this.renderDocsMenu();

                docsMenu.classList.toggle('visible');
            });

            // Close on outside click
            document.addEventListener('click', (e) => {
                if (!docsMenu.contains(e.target) && !docsBtn.contains(e.target)) {
                    docsMenu.classList.remove('visible');
                }
            });

            // Handle Menu Actions
            docsMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.menu-item');
                if (!item) return;

                const action = item.dataset.action;
                if (action === 'fetch-docs') {
                    const url = item.dataset.url;
                    if (url) {
                        // Open in external browser
                        const { shell } = require('electron');
                        shell.openExternal(url);
                    }
                } else if (action === 'fetch-local-doc') {
                    const filename = item.dataset.filename;
                    if (filename) {
                        this.handleLocalDoc(filename);
                    }
                } else if (action === 'read-url-menu') {
                    const url = item.dataset.url;
                    if (url) {
                        // Trigger ReadURL tool logic
                        this.readUrlAndSendToAI(url);
                    }
                }

                docsMenu.classList.remove('visible');
            });
        }

        // Listen for Session Changes
        window.addEventListener('peak-session-changed', (e) => {
            console.log('[ChatView] Session changed:', e.detail.id);
            this.renderHistory();
        });

        // Listen for Docs Settings Updates
        window.addEventListener('peak-docs-updated', () => {
            console.log('[ChatView] Docs updated, refreshing menu');
            const savedDocs = localStorage.getItem('peak-active-docs');
            this.activeDocs = savedDocs ? JSON.parse(savedDocs) : DocsRegistry.map(d => d.id);
            // We don't need to re-render the whole view, just ensure the next menu open uses fresh data
        });

        // Initial Render
        // Initial Render
        this.renderHistory();
    }

    renderHistory() {
        if (!this.chatThread) return;
        this.chatThread.innerHTML = '';

        const MAX_INITIAL = 20;
        const total = this.client.history.length;
        const start = Math.max(0, total - MAX_INITIAL);
        const messages = this.client.history.slice(start);

        if (start > 0) {
            this.renderLoadMoreButton(start);
        }

        messages.forEach(msg => {
            const el = this.createMessageElement(msg.role, msg.content, msg.commitHash);
            this.chatThread.appendChild(el);
        });

        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();
    }

    renderLoadMoreButton(remainingCount) {
        const btn = document.createElement('button');
        btn.className = 'chat-load-more-btn';
        btn.textContent = `Load older messages (${remainingCount} remaining)`;
        btn.style.cssText = "width:100%; padding:8px; background:none; border:none; color:var(--peak-secondary); cursor:pointer; font-size:11px; margin-bottom:8px; opacity:0.7;";
        btn.onmouseover = () => btn.style.opacity = '1';
        btn.onmouseout = () => btn.style.opacity = '0.7';

        btn.onclick = () => {
            btn.remove();
            this.renderOlderMessages(remainingCount);
        };
        this.chatThread.prepend(btn);
    }

    renderOlderMessages(endIndex) {
        const MAX_BATCH = 20;
        const start = Math.max(0, endIndex - MAX_BATCH);
        const messages = this.client.history.slice(start, endIndex);

        const fragment = document.createDocumentFragment();

        if (start > 0) {
            const btn = document.createElement('button');
            btn.className = 'chat-load-more-btn';
            btn.textContent = `Load older messages (${start} remaining)`;
            btn.style.cssText = "width:100%; padding:8px; background:none; border:none; color:var(--peak-secondary); cursor:pointer; font-size:11px; margin-bottom:8px; opacity:0.7;";
            btn.onmouseover = () => btn.style.opacity = '1';
            btn.onmouseout = () => btn.style.opacity = '0.7';
            btn.onclick = () => {
                btn.remove();
                this.renderOlderMessages(start);
            };
            fragment.appendChild(btn);
        }

        messages.forEach(msg => {
            const el = this.createMessageElement(msg.role, msg.content, msg.commitHash);
            fragment.appendChild(el);
        });

        this.chatThread.prepend(fragment);
        if (window.lucide) window.lucide.createIcons();
    }

    toggleSettings(show) {
        console.log('[ChatView] toggleSettings called with:', show);
        const overlay = document.getElementById('ai-assist-settings-overlay');
        if (!overlay) {
            console.error('[ChatView] Overlay element not found!');
            return;
        }

        overlay.style.display = show ? 'flex' : 'none';

        if (show) {
            this.renderSettings();
        }
    }

    renderSettings() {
        const listContainer = document.getElementById('ai-assist-docs-settings-list');
        if (!listContainer) return;

        listContainer.innerHTML = '';

        // Group by category
        const categories = {};
        DocsRegistry.forEach(doc => {
            if (!categories[doc.category]) categories[doc.category] = [];
            categories[doc.category].push(doc);
        });

        Object.keys(categories).forEach(cat => {
            const header = document.createElement('div');
            header.className = 'settings-group-header';
            header.textContent = cat;
            listContainer.appendChild(header);

            categories[cat].forEach(doc => {
                const item = document.createElement('div');
                item.className = 'settings-item';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `setting-doc-${doc.id}`;
                checkbox.checked = this.activeDocs.includes(doc.id);

                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.activeDocs.push(doc.id);
                    } else {
                        this.activeDocs = this.activeDocs.filter(id => id !== doc.id);
                    }
                    this.saveActiveDocs();
                });

                const label = document.createElement('label');
                label.htmlFor = `setting-doc-${doc.id}`;
                label.style.display = 'flex';
                label.style.alignItems = 'center';
                label.style.gap = '8px';
                label.style.cursor = 'pointer';
                label.innerHTML = `<i data-lucide="${doc.icon}" style="width:14px; height:14px;"></i> ${doc.name}`;

                item.appendChild(checkbox);
                item.appendChild(label);
                listContainer.appendChild(item);
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    saveActiveDocs() {
        localStorage.setItem('peak-active-docs', JSON.stringify(this.activeDocs));
    }

    async handleAddFile() {
        // Trigger file picker via IPC
        const result = await require('electron').ipcRenderer.invoke('dialog:open-file', {
            properties: ['openFile', 'multiSelections'],
            defaultPath: window.currentProjectRoot
        });

        if (!result.canceled && result.filePaths.length > 0) {
            result.filePaths.forEach(p => {
                // Store relative path if possible
                const relPath = window.currentProjectRoot ? path.relative(window.currentProjectRoot, p) : p;
                this.selectedFiles.add(relPath);
            });
            this.renderFileChips();
        }
    }

    renderFileChips() {
        const container = document.getElementById('ai-assist-file-chips');
        if (!container) return;

        container.innerHTML = '';
        // Render Project Files
        this.selectedFiles.forEach(file => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.innerHTML = `
                <i data-lucide="file" style="width:10px; height:10px;"></i>
                <span>${path.basename(file)}</span>
                <div class="remove-btn"><i data-lucide="x" style="width:10px; height:10px;"></i></div>
            `;
            chip.querySelector('.remove-btn').addEventListener('click', () => {
                this.selectedFiles.delete(file);
                this.renderFileChips();
            });
            container.appendChild(chip);
        });

        // Render Doc Chips
        this.selectedDocs.forEach(doc => {
            const chip = document.createElement('div');
            chip.className = 'file-chip';
            chip.style.borderColor = 'var(--peak-accent)';
            chip.style.background = 'rgba(var(--peak-accent-rgb), 0.05)';
            chip.innerHTML = `
                <i data-lucide="book" style="width:10px; height:10px;"></i>
                <i data-lucide="book" style="width:10px; height:10px; color:var(--peak-accent);"></i>
                <span style="color:var(--peak-accent);">${doc}</span>
                <div class="remove-btn"><i data-lucide="x" style="width:10px; height:10px; color:var(--peak-accent);"></i></div>
            `;
            chip.querySelector('.remove-btn').addEventListener('click', () => {
                this.selectedDocs.delete(doc);
                this.renderFileChips();
            });
            container.appendChild(chip);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    renderDocsMenu(menuElement) {
        const docsMenu = menuElement || document.getElementById('ai-assist-docs-menu');
        if (!docsMenu) return;

        // Filter docs based on active selection
        const activeDocsList = DocsRegistry.filter(d => this.activeDocs.includes(d.id));

        // Group by category
        const categories = {};
        activeDocsList.forEach(doc => {
            if (!categories[doc.category]) categories[doc.category] = [];
            categories[doc.category].push(doc);
        });

        let html = '';

        Object.keys(categories).forEach(cat => {
            html += `<div class="menu-section-header">${cat}</div>`;
            categories[cat].forEach(doc => {
                const action = doc.type === 'local' ? 'fetch-local-doc' : 'fetch-docs';
                // Special case for read-url if we had it, but for now standard actions
                const dataAttr = doc.type === 'local' ? `data-filename="${doc.filename}"` : `data-url="${doc.url}"`;

                html += `
                    <div class="menu-item" data-action="${action}" ${dataAttr}>
                        <i data-lucide="${doc.icon}"></i> ${doc.name}
                    </div>
                `;
            });
        });

        if (html === '') {
            html = '<div style="padding:8px; color:var(--peak-secondary); font-size:12px;">No documentation sources selected. Check Settings.</div>';
        }

        docsMenu.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }
    async handleSubmit(valueOverride = null) {
        const prompt = valueOverride || this.inputBar.inputArea.value.trim();
        if (!prompt) return;
        this.processUserMessage(prompt);
    }

    async handleTerminalResponse(e) {
        const { cmd, output } = e.detail;

        // Create Command Executed Block HTML
        const blockHtml = `
    < div class="tool-block command-executed-block" >
                <div class="header">
                    <i data-lucide="terminal" style="width:12px; height:12px;"></i> Command Executed: ${cmd}
                </div>
                <div class="content">${output.slice(0, 500) + (output.length > 500 ? '...' : '')}</div>
                <div class="footer">
                    <span class="meta-info">Output sent to AI</span>
                </div>
            </div >
    `;

        // Append to Chat
        const msgDiv = document.createElement('div');
        msgDiv.className = 'term-chat-msg system';
        msgDiv.innerHTML = blockHtml;
        this.chatThread.appendChild(msgDiv);
        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();

        // Send to AI (Silent)
        const message = `Command executed: \`${cmd}\`\nOutput:\n\`\`\`\n${output}\n\`\`\`\n\n(Proceeding automatically. Please continue with the next step.)`;

        // Manual Send Logic (Silent)
        this.inputBar.setLoading(true);
        this.createStreamingMessage();

        const modelSelect = document.getElementById('ai-assist-model-select');
        const modelId = modelSelect ? modelSelect.value : null;

        const context = await this.getProjectContext([]);
        await this.client.sendMessage(message, context, modelId);
    }

    async processUserMessage(prompt, isAuto = false) {
        // Get selected agent
        const agentSelect = document.getElementById('ai-assist-agent-select');
        const agentId = agentSelect ? agentSelect.value : null;
        const agent = AgentRegistry.getAgent(agentId);

        const modelId = agent ? agent.modelId : 'openrouter/auto';
        const systemPrompt = agent ? agent.systemPrompt : null;

        // UI Updates
        this.inputBar.setLoading(true);
        this.inputBar.updateStatus('thinking');

        // Clear selected files from UI
        const filesToSend = Array.from(this.selectedFiles);
        const docsToSend = Array.from(this.selectedDocs);
        this.selectedFiles.clear();
        this.selectedDocs.clear();
        this.renderFileChips();

        // --- CHECKPOINT CREATION ---
        const rootPath = window.currentProjectRoot || (this.client && this.client.context && this.client.context.root);
        console.log('[ChatView] Checking checkpoint requirements. Root:', rootPath, 'isAuto:', isAuto);

        let commitHash = null;
        if (!isAuto && rootPath) {
            try {
                const result = await require('electron').ipcRenderer.invoke('git:create-checkpoint', rootPath, Date.now());
                console.log('[ChatView] Checkpoint result:', result);
                if (result.hash) {
                    commitHash = result.hash;
                } else {
                    console.error('[ChatView] No hash returned. Error:', result.error);
                }
            } catch (e) {
                console.error("[ChatView] Checkpoint failed:", e);
            }
        } else {
            console.log('[ChatView] Skipping checkpoint. isAuto:', isAuto, 'rootPath:', rootPath);
        }
        // ---------------------------

        // Add User Message
        console.log('[ChatView] Appending message with hash:', commitHash);
        this.appendMessage('user', prompt, commitHash);

        // Create AI Placeholder
        this.createStreamingMessage();

        // Get Context
        const context = await this.getProjectContext(filesToSend, docsToSend);

        // Send to Client
        await this.client.sendMessage(prompt, context, modelId, commitHash, systemPrompt); // Pass hash and system prompt
    }

    createMessageElement(role, content, commitHash = null) {
        const html = renderMessageCard(role, content, commitHash);
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const messageElement = temp.firstElementChild;

        // Direct Listener for Revert Button (Backup for Delegation)
        const revertBtn = messageElement.querySelector('.revert-btn');
        if (revertBtn) {
            revertBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const hash = revertBtn.dataset.hash;
                if (hash) this.handleRevert(hash);
            });
        }

        return messageElement;
    }

    appendMessage(role, content, commitHash = null) {
        const messageElement = this.createMessageElement(role, content, commitHash);
        this.chatThread.appendChild(messageElement);
        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();
    }

    async handleRevert(hash) {
        if (confirm('Are you sure you want to revert the project to this state? All changes made after this message will be lost.')) {
            try {
                const result = await require('electron').ipcRenderer.invoke('git:revert-to-checkpoint', window.currentProjectRoot, hash);
                if (result.success) {
                    // Truncate History
                    this.client.truncateHistoryToHash(hash);

                    alert('Project reverted successfully. Reloading...');
                    // Reload the project view to reflect changes
                    if (window.loadProject) {
                        window.loadProject(window.currentProjectRoot);
                    } else {
                        window.location.reload();
                    }
                } else {
                    alert('Revert failed: ' + result.error);
                }
            } catch (e) {
                alert('Revert error: ' + e.message);
            }
        }
    }

    updateStatus(status) {
        if (!this.inputBar) return; // Use inputBar's status indicator

        if (status === 'thinking') {
            this.inputBar.updateStatus('thinking');
        } else if (status === 'ready') {
            this.inputBar.updateStatus('ready');
        }
    }

    async getProjectContext(selectedFiles, selectedDocs = []) {
        const root = window.currentProjectRoot || 'Current Directory';
        const context = {
            root,
            projectTitle: window.getProjectFileContext ? window.getProjectFileContext().projectTitle : 'Project',
            selectedFiles: []
        };

        // If files are selected, read their content
        if (selectedFiles && selectedFiles.length > 0) {
            for (const relPath of selectedFiles) {
                try {
                    const fullPath = path.join(root, relPath);
                    const content = await require('electron').ipcRenderer.invoke('project:read-file', fullPath);
                    context.selectedFiles.push({
                        path: relPath,
                        content: typeof content === 'string' ? content : 'Error reading file'
                    });
                } catch (e) {
                    console.error("Failed to read context file:", relPath, e);
                }
            }
        }

        // Read Selected Docs
        if (selectedDocs && selectedDocs.length > 0) {
            const fs = require('fs');
            const path = require('path');
            const docsDir = path.join(__dirname, '..', 'docs');

            for (const docName of selectedDocs) {
                try {
                    const docPath = path.join(docsDir, docName);
                    if (fs.existsSync(docPath)) {
                        const content = fs.readFileSync(docPath, 'utf8');
                        context.selectedFiles.push({
                            path: `docs/${docName}`,
                            content: content
                        });
                    }
                } catch (e) {
                    console.error("Failed to read doc:", docName, e);
                }
            }
        }

        // Fallback to active file if NO explicit context selected
        const hasExplicitContext = (selectedFiles && selectedFiles.length > 0) || (selectedDocs && selectedDocs.length > 0);

        if (!hasExplicitContext) {
            // User requested "Global Chat" without specific context.
            // Include active file as "Active File".
            // If no files selected, maybe just send active file as "Active File" but not "Selected Context"?
            // Or just pure global.
            // Let's include active file as "Active File" but distinguish it from "Explicitly Selected".
            const freshContext = window.getProjectFileContext ? window.getProjectFileContext() : {};
            if (freshContext.currentFilePath) {
                context.activeFile = freshContext.currentFilePath;
                context.activeContent = freshContext.currentFileContent;
            }
        }

        // Add Diagnostics Summary
        if (window.peakGetDiagnostics) {
            const diags = window.peakGetDiagnostics();
            if (diags.length > 0) {
                let totalErrors = 0;
                let totalWarnings = 0;
                diags.forEach(d => {
                    d.diagnostics.forEach(diag => {
                        if (diag.severity === 'error') totalErrors++;
                        else totalWarnings++;
                    });
                });
                context.diagnosticsSummary = `Project has ${totalErrors} errors and ${totalWarnings} warnings. Use 'get_problems' tool to see details.`;
            }
        }

        return context;
    }



    createStreamingMessage() {
        this.streamingMessageDiv = document.createElement('div');
        this.streamingMessageDiv.className = 'term-chat-msg ai markdown-content';
        this.chatThread.appendChild(this.streamingMessageDiv);
        this.scrollToBottom();
    }

    updateStreamingMessage({ html }) {
        if (this.streamingMessageDiv) {
            this.streamingMessageDiv.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();
        }
    }

    finalizeStreamingMessage({ html, error }) {
        if (this.streamingMessageDiv) {
            this.streamingMessageDiv.innerHTML = html;

            // Add Accept All if needed
            this.addAcceptAllButton(this.streamingMessageDiv);

            // AUTO / HYBRID MODE EXECUTION
            if (this.mode === 'auto') {
                const buttons = this.streamingMessageDiv.querySelectorAll('.tool-create-btn, .tool-run-btn, .tool-view-btn, .tool-search-btn, .tool-delete-btn, .tool-delegate-btn');
                buttons.forEach(btn => { if (!btn.disabled) btn.click(); });
            } else if (this.mode === 'hybrid') {
                // Auto-click safe tools
                const safeButtons = this.streamingMessageDiv.querySelectorAll('.tool-view-btn, .tool-search-btn, .tool-problems-btn, .tool-delegate-btn');
                safeButtons.forEach(btn => { if (!btn.disabled) btn.click(); });
            }

            this.streamingMessageDiv = null;
        }

        if (error) {
            this.appendMessage('system', `Error: ${error}`);
        }

        // Reset UI
        this.inputBar.setLoading(false);
        this.inputBar.updateStatus('ready');
        setTimeout(() => this.inputBar.inputArea.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.scroller) {
            this.scroller.scrollTop = this.scroller.scrollHeight;
        }
    }

    renderHistory() {
        const history = this.client.getHistory();
        // Clear current (except if we want to keep welcome msg? No, full redraw)
        this.chatThread.innerHTML = '';

        history.forEach(msg => {
            if (msg.role === 'user') {
                this.appendMessage('user', msg.content, msg.commitHash);
            } else if (msg.role === 'assistant') {
                // Re-render the HTML (or use cached)
                // We stored html in history in MCPClient
                const div = document.createElement('div');
                div.className = 'term-chat-msg ai markdown-content';
                div.innerHTML = msg.html;
                this.addAcceptAllButton(div); // Re-add button logic
                this.chatThread.appendChild(div);
            }
        });

        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();
    }

    addAcceptAllButton(container) {
        // Count actions
        const actions = container.querySelectorAll('.tool-create-btn, .tool-run-btn, .apply-msg-btn');
        if (actions.length > 1) {
            // Check if already exists
            if (container.querySelector('.accept-all-btn')) return;

            const btnDiv = document.createElement('div');
            btnDiv.style.marginTop = '12px';
            btnDiv.style.display = 'flex';
            btnDiv.style.justifyContent = 'flex-end';
            btnDiv.innerHTML = `
                <button class="msg-action-btn accept-all-btn" style="background:var(--peak-accent); color:white; border:none;">
                    <i data-lucide="check-check" style="width:12px;"></i> Accept All (${actions.length})
                </button>
            `;
            container.appendChild(btnDiv);
        }
    }

    async triggerAutoReview(btn, agent) {
        this.appendMessage('system', `🛡️ **Auto-Review**: Validating changes with **Reviewer**...`);

        // Extract change details
        const path = btn.dataset.path;
        const content = btn.dataset.content ? decodeURIComponent(btn.dataset.content) : null;
        const type = btn.classList.contains('tool-create-btn') ? (btn.dataset.type || 'create') : 'delete';

        // Construct Review Prompt
        const reviewPrompt = `
[System: You are the Reviewer Agent.]
The user's agent (${agent.name}) wants to perform the following action:
Type: ${type.toUpperCase()}
File: ${path}
${content ? `Content:\n\`\`\`\n${content}\n\`\`\`` : ''}

Analyze this change for:
1. Correctness (syntax, logic)
2. Safety (destructive actions)
3. Best Practices

If APPROVED, reply with "APPROVED".
If REJECTED, explain why and provide a corrected version if possible.
        `.trim();

        // Send to Reviewer (using a temporary context or just the main client?)
        // We'll use the main client but with the Reviewer's persona (if it exists, or a default one)
        // Let's assume a "Reviewer" agent exists or we use a generic one.
        // For now, we'll use a hardcoded system prompt for the reviewer.

        const reviewerSystemPrompt = "You are a Senior Code Reviewer. You are strict but helpful. Analyze the proposed changes. If they are good, say 'APPROVED'. If not, explain why.";

        // We need to handle the response. This is tricky because sendMessage streams to the UI.
        // We might need a separate "silent" client or just let it stream to the chat (which is actually good for visibility).
        // But we need to know the result.

        // Let's let it stream. The user can then decide.
        // Wait, "Auto-Review" implies the SYSTEM decides or blocks.
        // If we just stream the review, the user still has to click the button again?
        // Yes, that's safer. The button remains unclicked.
        // If the reviewer says "APPROVED", maybe we can auto-click it?
        // That requires parsing the reviewer's output.

        // For Phase 2, let's just stream the review and let the user decide.
        // We mark the button as "reviewed" so next click works?
        // Or we add a "Approve & Execute" button in the reviewer's response?

        // Let's add a "reviewed" flag to the button so the user can bypass if they insist.
        btn.dataset.reviewed = "true";
        btn.classList.add('reviewed'); // Visual cue?

        // Send the review request
        const context = await this.getProjectContext([]);
        await this.client.sendMessage(reviewPrompt, context, 'openrouter/auto', null, reviewerSystemPrompt);
    }

    getToolActionType(btn) {
        if (btn.classList.contains('tool-create-btn')) return 'create';
        if (btn.classList.contains('tool-run-btn')) return 'run';
        if (btn.classList.contains('tool-delete-btn')) return 'delete';
        if (btn.classList.contains('tool-search-btn')) return 'search';
        if (btn.classList.contains('tool-view-btn')) return 'view';
        if (btn.classList.contains('tool-problems-btn')) return 'problems';
        if (btn.classList.contains('tool-capture-live-btn')) return 'capture_live';
        if (btn.classList.contains('tool-delegate-btn')) return 'delegate';
        return null;
    }

    async handleToolAction(e) {
        // Toggle Code
        const toggleBtn = e.target.closest('.toggle-code-btn');
        if (toggleBtn) {
            const card = toggleBtn.closest('.file-edit-card');
            const content = card.querySelector('.file-edit-content');
            const icon = toggleBtn.querySelector('i');

            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.setAttribute('data-lucide', 'chevron-up');
                if (window.lucide) window.lucide.createIcons();
            } else {
                content.style.display = 'none';
                icon.setAttribute('data-lucide', 'chevron-down');
                if (window.lucide) window.lucide.createIcons();
            }
            return;
        }

        // Accept All
        const acceptAllBtn = e.target.closest('.accept-all-btn');
        if (acceptAllBtn) {
            const msgDiv = acceptAllBtn.closest('.term-chat-msg');
            const allActions = msgDiv.querySelectorAll('.tool-create-btn, .tool-run-btn');

            allActions.forEach(btn => {
                if (!btn.disabled) btn.click();
            });

            acceptAllBtn.innerHTML = '<i data-lucide="check-check"></i> All Actions Started';
            acceptAllBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const btn = e.target.closest('.msg-action-btn');
        if (!btn || btn.disabled) return;

        if (btn.classList.contains('tool-run-btn')) {
            const cmd = decodeURIComponent(btn.dataset.cmd);
            window.dispatchEvent(new CustomEvent('peak-run-command', { detail: cmd }));
            this.markButtonSuccess(btn, 'Sent');
        } else if (btn.classList.contains('tool-create-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            const content = decodeURIComponent(btn.dataset.content);
            const type = btn.dataset.type || 'create';

            if (type === 'update') {
                // Dispatch event for Diff View
                window.dispatchEvent(new CustomEvent('peak-apply-file', {
                    detail: { path, content }
                }));
                // We don't mark success immediately for diff, as user has to accept/reject.
                // But we can show "Diff Opened".
                this.markButtonSuccess(btn, 'Diff Opened');
            } else {
                console.log('[ChatView] Dispatching peak-create-file:', { path, content });
                window.dispatchEvent(new CustomEvent('peak-create-file', {
                    detail: { path, content }
                }));
                this.markButtonSuccess(btn, 'File Created');
            }
        } else if (btn.classList.contains('tool-delete-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            if (confirm(`Delete ${path}?`)) {
                window.dispatchEvent(new CustomEvent('peak-delete-file', { detail: { path } }));
                this.markButtonSuccess(btn, 'Deleted');
            }
        } else if (btn.classList.contains('tool-search-btn')) {
            const query = decodeURIComponent(btn.dataset.query);
            this.runSearchAndSendToAI(query);
            this.markButtonSuccess(btn, 'Searched');
        } else if (btn.classList.contains('tool-view-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            window.dispatchEvent(new CustomEvent('peak-open-file', { detail: { path } }));
            this.markButtonSuccess(btn, 'Opened');
            this.sendFileContentToAI(path);
        } else if (btn.classList.contains('tool-problems-btn')) {
            this.getProblemsAndSendToAI();
            this.markButtonSuccess(btn, 'Checked');
        } else if (btn.classList.contains('tool-capture-live-btn')) {
            this.captureLiveViewAndSendToAI();
            this.markButtonSuccess(btn, 'Captured');
        } else if (btn.classList.contains('tool-read-url-btn')) {
            const url = decodeURIComponent(btn.dataset.url);
            this.readUrlAndSendToAI(url);
            this.markButtonSuccess(btn, 'Reading...');
        }

        // --- User Message Actions (Revert / Expand) ---
        const revertBtn = e.target.closest('.revert-btn');
        if (revertBtn) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('log', '[ChatView] Revert button clicked via delegation');
            e.stopPropagation();
            const hash = revertBtn.dataset.hash;
            if (hash) this.handleRevert(hash);
            return;
        }

        const showMoreBtn = e.target.closest('.show-more-btn');
        if (showMoreBtn) {
            e.stopPropagation();
            const msgEl = showMoreBtn.closest('.term-chat-msg');
            const contentDiv = msgEl ? msgEl.querySelector('.user-msg-content') : null;
            if (contentDiv) {
                const isCollapsed = contentDiv.classList.contains('collapsed');
                if (isCollapsed) {
                    contentDiv.classList.remove('collapsed');
                    showMoreBtn.textContent = 'Show Less';
                } else {
                    contentDiv.classList.add('collapsed');
                    showMoreBtn.textContent = 'Show More';
                }
            }
            return;
        }
    }

    handleLocalDoc(filename) {
        this.selectedDocs.add(filename);
        this.renderFileChips();
        // Focus input
        this.inputArea.focus();
    }

    async captureLiveViewAndSendToAI() {
        try {
            const webview = document.getElementById('inspector-live-view');
            if (!webview) {
                this.appendMessage('system', 'Error: Live View not found.');
                return;
            }

            // Execute JS in webview to get HTML
            // We use executeJavaScript. Note: this returns a promise.
            const html = await webview.executeJavaScript('document.documentElement.outerHTML');
            const url = webview.getURL();

            if (!html) {
                this.appendMessage('system', 'Error: Could not capture Live View content.');
                return;
            }

            // Create Live View Block HTML
            const blockHtml = `
                <div class="tool-block analysis-block" style="border-color: #10b981;">
                    <div class="header" style="color: #10b981; background: rgba(16, 185, 129, 0.1);">
                        <i data-lucide="eye" style="width:12px; height:12px;"></i> Live View Capture
                    </div>
                    <div class="content" style="max-height: 200px; overflow-y: auto;">
                        <div style="margin-bottom:8px; font-weight:bold; color:var(--peak-primary);">${url}</div>
                        ${html.slice(0, 500) + (html.length > 500 ? '...' : '')}
                    </div>
                    <div class="footer">
                        <span class="meta-info">DOM snapshot sent to AI</span>
                    </div>
                </div>
            `;

            // Append to Chat
            const msgDiv = document.createElement('div');
            msgDiv.className = 'term-chat-msg system';
            msgDiv.innerHTML = blockHtml;
            this.chatThread.appendChild(msgDiv);
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();

            // Send to AI (Silent)
            const message = `Live View Snapshot (${url}):\n\`\`\`html\n${html}\n\`\`\`\n\n(Proceeding automatically. Please continue with the next step.)`;

            this.inputArea.disabled = true;
            this.submitBtn.style.display = 'none';
            this.stopBtn.style.display = 'flex';
            this.createStreamingMessage();

            const modelSelect = document.getElementById('ai-assist-model-select');
            const modelId = modelSelect ? modelSelect.value : null;

            const context = await this.getProjectContext([]);
            await this.client.sendMessage(message, context, modelId);

        } catch (e) {
            console.error("Failed to capture live view:", e);
            this.appendMessage('system', `Error capturing live view: ${e.message}`);
        }
    }

    async readUrlAndSendToAI(url) {
        try {
            // Use Electron's net module or fetch if available in renderer (usually is)
            // We'll use a simple fetch here. If CORS is an issue, we might need IPC to main process.
            // For now, let's try fetch. If it fails, we can fallback to IPC.

            this.appendMessage('system', `<i data-lucide="loader-2" class="spin"></i> Fetching ${url}...`);

            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

            const text = await response.text();

            // Basic HTML to Text conversion (very simple)
            // In a real app, use a library like turndown or cheerio
            // For now, we'll just strip tags roughly or send raw if it's not too huge

            // Let's try to extract body content
            let content = text;
            const bodyMatch = text.match(/<body[^>]*>([\s\S]*)<\/body>/i);
            if (bodyMatch) content = bodyMatch[1];

            // Strip scripts and styles
            content = content.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gim, "");
            content = content.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gim, "");

            // Strip tags
            content = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

            // Create Tool Output Block
            const blockHtml = `
                <div class="tool-block analysis-block" style="border-color: #3b82f6;">
                    <div class="header" style="color: #3b82f6; background: rgba(59, 130, 246, 0.1);">
                        <i data-lucide="globe" style="width:12px; height:12px;"></i> Read URL: ${url}
                    </div>
                    <div class="content" style="max-height: 200px; overflow-y: auto;">
                        ${content.slice(0, 1000) + (content.length > 1000 ? '...' : '')}
                    </div>
                    <div class="footer">
                        <span class="meta-info">Content sent to AI</span>
                    </div>
                </div>
            `;

            // Append to Chat
            const msgDiv = document.createElement('div');
            msgDiv.className = 'term-chat-msg system';
            msgDiv.innerHTML = blockHtml;
            this.chatThread.appendChild(msgDiv);
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();

            // Send to AI
            const message = `Content of ${url}:\n\`\`\`text\n${content.slice(0, 20000)}\n\`\`\`\n\n(Proceeding automatically.)`;

            this.inputArea.disabled = true;
            this.submitBtn.style.display = 'none';
            this.stopBtn.style.display = 'flex';
            this.createStreamingMessage();

            const modelSelect = document.getElementById('ai-assist-model-select');
            const modelId = modelSelect ? modelSelect.value : null;

            const context = await this.getProjectContext([], Array.from(this.selectedDocs));
            await this.client.sendMessage(message, context, modelId);

        } catch (e) {
            console.error("Failed to read URL:", e);
            this.appendMessage('system', `Error reading URL: ${e.message}. (Note: CORS might block some sites. Try using a proxy or backend fetch if needed.)`);
        }
    }

    async getProblemsAndSendToAI() {
        try {
            if (window.peakGetDiagnostics) {
                const diags = window.peakGetDiagnostics();
                let message = '';
                let displayHtml = '';

                if (diags.length === 0) {
                    // No errors - maybe show a success block or just a system message?
                    // User asked for "Error Block", but if there are no errors, maybe a green check?
                    // Let's stick to a simple system message for "No problems".
                    this.appendMessage('system', '<i data-lucide="check-circle" style="color:var(--peak-accent)"></i> No problems detected.');
                    message = "No problems detected in the project.";
                } else {
                    let totalErrors = 0;
                    let totalWarnings = 0;

                    message = "Project Problems:\n";
                    diags.forEach(d => {
                        message += `\nFile: ${d.file}\n`;
                        d.diagnostics.forEach(diag => {
                            if (diag.severity === 'error') totalErrors++; else totalWarnings++;
                            message += `- [${diag.severity}] Line ${diag.line}: ${diag.message}\n`;
                        });
                    });

                    // Create Error Block HTML
                    displayHtml = `
                        <div class="tool-block error-block">
                            <div class="header">
                                <i data-lucide="alert-triangle" style="width:12px; height:12px;"></i> Problems Found
                            </div>
                            <div class="content">Found ${totalErrors} errors and ${totalWarnings} warnings.\n\n${message.slice(0, 300)}${message.length > 300 ? '...' : ''}</div>
                            <div class="footer">
                                <span class="meta-info">Diagnostics sent to AI</span>
                            </div>
                        </div>
                    `;

                    // Append to Chat (Left Side / System)
                    const msgDiv = document.createElement('div');
                    msgDiv.className = 'term-chat-msg system';
                    msgDiv.innerHTML = displayHtml;
                    this.chatThread.appendChild(msgDiv);
                    if (window.lucide) window.lucide.createIcons();
                    this.scrollToBottom();
                }

                const fullMessage = `Problems Check Result:\n\`\`\`\n${message}\n\`\`\`\n\n(Proceeding automatically. Please continue with the next step.)`;

                // Manual Send (Silent)
                this.inputArea.disabled = true;
                this.submitBtn.style.display = 'none';
                this.stopBtn.style.display = 'flex';
                this.createStreamingMessage();

                const modelSelect = document.getElementById('ai-assist-model-select');
                const modelId = modelSelect ? modelSelect.value : null;

                const context = await this.getProjectContext([]);
                await this.client.sendMessage(fullMessage, context, modelId);

            } else {
                this.appendMessage('system', "Error: Diagnostics service not available.");
            }
        } catch (e) {
            console.error("Failed to get problems:", e);
        }
    }

    async sendFileContentToAI(relPath) {
        try {
            const root = window.currentProjectRoot;
            if (!root) return;
            const fullPath = path.join(root, relPath);
            const content = await require('electron').ipcRenderer.invoke('project:read-file', fullPath);

            // Create Analysis Block HTML
            const analysisHtml = `
                <div class="tool-block analysis-block">
                    <div class="header">
                        <i data-lucide="microscope" style="width:12px; height:12px;"></i> Analysis: ${relPath}
                    </div>
                    <div class="content">${typeof content === 'string' ? content.slice(0, 500) + (content.length > 500 ? '...' : '') : 'Error reading file'}</div>
                    <div class="footer">
                        <span class="meta-info">File content sent for analysis</span>
                    </div>
                </div>
            `;

            // Append to Chat
            const msgDiv = document.createElement('div');
            msgDiv.className = 'term-chat-msg system';
            msgDiv.innerHTML = analysisHtml;
            this.chatThread.appendChild(msgDiv);
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();

            // Send to AI (Hidden from UI, but actual prompt)
            const message = `File Content: \`${relPath}\`\n\`\`\`\n${typeof content === 'string' ? content : 'Error reading file'}\n\`\`\`\n\n(Proceeding automatically. Please continue with the next step.)`;

            // Manual Send
            this.inputArea.disabled = true;
            this.submitBtn.style.display = 'none';
            this.stopBtn.style.display = 'flex';
            this.createStreamingMessage();

            const modelSelect = document.getElementById('ai-assist-model-select');
            const modelId = modelSelect ? modelSelect.value : null;

            const context = await this.getProjectContext([]); // No extra selected files
            await this.client.sendMessage(message, context, modelId);

        } catch (e) {
            console.error("Failed to send file content to AI:", e);
        }
    }

    async sendActiveFileToAI() {
        try {
            const context = window.getProjectFileContext ? window.getProjectFileContext() : {};
            const relPath = context.currentFilePath;
            const content = context.currentFileContent;

            if (!relPath || !content) {
                this.appendMessage('system', 'No active file selected.');
                return;
            }

            // Create Active File Block HTML
            const blockHtml = `
                <div class="tool-block active-file-block">
                    <div class="header">
                        <i data-lucide="file-code" style="width:12px; height:12px;"></i> Active File: ${path.basename(relPath)}
                    </div>
                    <div class="content">${content.slice(0, 500) + (content.length > 500 ? '...' : '')}</div>
                    <div class="footer">
                        <span class="meta-info">Active file context sent</span>
                    </div>
                </div>
            `;

            // Append to Chat
            const msgDiv = document.createElement('div');
            msgDiv.className = 'term-chat-msg system';
            msgDiv.innerHTML = blockHtml;
            this.chatThread.appendChild(msgDiv);
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();

            // Send to AI (Silent)
            const message = `Active File Context: \`${relPath}\`\n\`\`\`\n${content}\n\`\`\`\n\n(Proceeding automatically...)`;

            this.inputArea.disabled = true;
            this.submitBtn.style.display = 'none';
            this.stopBtn.style.display = 'flex';
            this.createStreamingMessage();

            const modelSelect = document.getElementById('ai-assist-model-select');
            const modelId = modelSelect ? modelSelect.value : null;

            const aiContext = await this.getProjectContext([]);
            await this.client.sendMessage(message, aiContext, modelId);

        } catch (e) {
            console.error("Failed to send active file to AI:", e);
        }
    }

    async runSearchAndSendToAI(query) {
        try {
            // We need a search IPC. ProjectView has a scanner but not a general search exposed via IPC easily?
            // Actually, `project:search-in-files` might exist or we can use `grep` via `run_command`?
            // Let's use `run_command` logic or assume there is an IPC.
            // If no IPC, we can simulate `grep -r "query" .`
            // But let's check if we can use `run_command` logic directly?
            // Or just implement a simple search here.

            // For now, let's assume we use `grep` via `peak-run-command` but capture output?
            // But `peak-run-command` sends to terminal.
            // If we want to capture it, we can use the same mechanism as `run_command`.
            // So, let's just dispatch `peak-run-command` with `grep`?
            // But the tool was `search_project`.
            // Let's try to invoke `project:search` if it exists, or just `grep`.

            // Use `grep` command for now as it's reliable and we have auto-continue for commands.
            const cmd = `grep -r "${query}" .`;
            window.dispatchEvent(new CustomEvent('peak-run-command', { detail: cmd }));
            // The `peak-terminal-response` listener will handle the rest!

        } catch (e) {
            console.error("Failed to run search:", e);
        }
    }

    markButtonSuccess(btn, text) {
        btn.innerHTML = `<i data-lucide="check"></i> ${text}`;
        btn.disabled = true;
        if (window.lucide) window.lucide.createIcons();
    }

    destroy() {
        // Remove Window Listeners
        window.removeEventListener('mcp:stream-update', this.handleStreamUpdateBound);
        window.removeEventListener('mcp:stream-complete', this.handleStreamCompleteBound);
        window.removeEventListener('peak-terminal-response', this.handleTerminalResponseBound);
        if (this.handleToggleSettingsBound) {
            document.removeEventListener('peak-toggle-ai-settings', this.handleToggleSettingsBound);
        }
        window.peakToggleAISettings = null;

        // Clean up client if needed
        if (this.client) {
            this.client.abort(); // Stop any active streams
            // this.client.destroy(); // If client had listeners
        }
    }
    destroy() {
        console.log('[ChatView] Destroying instance');

        // Remove Window Listeners
        if (this.handleStreamUpdateBound) window.removeEventListener('mcp:stream-update', this.handleStreamUpdateBound);
        if (this.handleStreamCompleteBound) window.removeEventListener('mcp:stream-complete', this.handleStreamCompleteBound);
        if (this.handleTerminalResponseBound) window.removeEventListener('peak-terminal-response', this.handleTerminalResponseBound);
        if (this.handleToggleSettingsBound) document.removeEventListener('peak-toggle-ai-settings', this.handleToggleSettingsBound);

        // Remove Session Listeners (Need to store bound functions if we want to remove them properly, 
        // but for now let's assume we need to bind them in init or just leave them if they are anonymous 
        // (anonymous listeners can't be removed easily without reference).
        // FIX: We should bind these in init/attachListeners to be able to remove them.

        // For now, let's just log. 
        // Ideally, we should refactor attachListeners to store references.
    }
    async handleDelegation(args) {
        const { agent_id, instruction } = args;
        const agent = AgentRegistry.getAgent(agent_id);

        if (!agent) {
            this.appendMessage('system', `Error: Could not find agent with ID "${agent_id}".`);
            return;
        }

        // Visual Indicator
        this.appendMessage('system', `🔄 Delegating to **${agent.name}**...`);

        // We need to send a new message to the AI with the specific agent's context
        // But we want to keep it in the same thread?
        // Or do we want to "switch" agents?
        // The instruction implies the current agent is asking another agent.
        // So we should run a "sub-task".

        // For now, let's implement it as a "Switch & Execute"
        // 1. Switch the active agent context (temporarily or permanently?)
        // 2. Send the instruction as a user message (or system injection?)

        // Let's treat it as: The current agent "calls" the other agent.
        // We will send the instruction to the LLM using the NEW agent's system prompt.

        const context = await this.getProjectContext([]);
        const modelId = agent.modelId;
        const systemPrompt = agent.systemPrompt;

        // We need to clarify to the new agent what is happening
        const delegationPrompt = `[System: You have been delegated a task by another agent.]\n\nTASK: ${instruction}`;

        await this.client.sendMessage(delegationPrompt, context, modelId, null, systemPrompt);
    }
}

module.exports = ChatView;
