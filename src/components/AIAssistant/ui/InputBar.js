const ToolRegistry = require('../tools/ToolRegistry');
const AgentRegistry = require('../core/AgentRegistry');

class InputBar {
    constructor() {
        this.container = null;
        this.callbacks = {};
        this.isPopoverVisible = false;
        this.popoverIndex = 0;
        this.filteredItems = [];
        this.triggerChar = null; // '@' or '/'
        this.triggerIndex = -1;
        this.attachments = []; // { type: 'image'|'file', name: string, content: string (base64/text), preview: string (url) }
    }

    render(isFileContextUsable, selectedAgentId, isAgentMode = false) {
        const agents = AgentRegistry.getAgents();
        const defaultAgent = agents.find(a => a.isDefault) || agents[0];
        const currentAgentId = selectedAgentId || defaultAgent.id;

        return `
            <div class="inspector-input-container" style="background: transparent;">
                
                <!-- Suggestion Popover -->
                <div id="ai-suggestion-popover" class="suggestion-popover" style="display:none;"></div>

                <!-- Tools Menu Dropdown (Legacy/Fallback) -->
                <div id="ai-assist-tools-menu" class="tools-menu">
                    <div class="menu-section-header">Tools</div>
                    ${ToolRegistry.getCachedTools().map(tool => `
                        <div class="menu-item" data-action="insert-tool" data-tool="${tool.name}">
                            <i data-lucide="terminal-square"></i> ${tool.name}
                        </div>
                    `).join('')}
                </div>
                <div id="ai-assist-docs-menu" class="tools-menu"></div>

                <div class="inspector-input-box">
                    <div id="ai-assist-attachments" class="attachments-container" style="display:none; gap:6px; padding:4px 0 8px 0; flex-wrap:wrap;"></div>
                    <div id="ai-assist-file-chips" class="file-chips-container"></div>
                    
                    <textarea class="chat-textarea-plain" id="ai-assist-input-textarea" 
                        placeholder="Ask anything... @ to mention, / for workflows" 
                        rows="1"></textarea>
                    
                    <div class="chat-controls" style="margin-top: 4px; padding-top: 0px;">
                        <div class="left-controls" style="display:flex; gap:8px; align-items:center;">
                             <!-- Add File -->
                             <button id="ai-assist-add-file-btn" class="icon-btn-plain" title="Add File Context">
                                <i data-lucide="plus" style="width:14px; height:14px;"></i>
                             </button>

                             <div class="model-selector-wrapper" style="position:relative; display:flex; gap:8px; align-items:center;">
                                <select id="ai-assist-mode-select" class="model-select-plain" title="Select Mode">
                                    <option value="planning" selected>Planning</option>
                                    <option value="fast">Fast</option>
                                </select>
                                
                                <select id="ai-assist-agent-select" class="model-select-plain" title="Select Agent">
                                    ${agents.map(agent => `<option value="${agent.id}" ${agent.id === currentAgentId ? 'selected' : ''}>${agent.name}</option>`).join('')}
                                </select>
                             </div>
                        </div>
                        <div class="right-controls" style="display:flex; gap:6px; align-items:center;">
                            <span id="ai-status-indicator" style="font-size:9px; font-weight:500; color:var(--peak-secondary); display:none; align-items:center; gap:4px; margin-right:8px;">
                                <span style="width:5px; height:5px; border-radius:50%; background:var(--peak-secondary);"></span> Ready
                            </span>
                            
                            <div id="ai-review-controls" style="display:none; align-items:center; gap:6px;">
                                <button id="ai-review-reject-btn" class="review-btn reject">Reject All</button>
                                <button id="ai-review-accept-btn" class="review-btn accept">Accept All</button>
                            </div>

                            <button id="ai-assist-submit-btn" class="chat-submit-btn" title="Send (Enter)">
                                <i data-lucide="arrow-up" style="width: 14px; height: 14px; stroke-width: 3px;"></i>
                            </button>
                            <button id="ai-assist-stop-btn" class="chat-submit-btn stop" style="display:none;" title="Stop">
                                <i data-lucide="square" style="width: 12px; height: 12px; fill: currentColor;"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <style>
                /* New Plain Styles */
                .inspector-input-container {
                    width: 100%; 
                    flex-shrink: 0;
                    margin-top: 0px;
                    position: relative; /* Essential for popover positioning */
                }

                .inspector-input-box {
                    padding: 12px 12px 8px 12px; /* Top padding increased as requested */
                    display: flex;
                    flex-direction: column;
                    width: 100%;
                    box-sizing: border-box;
                    background: var(--window-background-color);
                    border-top: 1px solid var(--border-color);
                }
                
                .icon-btn-plain {
                    background: none;
                    border: none;
                    color: var(--peak-secondary);
                    cursor: pointer;
                    padding: 0px; /* Zero padding for tight alignment */
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                    opacity: 0.7;
                }
                .icon-btn-plain:hover {
                    color: var(--peak-primary);
                    opacity: 1;
                }

                .suggestion-popover, .tools-menu {
                    position: absolute;
                    bottom: 100%; /* Sits directly on top of container */
                    left: 0;
                    width: 100%;
                    max-height: 200px;
                    overflow-y: auto;
                    background: var(--peak-background, #1e1e1e);
                    border: 1px solid var(--border-color);
                    border-bottom: none;
                    z-index: 1000; /* Increased z-index */
                    display: none;
                    flex-direction: column;
                    padding: 2px 0; /* Reduced vertical padding */
                    box-shadow: 0 -4px 12px rgba(0,0,0,0.2);
                }

                .menu-item, .popover-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 4px 12px; /* aligned with input text */
                    cursor: pointer;
                    font-size: 13px;
                    color: var(--peak-secondary);
                    transition: all 0.2s;
                }
                .menu-item:hover, .popover-item:hover, .popover-item.active {
                    background: var(--peak-hover-bg, rgba(255,255,255,0.05));
                    color: var(--peak-primary);
                }
                .popover-item-content {
                    display: flex;
                    flex-direction: column;
                    min-width: 0;
                }
                .popover-item-title { font-weight: 500; }
                .popover-item-desc { font-size: 11px; opacity: 0.7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

                .menu-section-header {
                    padding: 4px 12px; /* aligned */
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    color: var(--peak-secondary);
                    opacity: 0.7;
                    margin-top: 4px;
                }

                .model-select-plain {
                    appearance: none;
                    -webkit-appearance: none;
                    background: transparent;
                    border: none;
                    color: var(--peak-secondary);
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    padding: 0;
                    margin: 0;
                    outline: none;
                    opacity: 0.8;
                }
                .model-select-plain:hover {
                    color: var(--peak-primary);
                    opacity: 1;
                }

                .chat-textarea-plain {
                    flex: 1;
                    background: transparent;
                    border: none;
                    color: var(--peak-primary);
                    font-size: 13px;
                    line-height: 1.5;
                    padding: 0;
                    resize: none;
                    outline: none;
                    font-family: inherit;
                    min-height: 40px; 
                    max-height: 200px;
                    margin-bottom: 0px; 
                    overflow-y: hidden; 
                    box-sizing: border-box;
                }
                .chat-textarea-plain::placeholder {
                    color: var(--peak-secondary);
                    opacity: 0.5;
                }

                .chat-submit-btn {
                    background: var(--peak-accent);
                    border: none;
                    color: white;
                    border-radius: 50%;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: all 0.2s;
                    opacity: 0.3;
                }
                .chat-submit-btn svg {
                    stroke: white !important;
                    fill: none;
                }
                .chat-submit-btn:hover {
                    transform: scale(1.05);
                }
                .chat-submit-btn.stop {
                    background: var(--peak-error-text, #ef4444);
                }

                /* Layout helpers for chat controls */
                .chat-controls {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-top: 0px; /* Zero top margin */
                    padding-top: 0px;
                }
                .left-controls { display: flex; align-items: center; }
                .right-controls { display: flex; gap: 6px; align-items: center; }

                .review-btn {
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 500;
                    cursor: pointer;
                    border: 1px solid transparent;
                }
                .review-btn.reject {
                    background: transparent;
                    border-color: var(--peak-error-border, #fca5a5);
                    color: var(--peak-error-text, #dc2626);
                }
                .review-btn.accept {
                    background: var(--peak-accent);
                    color: white;
                }

                .attachment-chip {
                    font-size: 10px !important;
                    padding: 2px 6px !important;
                }
            </style>
        `;
    }

