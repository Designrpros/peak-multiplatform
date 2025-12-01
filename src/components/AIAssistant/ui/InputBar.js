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
    }

    render(isFileContextUsable, selectedAgentId, isAgentMode = false) {
        const agents = AgentRegistry.getAgents();
        const defaultAgent = agents.find(a => a.isDefault) || agents[0];
        const currentAgentId = selectedAgentId || defaultAgent.id;

        return `
            <div class="inspector-input-container">
                <!-- Top Toolbar -->
                <div class="input-toolbar" style="display:flex; justify-content:space-between; align-items:center; padding: 2px 6px; margin-bottom: 4px;">
                    <div class="left-tools" style="display:flex; gap:3px; align-items:center;">
                         <!-- AI Mode (Sparkles) -->
                         <div class="agent-mode-toggle" style="display:flex; align-items:center; gap:4px; padding-right:4px; border-right:1px solid var(--border-color); margin-right: 4px;">
                            <button id="ai-assist-agent-mode-btn" class="icon-btn ${isAgentMode ? 'active' : ''}" title="Toggle Agent Mode" style="padding:3px; color: ${isAgentMode ? 'var(--peak-accent)' : 'var(--peak-secondary)'};">
                                <i data-lucide="sparkles" style="width:14px; height:14px;"></i>
                            </button>
                         </div>

                         <!-- Workflows (Flow/GitBranch) -->
                         <button id="ai-assist-tools-btn" class="icon-btn" title="Workflows & Commands (/)" style="padding:3px;">
                            <i data-lucide="workflow" style="width:14px; height:14px;"></i>
                         </button>

                         <!-- References (Link/FileText) -->
                         <button id="ai-assist-docs-btn" class="icon-btn" title="References (@)" style="padding:3px;">
                            <i data-lucide="link" style="width:14px; height:14px;"></i>
                         </button>

                         <button id="ai-assist-add-file-btn" class="icon-btn" title="Add File Context" style="padding:3px;">
                            <i data-lucide="plus" style="width:14px; height:14px;"></i>
                         </button>
                         <button id="ai-assist-add-active-file-btn" class="icon-btn" title="Add Active File Context" style="padding:3px; display:none;">
                            <i data-lucide="file-code" style="width:14px; height:14px;"></i>
                         </button>
                    </div>
                    <div class="right-tools" style="display:flex; align-items:center;">
                        <span id="ai-status-indicator" style="font-size:9px; font-weight:600; color:var(--peak-secondary); display:flex; align-items:center; gap:3px;">
                            <span style="width:5px; height:5px; border-radius:50%; background:var(--peak-secondary);"></span> Ready
                        </span>
                        <div id="ai-review-controls" style="display:none; align-items:center; gap:6px;">
                            <button id="ai-review-reject-btn" style="background:none; border:1px solid var(--peak-error-border, #fca5a5); color:var(--peak-error-text, #dc2626); padding:2px 6px; border-radius:4px; font-size:9px; cursor:pointer;">Reject All</button>
                            <button id="ai-review-accept-btn" style="background:var(--peak-accent); border:none; color:white; padding:2px 8px; border-radius:4px; font-size:9px; font-weight:600; cursor:pointer;">Accept All</button>
                        </div>
                    </div>
                </div>

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

                <!-- Docs Menu Dropdown (Legacy/Fallback) -->
                <div id="ai-assist-docs-menu" class="tools-menu">
                    <!-- Populated by ChatView.js -->
                </div>

                <div class="inspector-input-box">
                    <div id="ai-assist-file-chips" class="file-chips-container"></div>
                    <textarea class="chat-textarea" id="ai-assist-input-textarea" 
                        placeholder="Ask anything... Type @ for refs, / for commands" 
                        rows="1"></textarea>
                    
                    <div class="chat-controls" style="margin-top: 4px;">
                        <div class="left-controls">
                             <div class="model-selector-wrapper" style="position:relative; display:flex; gap:6px; align-items:center;">
                                <select id="ai-assist-agent-select" class="model-select" title="Select Agent">
                                    ${agents.map(agent => `<option value="${agent.id}" ${agent.id === currentAgentId ? 'selected' : ''}>${agent.name}</option>`).join('')}
                                </select>
                             </div>
                        </div>
                        <div class="right-controls" style="display:flex; gap:6px; align-items:center;">
                            <button id="ai-assist-submit-btn" class="chat-submit-btn" title="Send (Enter)">
                                <i data-lucide="arrow-up"></i>
                            </button>
                            <button id="ai-assist-stop-btn" class="chat-submit-btn stop" style="display:none;" title="Stop">
                                <i data-lucide="square"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachListeners(container, callbacks) {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[InputBar] attachListeners called');

        this.container = container;
        this.callbacks = callbacks || {};

        this.inputArea = container.querySelector('#ai-assist-input-textarea');
        this.submitBtn = container.querySelector('#ai-assist-submit-btn');
        this.stopBtn = container.querySelector('#ai-assist-stop-btn');
        this.agentSelect = container.querySelector('#ai-assist-agent-select');
        this.toolsBtn = container.querySelector('#ai-assist-tools-btn');
        this.toolsMenu = container.querySelector('#ai-assist-tools-menu');
        this.docsBtn = container.querySelector('#ai-assist-docs-btn');
        this.docsMenu = container.querySelector('#ai-assist-docs-menu');
        this.addFileBtn = container.querySelector('#ai-assist-add-file-btn');
        this.addActiveFileBtn = container.querySelector('#ai-assist-add-active-file-btn');
        this.agentModeBtn = container.querySelector('#ai-assist-agent-mode-btn');
        this.popover = container.querySelector('#ai-suggestion-popover');

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

        // Stop
        if (this.stopBtn) {
            this.stopBtn.addEventListener('click', () => {
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
        this.inputArea.style.height = 'auto';
        this.inputArea.style.height = (this.inputArea.scrollHeight) + 'px';
    }

    updateSubmitButton() {
        if (!this.submitBtn || !this.inputArea) return;
        const hasText = this.inputArea.value.trim().length > 0;
        if (hasText) {
            this.submitBtn.style.opacity = '1';
            this.submitBtn.style.color = 'var(--peak-accent)';
        } else {
            this.submitBtn.style.opacity = '0.3';
            this.submitBtn.style.color = 'var(--peak-secondary)';
        }
    }

    setLoading(isLoading) {
        if (this.submitBtn) {
            this.submitBtn.style.display = 'flex';
            this.submitBtn.style.opacity = isLoading ? '0.7' : '1';
        }

        if (this.stopBtn) this.stopBtn.style.display = isLoading ? 'flex' : 'none';

        if (isLoading) {
            this.submitBtn.style.display = 'flex';
            this.stopBtn.style.display = 'flex';
        } else {
            this.submitBtn.style.display = 'flex';
            this.stopBtn.style.display = 'none';
        }
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
}

module.exports = InputBar;
