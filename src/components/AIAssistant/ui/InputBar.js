const ToolRegistry = require('../tools/ToolRegistry');
const AgentRegistry = require('../core/AgentRegistry');

class InputBar {
    constructor() {
        this.container = null;
        this.callbacks = {};
    }

    render(isFileContextUsable, selectedAgentId) {
        const agents = AgentRegistry.getAgents();
        const defaultAgent = agents.find(a => a.isDefault) || agents[0];
        const currentAgentId = selectedAgentId || defaultAgent.id;

        return `
            <div class="inspector-input-container">
                <!-- Top Toolbar -->
                <div class="input-toolbar" style="display:flex; justify-content:space-between; align-items:center; padding: 2px 6px; margin-bottom: 4px;">
                    <div class="left-tools" style="display:flex; gap:3px; align-items:center;">
                         <button id="ai-assist-tools-btn" class="icon-btn" title="Tools" style="padding:3px;">
                            <i data-lucide="sliders-horizontal" style="width:12px; height:12px;"></i>
                         </button>
                         <button id="ai-assist-docs-btn" class="icon-btn" title="Documentation" style="padding:3px;">
                            <i data-lucide="book" style="width:12px; height:12px;"></i>
                         </button>
                         <button id="ai-assist-add-file-btn" class="icon-btn" title="Add File Context" style="padding:3px;">
                            <i data-lucide="plus" style="width:12px; height:12px;"></i>
                         </button>
                         <button id="ai-assist-add-active-file-btn" class="icon-btn" title="Add Active File Context" style="padding:3px; display:none;">
                            <i data-lucide="file-code" style="width:12px; height:12px;"></i>
                         </button>
                         <div style="width:8px;"></div>
                         <button id="ai-assist-continue-btn" class="icon-btn" title="Continue" style="padding:3px 6px; font-size:10px; font-weight:500; color:var(--peak-secondary); border:none; background:transparent; display:flex; align-items:center; gap:3px;">
                            Continue
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

                <!-- Tools Menu Dropdown -->
                <div id="ai-assist-tools-menu" class="tools-menu">
                    <div class="menu-section-header">Tools</div>
                    ${ToolRegistry.getTools().map(tool => `
                        <div class="menu-item" data-action="insert-tool" data-tool="${tool.name}">
                            <i data-lucide="terminal-square"></i> ${tool.name}
                        </div>
                    `).join('')}
                </div>

                <!-- Docs Menu Dropdown -->
                <div id="ai-assist-docs-menu" class="tools-menu">
                    <!-- Populated by ChatView.js -->
                </div>

                <div class="inspector-input-box">
                    <div id="ai-assist-file-chips" class="file-chips-container"></div>
                    <textarea class="chat-textarea" id="ai-assist-input-textarea" 
                        placeholder="Ask anything..." 
                        rows="1"></textarea>
                    
                    <div class="chat-controls" style="margin-top: 4px;">
                        <div class="left-controls">
                             <div class="model-selector-wrapper" style="position:relative; display:flex; gap:6px;">
                                <select id="ai-assist-agent-select" class="model-select" title="Select Agent">
                                    ${agents.map(agent => `<option value="${agent.id}" ${agent.id === currentAgentId ? 'selected' : ''}>${agent.name}</option>`).join('')}
                                    <option value="manage-agents" style="font-style:italic; border-top:1px solid #ccc;">Manage Agents...</option>
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
        this.container = container;
        this.callbacks = callbacks || {};

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
        this.continueBtn = container.querySelector('#ai-assist-continue-btn');

        // Debug Review Controls
        const reviewControls = container.querySelector('#ai-review-controls');
        console.log('[InputBar] attachListeners: Review controls found?', !!reviewControls);

        // Submit
        if (this.submitBtn) {
            this.submitBtn.addEventListener('click', () => this.handleSubmit());
        }

        // Enter Key
        if (this.inputArea) {
            this.inputArea.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSubmit();
                }
            });

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

        // Agent Select
        if (this.agentSelect) {
            this.agentSelect.addEventListener('change', (e) => {
                if (this.callbacks.onAgentChange) this.callbacks.onAgentChange(e.target.value);
            });
        }

        // Mode Select
        if (this.modeSelect) {
            this.modeSelect.addEventListener('change', (e) => {
                if (this.callbacks.onModeChange) this.callbacks.onModeChange(e.target.value);
            });
        }

        // Tools Menu
        if (this.toolsBtn && this.toolsMenu) {
            this.toolsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.docsMenu) this.docsMenu.classList.remove('visible');
                this.toolsMenu.classList.toggle('visible');
            });

            this.toolsMenu.addEventListener('click', (e) => {
                const item = e.target.closest('.menu-item');
                if (!item) return;
                const action = item.dataset.action;
                if (action === 'insert-tool') {
                    const toolName = item.dataset.tool;
                    this.insertText(`Use ${toolName} to `);
                    this.toolsMenu.classList.remove('visible');
                }
            });
        }

        // Docs Menu
        if (this.docsBtn && this.docsMenu) {
            this.docsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.toolsMenu) this.toolsMenu.classList.remove('visible');
                if (this.callbacks.onDocsMenuToggle) this.callbacks.onDocsMenuToggle(this.docsMenu);
                this.docsMenu.classList.toggle('visible');
            });

            // Docs menu clicks are handled by ChatView usually because it renders the content dynamically
            // But we can delegate or let ChatView attach its own listener to the menu if it wants
            // Or we can forward the click
            this.docsMenu.addEventListener('click', (e) => {
                if (this.callbacks.onDocsMenuClick) this.callbacks.onDocsMenuClick(e);
            });
        }

        // Add File
        if (this.addFileBtn) {
            this.addFileBtn.addEventListener('click', () => {
                if (this.callbacks.onAddFile) this.callbacks.onAddFile();
            });
        }

        // Add Active File
        if (this.addActiveFileBtn) {
            this.addActiveFileBtn.addEventListener('click', () => {
                if (this.callbacks.onAddActiveFile) this.callbacks.onAddActiveFile();
            });
        }

        // Continue
        if (this.continueBtn) {
            this.continueBtn.addEventListener('click', () => {
                if (this.callbacks.onContinue) this.callbacks.onContinue();
            });
        }

        // Close menus on outside click
        document.addEventListener('click', (e) => {
            if (this.toolsMenu && !this.toolsMenu.contains(e.target) && !this.toolsBtn.contains(e.target)) {
                this.toolsMenu.classList.remove('visible');
            }
            if (this.docsMenu && !this.docsMenu.contains(e.target) && !this.docsBtn.contains(e.target)) {
                this.docsMenu.classList.remove('visible');
            }
        });
    }

    handleSubmit() {
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
        // Allow typing while loading for queueing
        // if (this.inputArea) this.inputArea.disabled = isLoading; 

        if (this.submitBtn) {
            // Change submit button to "Queue" or just keep it active?
            // If we keep it active, user can click it.
            // Let's keep it active but maybe change icon?
            // For now, just keep it active.
            this.submitBtn.style.display = 'flex';
            this.submitBtn.style.opacity = isLoading ? '0.7' : '1';
        }

        if (this.stopBtn) this.stopBtn.style.display = isLoading ? 'flex' : 'none';

        // If loading, hide submit button? No, we want to allow queueing.
        // But we also want to show Stop button.
        // So show BOTH? Or just Stop?
        // If we show Stop, we can't show Submit in the same spot if they overlap.
        // In the HTML, they are siblings.
        // Let's show both if loading.
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

        // If custom message is provided, show it with pulse animation
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
        console.log('[InputBar] showReviewControls called', { count });
        const indicator = this.container.querySelector('#ai-status-indicator');
        const controls = this.container.querySelector('#ai-review-controls');
        const acceptBtn = this.container.querySelector('#ai-review-accept-btn');
        const rejectBtn = this.container.querySelector('#ai-review-reject-btn');

        console.log('[InputBar] Controls found:', {
            indicator: !!indicator,
            controls: !!controls,
            acceptBtn: !!acceptBtn,
            rejectBtn: !!rejectBtn
        });

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