    attachListeners(container, callbacks) {
        const { ipcRenderer } = require('electron');
        const StateStore = require('../core/StateStore');
        const ToolExecutor = require('../core/ToolExecutor');

        ipcRenderer.send('log', '[InputBar] attachListeners called');

        this.container = container;
        this.callbacks = callbacks || {};
        this.pendingTools = new Set(); // Track pending tool confirmations

        this.inputArea = container.querySelector('#ai-assist-input-textarea');
        this.submitBtn = container.querySelector('#ai-assist-submit-btn');
        this.stopBtn = container.querySelector('#ai-assist-stop-btn');
        this.agentSelect = container.querySelector('#ai-assist-agent-select');
        this.modeSelect = container.querySelector('#ai-assist-mode-select');
        this.toolsBtn = container.querySelector('#ai-assist-tools-btn');
        this.toolsMenu = container.querySelector('#ai-assist-tools-menu');
        this.docsBtn = container.querySelector('#ai-assist-docs-btn');
        this.docsMenu = container.querySelector('#ai-assist-docs-menu');
        this.addFileBtn = container.querySelector('#ai-assist-add-file-btn');
        this.addActiveFileBtn = container.querySelector('#ai-assist-add-active-file-btn');
        this.agentModeBtn = container.querySelector('#ai-assist-agent-mode-btn');
        this.popover = container.querySelector('#ai-suggestion-popover');

        // Listen for tool confirmation events
        StateStore.on('tool:pending-confirmation', (data) => {
            this.pendingTools.add(data.executionId);
            this._updateReviewControls();
        });

        StateStore.on('tool:execution-completed', (data) => {
            this.pendingTools.delete(data.executionId);
            this._updateReviewControls();
        });

        // Accept All / Reject All buttons
        const acceptAllBtn = container.querySelector('#ai-review-accept-btn');
        const rejectAllBtn = container.querySelector('#ai-review-reject-btn');

        if (acceptAllBtn) {
            acceptAllBtn.addEventListener('click', () => {
                // Approve all pending tools
                const allTools = Array.from(this.pendingTools);
                allTools.forEach(executionId => {
                    ToolExecutor.confirmExecution(executionId);
                });
                this.pendingTools.clear();
                this._updateReviewControls();
            });
        }

        if (rejectAllBtn) {
            rejectAllBtn.addEventListener('click', () => {
                // Reject all pending tools
                const allTools = Array.from(this.pendingTools);
                allTools.forEach(executionId => {
                    ToolExecutor.cancelExecution(executionId);
                });
                this.pendingTools.clear();
                this._updateReviewControls();
            });
        }

        // Mode Select Listener
        if (this.modeSelect) {
            // Sync initial state from SettingsManager
            if (window.peakSettingsManager) {
                const currentMode = window.peakSettingsManager.getSetting('mode');
                // Map internal mode to UI value
                // assisted/hybrid -> planning
                // auto -> fast
                this.modeSelect.value = (currentMode === 'auto') ? 'fast' : 'planning';
            }

            this.modeSelect.addEventListener('change', () => {
                const uiMode = this.modeSelect.value;

                // Map UI value to internal setting
                // fast -> auto (no confirmation)
                // planning -> assisted (confirmation required)
                const settingsMode = (uiMode === 'fast') ? 'auto' : 'assisted';

                if (window.peakSettingsManager) {
                    window.peakSettingsManager.updateSettings({ mode: settingsMode });
                }

                // Optional: Disable agent select in Fast mode if desired
                if (this.agentSelect) {
                    this.agentSelect.disabled = (uiMode === 'fast');
                    this.agentSelect.style.opacity = (uiMode === 'fast') ? '0.5' : '1';
                }
            });
        }

        // Agent Mode Toggle
        if (this.agentModeBtn) {
            this.agentModeBtn.addEventListener('click', () => {
                const isActive = this.agentModeBtn.classList.toggle('active');
                this.agentModeBtn.style.color = isActive ? 'var(--peak-accent)' : 'var(--peak-secondary)';
                if (this.callbacks.onAgentModeToggle) {
                    this.callbacks.onAgentModeToggle(isActive);
                }
            });
        }

        // Submit
        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', () => {
                this.handleSubmit();
            });
        }

        // Input & Keydown
        if (this.inputArea) {
            this.inputArea.addEventListener('keydown', (e) => this.handleKeyDown(e));
            this.inputArea.addEventListener('input', (e) => this.handleInput(e));

            // Auto-resize
            this.inputArea.addEventListener('input', () => {
                this.adjustHeight();
                this.updateSubmitButton();
            });

            // Initial adjustment
            setTimeout(() => {
                this.adjustHeight();
                this.updateSubmitButton();
            }, 50);
        }

        // Drag & Drop + Paste
        if (this.inputArea) {
            this.inputArea.addEventListener('paste', (e) => this.handlePaste(e));
            this.inputArea.addEventListener('dragover', (e) => { e.preventDefault(); this.inputArea.classList.add('drag-over'); });
            this.inputArea.addEventListener('dragleave', (e) => { e.preventDefault(); this.inputArea.classList.remove('drag-over'); });
            this.inputArea.addEventListener('drop', (e) => this.handleDrop(e));
        }

        // Stop
        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => {
                // this.stopBtn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px; height:14px;"></i>';
                this.stopBtn.disabled = true; // Just disable to prevent double-click
                if (window.lucide) window.lucide.createIcons();

                if (this.callbacks.onStop) this.callbacks.onStop();
            });
        }

        // Manual Triggers (Buttons)
        if (this.toolsBtn) {
            this.toolsBtn.addEventListener('click', () => {
                this.insertText('/');
                this.handleInput({ target: this.inputArea }); // Trigger logic
            });
        }

        if (this.docsBtn) {
            this.docsBtn.addEventListener('click', () => {
                this.insertText('@');
                this.handleInput({ target: this.inputArea }); // Trigger logic
            });
        }

        // Add File Button (Legacy/Direct)
        if (this.addFileBtn) {
            this.addFileBtn.addEventListener('click', () => {
                if (this.callbacks.onAddFile) this.callbacks.onAddFile();
            });
        }
    }

    handleInput(e) {
        const val = this.inputArea.value;
        const cursorPos = this.inputArea.selectionStart;

        // Check for triggers near cursor
        // Look backwards from cursor for @ or /
        const textBeforeCursor = val.slice(0, cursorPos);
        const lastAt = textBeforeCursor.lastIndexOf('@');
        const lastSlash = textBeforeCursor.lastIndexOf('/');

        // Determine which trigger is active and closer
        let trigger = null;
        let index = -1;

        if (lastAt > -1 && (lastAt >= lastSlash || lastSlash === -1)) {
            // Check if it's a valid trigger (start of line or preceded by space)
            if (lastAt === 0 || /\s/.test(textBeforeCursor[lastAt - 1])) {
                trigger = '@';
                index = lastAt;
            }
        } else if (lastSlash > -1 && (lastSlash >= lastAt || lastAt === -1)) {
            if (lastSlash === 0 || /\s/.test(textBeforeCursor[lastSlash - 1])) {
                trigger = '/';
                index = lastSlash;
            }
        }

        if (trigger) {
            const query = textBeforeCursor.slice(index + 1);
            // If query contains space, we might assume the user finished typing the ref
            // But for multi-word files, we might want to keep it open. 
            // For now, let's close if there's a newline or maybe just keep it simple.
            if (query.includes('\n')) {
                this.hidePopover();
                return;
            }

            this.triggerChar = trigger;
            this.triggerIndex = index;
            this.showPopover(trigger, query);
        } else {
            this.hidePopover();
        }
    }

    handleKeyDown(e) {
        if (this.isPopoverVisible) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigatePopover(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigatePopover(-1);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                this.selectPopoverItem();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hidePopover();
            }
            return;
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.handleSubmit();
        }
    }

    async showPopover(trigger, query) {
        this.isPopoverVisible = true;

        // Get items based on trigger
        let items = [];
        if (trigger === '@') {
            items = await this.getReferences(query);
        } else if (trigger === '/') {
            items = await this.getCommands(query);
        }

        this.filteredItems = items;
        this.popoverIndex = 0;

        if (items.length === 0) {
            this.hidePopover();
            return;
        }

        this.renderPopoverItems(items);
        // No positioning needed for full-width static layout
    }

    renderPopoverItems(items) {
        if (!this.popover) return;

        this.popover.innerHTML = items.map((item, i) => `
            <div class="popover-item ${i === 0 ? 'active' : ''}" data-index="${i}">
                <i data-lucide="${item.icon}" style="width:14px; height:14px;"></i>
                <div class="popover-item-content">
                    <div class="popover-item-title">${item.label}</div>
                    ${item.desc ? `<div class="popover-item-desc">${item.desc}</div>` : ''}
                </div>
            </div>
        `).join('');

        this.popover.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    }

    navigatePopover(dir) {
        if (!this.filteredItems.length) return;

        this.popoverIndex = (this.popoverIndex + dir + this.filteredItems.length) % this.filteredItems.length;

        const items = this.popover.querySelectorAll('.popover-item');
        items.forEach((el, i) => {
            if (i === this.popoverIndex) {
                el.classList.add('active');
                el.scrollIntoView({ block: 'nearest' });
            } else {
                el.classList.remove('active');
            }
        });
    }

    selectPopoverItem() {
        const item = this.filteredItems[this.popoverIndex];
        if (!item) return;

        const val = this.inputArea.value;
        const before = val.slice(0, this.triggerIndex);
        const after = val.slice(this.inputArea.selectionStart);

        // Insert format: @[label](value) or just value?
        // System seems to use @[path] or just text.
        // Let's use a clean text representation.
        const insertion = `${this.triggerChar}[${item.value}] `;

        this.inputArea.value = before + insertion + after;

        // Move cursor
        const newCursorPos = before.length + insertion.length;
        this.inputArea.setSelectionRange(newCursorPos, newCursorPos);

        this.hidePopover();
        this.adjustHeight();
        this.updateSubmitButton();
    }

    hidePopover() {
        this.isPopoverVisible = false;
        this.triggerChar = null;
        this.triggerIndex = -1;
        if (this.popover) this.popover.style.display = 'none';
    }

    // --- Attachments ---

    addAttachment(file) {
        this.attachments.push(file);
        this.renderAttachments();
    }

    removeAttachment(index) {
        this.attachments.splice(index, 1);
        this.renderAttachments();
    }

    getAttachments() {
        return this.attachments;
    }

    clearAttachments() {
        this.attachments = [];
        this.renderAttachments();
    }

    renderAttachments() {
        const container = this.container.querySelector('#ai-assist-attachments');
        if (!container) return;

        if (this.attachments.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = this.attachments.map((att, index) => `
            <div class="attachment-chip" style="display:flex; align-items:center; gap:6px; background:var(--control-background-color); padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); font-size:11px;">
                ${att.type === 'image'
                ? `<img src="${att.preview}" style="width:16px; height:16px; object-fit:cover; border-radius:2px;">`
                : `<i data-lucide="file" style="width:14px; height:14px;"></i>`
            }
                <span style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${att.name}</span>
                <button class="remove-attachment-btn" data-index="${index}" style="background:none; border:none; cursor:pointer; padding:0; display:flex; color:var(--peak-secondary);">
                    <i data-lucide="x" style="width:12px; height:12px;"></i>
                </button>
            </div>
        `).join('');

        // Re-attach listeners for remove buttons
        container.querySelectorAll('.remove-attachment-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent input focus loss if possible
                const idx = parseInt(btn.dataset.index, 10);
                this.removeAttachment(idx);
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    // --- File Handling ---

    async handlePaste(e) {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        const files = [];
        for (const item of items) {
            if (item.kind === 'file') {
                const file = item.getAsFile();
                if (file) files.push(file);
            }
        }

        if (files.length > 0) {
            e.preventDefault();
            await this.processFiles(files);
        } else {
            // Check for text that might be a file path
            const text = (e.clipboardData || e.originalEvent.clipboardData).getData('text');
            if (text && text.trim().startsWith('/')) {
                // Potential absolute path
                const path = text.trim();
                // Verify if it's a file
                try {
                    const { ipcRenderer } = require('electron');
                    // We use project:read-file to check existence/readability
                    // If it fails, it's likely not a file we can read or doesn't exist
                    // But project:read-file returns content string or error object
                    // We can't easily check "is file" without reading it, which is fine for small files
                    // But for large files, this might be heavy.
                    // Let's assume if the user pastes a path, they want to attach it.

                    // We need to create a "File-like" object for our attachment system
                    // { type: 'file', name: basename, content: string, preview: null }

                    const result = await ipcRenderer.invoke('project:read-file', path);
                    if (result && !result.error) {
                        e.preventDefault();
                        const content = typeof result === 'string' ? result : result.content;
                        const name = path.split('/').pop();

                        this.addAttachment({
                            type: 'file',
                            name: name,
                            content: content,
                            preview: null
                        });
                        return;
                    }
                } catch (err) {
                    // Not a valid file path or read failed, treat as normal text paste
                    console.log('Paste text was not a valid file path:', err);
                }
            }
        }
    }

    async handleDrop(e) {
        e.preventDefault();
        this.inputArea.classList.remove('drag-over');
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await this.processFiles(files);
        }
    }

    async processFiles(files) {
        for (const file of files) {
            try {
                const processed = await this.readFile(file);
                if (processed) this.addAttachment(processed);
            } catch (err) {
                console.error('Failed to process file:', file.name, err);
            }
        }
    }

    readFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            if (file.type.startsWith('image/')) {
                reader.onload = (e) => {
                    resolve({
                        type: 'image',
                        name: file.name,
                        content: e.target.result, // Base64
                        preview: e.target.result
                    });
                };
                reader.readAsDataURL(file);
            } else {
                // Text files
                reader.onload = (e) => {
                    resolve({
                        type: 'file',
                        name: file.name,
                        content: e.target.result,
                        preview: null
                    });
                };
                reader.readAsText(file);
            }
            reader.onerror = reject;
        });
    }

    // --- Data Providers ---

    async getReferences(query) {
        let currentFileValue = 'current_file';
        let currentFileDesc = 'Add active file';

        // Try to get actual active file
        if (window.getProjectFileContext) {
            const ctx = window.getProjectFileContext();
            if (ctx && ctx.currentFilePath) {
                currentFileValue = ctx.currentFilePath;
                currentFileDesc = ctx.currentFilePath; // Show path in desc
            }
        }

        const defaults = [
            { label: 'Current File', value: currentFileValue, icon: 'file', desc: currentFileDesc },
            { label: 'All Open Files', value: 'open_files', icon: 'files', desc: 'Add all open files' },
        ];

        let results = defaults.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));

        // If we have a query and a project root, search for files
        if (query && query.length > 1 && window.currentProjectRoot) {
            try {
                const { ipcRenderer } = require('electron');
                const path = require('path');
                const searchResult = await ipcRenderer.invoke('project:search', window.currentProjectRoot, query);

                if (searchResult && searchResult.matches) {
                    const fileItems = searchResult.matches.map(fullPath => ({
                        label: path.basename(fullPath),
                        value: fullPath,
                        icon: 'file-code',
                        desc: path.relative(window.currentProjectRoot, fullPath)
                    }));

                    // Add file results to the list
                    results = [...results, ...fileItems];
                }
            } catch (e) {
                console.error('[InputBar] File search failed:', e);
            }
        }

        return results.slice(0, 20); // Limit total results
    }

    async getCommands(query) {
        const tools = ToolRegistry.getCachedTools();
        const commands = tools.map(t => ({
            label: t.name,
            value: t.name,
            icon: 'terminal-square',
            desc: t.description ? t.description.slice(0, 30) + '...' : 'Tool'
        }));

        const workflows = [
            { label: 'Explain Code', value: 'explain', icon: 'book-open', desc: 'Explain selected code' },
            { label: 'Refactor', value: 'refactor', icon: 'hammer', desc: 'Refactor selected code' },
            { label: 'Find Bugs', value: 'debug', icon: 'bug', desc: 'Analyze for bugs' },
        ];

        const all = [...workflows, ...commands];
        return all.filter(i => i.label.toLowerCase().includes(query.toLowerCase()));
    }

    // --- Existing Methods (Preserved) ---

    handleSubmit() {
        const { ipcRenderer } = require('electron');
        const value = this.inputArea.value.trim();

        if (value && this.callbacks.onSubmit) {
            this.callbacks.onSubmit(value);
            this.inputArea.value = '';
            this.adjustHeight();
            this.updateSubmitButton();
        }
    }

    insertText(text) {
        if (this.inputArea) {
            this.inputArea.value += text;
            this.inputArea.focus();
            this.adjustHeight();
            this.updateSubmitButton();
        }
    }

    adjustHeight() {
        if (!this.inputArea) return;

        // Reset height to allow shrink
        this.inputArea.style.height = 'auto';

        // Calculate new height
        const newHeight = this.inputArea.scrollHeight;
        const maxHeight = 200; // Match CSS

        this.inputArea.style.height = Math.min(newHeight, maxHeight) + 'px';

        // Show scrollbar only if max height reached
        if (newHeight > maxHeight) {
            this.inputArea.style.overflowY = 'auto';
        } else {
            this.inputArea.style.overflowY = 'hidden';
        }
    }

    updateSubmitButton() {
        if (!this.submitBtn || !this.inputArea) return;
        const hasText = this.inputArea.value.trim().length > 0;
        if (hasText) {
            this.submitBtn.style.opacity = '1';
        } else {
            this.submitBtn.style.opacity = '0.3';
        }
    }

    setLoading(isLoading) {
        if (this.submitBtn) {
            this.submitBtn.style.display = isLoading ? 'none' : 'flex';
        }

        if (this.stopBtn) {
            this.stopBtn.style.display = isLoading ? 'flex' : 'none';
            // Reset text if showing again
            if (isLoading) {
                this.stopBtn.innerHTML = '<i data-lucide="square" style="width:14px; height:14px; fill:currentColor;"></i>';
                this.stopBtn.disabled = false;
            }
        }

        if (window.lucide) window.lucide.createIcons();
    }

    updateStatus(status, customMessage = null) {
        const indicator = this.container.querySelector('#ai-status-indicator');
        if (!indicator) return;

        if (customMessage) {
            indicator.innerHTML = `
                <span style="width:6px; height:6px; border-radius:50%; background:var(--peak-accent); animation: pulse 1s infinite;"></span> ${customMessage}
            `;
            indicator.style.color = 'var(--peak-accent)';
        } else if (status === 'thinking') {
            indicator.innerHTML = `
                <span style="width:6px; height:6px; border-radius:50%; background:var(--peak-accent); animation: pulse 1s infinite;"></span> Thinking...
            `;
            indicator.style.color = 'var(--peak-accent)';
        } else if (status === 'ready') {
            indicator.innerHTML = `
                <span style="width:6px; height:6px; border-radius:50%; background:var(--peak-secondary);"></span> Ready
            `;
            indicator.style.color = 'var(--peak-secondary)';
        }
    }

    showReviewControls(count, onAccept, onReject) {
        const indicator = this.container.querySelector('#ai-status-indicator');
        const controls = this.container.querySelector('#ai-review-controls');
        const acceptBtn = this.container.querySelector('#ai-review-accept-btn');
        const rejectBtn = this.container.querySelector('#ai-review-reject-btn');

        if (indicator) indicator.style.display = 'none';
        if (controls) controls.style.display = 'flex';

        if (acceptBtn) {
            acceptBtn.textContent = `Accept All (${count})`;
            acceptBtn.onclick = (e) => {
                e.stopPropagation();
                if (onAccept) onAccept();
            };
        }

        if (rejectBtn) {
            rejectBtn.onclick = (e) => {
                e.stopPropagation();
                if (onReject) onReject();
            };
        }
    }

    hideReviewControls() {
        const indicator = this.container.querySelector('#ai-status-indicator');
        const controls = this.container.querySelector('#ai-review-controls');

        if (indicator) indicator.style.display = 'flex';
        if (controls) controls.style.display = 'none';
    }

    _updateReviewControls() {
        const count = this.pendingTools.size;

        if (count > 0) {
            this.showReviewControls(count, null, null);
        } else {
            this.hideReviewControls();
        }
    }
}

module.exports = InputBar;
