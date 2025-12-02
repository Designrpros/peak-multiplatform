
/**
 * ChatView.js
 * Manages the Chat UI, event listeners, and DOM updates.
 */

const MCPClient = require('../core/MCPClient');
const ToolRegistry = require('../tools/ToolRegistry');
const DocsRegistry = require('../core/DocsRegistry');
const AgentRegistry = require('../core/AgentRegistry');
const AgentLogger = require('../core/AgentLogger');
const path = require('path');
const { renderMessageCard } = require('./cards/MessageCard');
const { renderCommandResultCard } = require('./cards/CommandResultCard');
const { renderTerminalCard } = require('./cards/TerminalCard');
const InputBar = require('./InputBar');
const { renderMarkdown } = require('../../../utils/markdown');

// Ensure window.markdown is available for MessageCard
if (!window.markdown) {
    window.markdown = { render: renderMarkdown };
}

class ChatView {
    constructor() {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('log', '[ChatView] Constructor called');
            this.client = MCPClient.getInstance();
            this.container = document.getElementById('ai-assist-content');
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
            this.messageQueue = []; // Queue for messages sent while streaming

            // Load active docs from local storage or default to all
            const savedDocs = localStorage.getItem('peak-active-docs');
            ipcRenderer.send('log', '[ChatView] Saved docs:', savedDocs);

            ipcRenderer.send('log', '[ChatView] DocsRegistry type:', typeof DocsRegistry);
            if (Array.isArray(DocsRegistry)) {
                ipcRenderer.send('log', '[ChatView] DocsRegistry is array, length:', DocsRegistry.length);
            } else {
                ipcRenderer.send('log', '[ChatView] DocsRegistry is NOT array:', DocsRegistry);
            }

            this.activeDocs = savedDocs ? JSON.parse(savedDocs) : DocsRegistry.map(d => d.id);
            ipcRenderer.send('log', '[ChatView] Active docs initialized');

            this.isAgentMode = localStorage.getItem('peak-agent-mode') === 'true';
            this.currentAgentId = null; // Track current agent to detect switches

            console.log('[ChatView] Initialized with Debug Logging (Step 212)');
            this.init();
        } catch (e) {
            console.error('[ChatView] Constructor Error:', e);
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('log', '[ChatView] Constructor Error:', e.message);
        }
    }

    init() {
        try {
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('log', '[ChatView] init() called');
            console.log('[ChatView] Initializing...');

            ipcRenderer.send('log', '[ChatView] calling attachListeners()...');
            this.attachListeners();
            ipcRenderer.send('log', '[ChatView] attachListeners() finished');

            // Ensure we are in the correct project context
            if (window.currentProjectRoot) {
                ipcRenderer.send('log', '[ChatView] Switching to project root:', window.currentProjectRoot);
                this.client.switchProject(window.currentProjectRoot);
            } else {
                ipcRenderer.send('log', '[ChatView] No currentProjectRoot found in window');
            }

            // Listen for project root updates (fixes race condition)
            this.handleProjectRootUpdateBound = this.handleProjectRootUpdate.bind(this);
            window.addEventListener('peak-project-root-updated', this.handleProjectRootUpdateBound);

            // Listen for agent updates (e.g. reordering in settings)
            window.addEventListener('peak-agents-updated', () => {
                console.log('[ChatView] Agents updated, re-rendering input bar...');
                this.renderInputBar();
            });

            // Trigger background fetch of remote tools
            ToolRegistry.getTools().then(() => {
                console.log('[ChatView] Remote tools fetched, re-rendering input bar...');
                this.renderInputBar();
            }).catch(e => console.error('[ChatView] Failed to fetch remote tools:', e));

            this.renderHistory();
            ipcRenderer.send('log', '[ChatView] renderHistory() finished');

            this.renderDocsMenu();
            ipcRenderer.send('log', '[ChatView] init() finished');
        } catch (e) {
            console.error('[ChatView] Init Error:', e);
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('log', '[ChatView] Init Error:', e.message);
            if (this.chatThread) {
                this.chatThread.innerHTML = `<div style="color:red; padding:20px;">Error initializing ChatView: ${e.message}</div>`;
            }
        }
    }

    attachListeners() {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] attachListeners started');

        // Define InputBar callbacks
        this.inputBarCallbacks = {
            onSubmit: (value) => this.handleSubmit(value),
            onStop: () => {
                this.client.abort();
                if (this.isAgentMode) {
                    const AgentOrchestrator = require('../core/AgentOrchestrator');
                    AgentOrchestrator.stopLoop();
                }
            },
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
            onAddFile: () => this.handleAddFile(),
            onAddActiveFile: () => this.sendActiveFileToAI(),
            onAgentModeToggle: (enabled) => {
                this.isAgentMode = enabled;
                localStorage.setItem('peak-agent-mode', enabled);
                console.log('[ChatView] Agent Mode toggled:', enabled);
            },
            onDocsMenuToggle: (menu) => this.renderDocsMenu(menu),
            onDocsMenuClick: (e) => {
                const item = e.target.closest('.menu-item');
                if (!item) return;
                const action = item.dataset.action;
                if (action === 'insert-doc') {
                    const docId = item.dataset.doc;
                    this.handleDocAction(action, docId);
                }
            }
        };

        // Attach InputBar listeners
        this.inputBar.attachListeners(this.container, this.inputBarCallbacks);

        // Stream Events
        this.handleStreamUpdateBound = (e) => this.updateStreamingMessage(e.detail);
        this.handleStreamCompleteBound = (e) => this.finalizeStreamingMessage(e.detail);

        window.addEventListener('mcp:stream-update', this.handleStreamUpdateBound);
        window.addEventListener('mcp:stream-complete', this.handleStreamCompleteBound);

        // Auto-Naming Trigger
        window.addEventListener('mcp:stream-complete', () => {
            if (this.client && this.client.history.length > 0 && this.client.history.length < 4) {
                const sessions = this.client.getSessions();
                // Filter out empty sessions AND the current session
                const nonEmptySessions = sessions.filter(s => {
                    // Exclude current session
                    if (s.id === this.client.currentSessionId) return false;

                    if (!s.history || s.history.length === 0) return false;

                    // Filter out effectively empty sessions
                    const hasVisibleContent = s.history.some(msg => {
                        if (msg.role === 'system') return false;
                        if (msg.content && msg.content.toLowerCase() === 'continue') return false;
                        return true;
                    });

                    return hasVisibleContent;
                });

                if (nonEmptySessions.length > 0) {
                    const current = sessions.find(s => s.id === this.client.currentSessionId);
                    if (current && (current.title === 'New Chat' || current.title.startsWith('New Chat'))) {
                        console.log('[ChatView] Triggering auto-naming...');
                        this.client.generateSessionTitle();
                    }
                }
            }
        });

        // Agent Active Change Event
        window.addEventListener('agent:active-change', (e) => {
            console.log('[ChatView] Active agent changed:', e.detail.agent.name);
            this.activeStreamAgent = e.detail.agent;

            // Collapse previous messages
            const openDetails = this.chatThread.querySelectorAll('details.message-card-minimal[open]');
            openDetails.forEach(details => {
                // Don't close the one we are about to create (though it doesn't exist yet)
                // Just close everything. The new one will be created with 'open'.
                details.removeAttribute('open');
            });

            // Force creation of a new card for the new agent
            // We set streamingMessageDiv to null to ensure createStreamingMessage makes a new one
            this.streamingMessageDiv = null;
            this.createStreamingMessage(e.detail.agent);
        });

        // Agent Waiting Review (Pause)
        window.addEventListener('peak-agent-waiting-review', (e) => {
            console.log('[ChatView] Agent waiting for review');
            this.inputBar.updateStatus('ready', 'Waiting for review...');

            // Show Continue Button in InputBar (reusing review controls or adding new one)
            // We'll use a custom "Continue" button injection for now or reuse Accept All if appropriate
            // Actually, let's just ensure the user knows they need to Accept/Reject and then Continue.

            // We can inject a "Continue" button into the chat or input bar.
            // Let's use the input bar's review controls but customize them.

            this.inputBar.showReviewControls(0, () => {
                // On "Continue" (mapped to Accept button visually)
                const AgentOrchestrator = require('../core/AgentOrchestrator');
                AgentOrchestrator.resumeLoop();
                this.inputBar.hideReviewControls();
                this.inputBar.updateStatus('thinking');
            }, () => {
                // On "Stop" (mapped to Reject button visually)
                // Maybe stop the loop?
                const AgentOrchestrator = require('../core/AgentOrchestrator');
                AgentOrchestrator.finishLoop(); // We need to expose this or just set isLoopActive = false
                this.inputBar.hideReviewControls();
                this.inputBar.updateStatus('ready');
            });

            // Customize button text
            const acceptBtn = document.getElementById('ai-review-accept-btn');
            if (acceptBtn) {
                acceptBtn.textContent = "Continue Chain";
                acceptBtn.style.background = "var(--peak-accent)";
            }
            const rejectBtn = document.getElementById('ai-review-reject-btn');
            if (rejectBtn) {
                rejectBtn.textContent = "Stop Chain";
            }
        });

        // Terminal Response (Auto-Continue)
        this.handleTerminalResponseBound = (e) => this.handleTerminalResponse(e);
        window.addEventListener('peak-terminal-response', this.handleTerminalResponseBound);

        // Tool Actions (Delegation)
        if (this.chatThread) {
            this.handleToolActionBound = (e) => {
                // Log execution attempt
                const btn = e.target.closest('button');
                if (btn && btn.dataset.action) {
                    AgentLogger.tool(`Tool Action: ${btn.dataset.action}`, {
                        action: btn.dataset.action,
                        tool: btn.dataset.tool
                    });
                }
                this.handleToolAction(e);
            };
            this.chatThread.addEventListener('click', this.handleToolActionBound);

            // Listen for auto-run delegation
            this.chatThread.addEventListener('tool-auto-run', (e) => {
                if (e.detail.tool === 'delegate_task') {
                    AgentLogger.tool('Auto-Running Delegation', e.detail.args);
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
            this.renderHistory(true); // Force clear for session switch
        });

        // Listen for Docs Settings Updates
        window.addEventListener('peak-docs-updated', () => {
            console.log('[ChatView] Docs updated, refreshing menu');
            const savedDocs = localStorage.getItem('peak-active-docs');
            this.activeDocs = savedDocs ? JSON.parse(savedDocs) : DocsRegistry.map(d => d.id);
            // We don't need to re-render the whole view, just ensure the next menu open uses fresh data
        });

        // Initial Render
        this.renderHistory();
    }

    renderHistory(forceClear = false) {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] renderHistory called');

        if (!this.chatThread) return;

        // Safety check for history
        if (!this.client || !this.client.history) {
            ipcRenderer.send('log', '[ChatView] History is undefined/null');
            this.chatThread.innerHTML = '';
            this.chatThread.style.height = 'auto';
            this.renderInitialView();
            return;
        }

        ipcRenderer.send('log', '[ChatView] History length:', this.client.history.length, 'Session ID:', this.client.currentSessionId);
        console.log('[ChatView] renderHistory called. Length:', this.client.history.length, 'Session ID:', this.client.currentSessionId);

        // Check if history is empty
        if (this.client.history.length === 0) {
            console.log('[ChatView] History is empty, rendering initial view');
            this.chatThread.innerHTML = '';
            this.chatThread.style.height = 'auto';
            this.renderInitialView();
            return;
        }

        // If forceClear is true (e.g., switching sessions), clear everything first
        if (forceClear) {
            console.log('[ChatView] Force clearing chat for session switch');
            this.chatThread.innerHTML = '';
            this.chatThread.style.height = 'auto';
        }

        // Don't clear existing messages - only append new ones
        // Track how many messages are already rendered
        const existingMessages = forceClear ? 0 : this.chatThread.querySelectorAll('.term-chat-msg, .term-chat-msg-user').length;

        // Only render messages that aren't already in the DOM
        const newMessages = this.client.history.slice(existingMessages);

        if (newMessages.length > 0) {
            newMessages.forEach(msg => {
                // Filter out internal agent handoff messages
                const isHandoffMessage = msg.role === 'user' &&
                    msg.content &&
                    msg.content.includes('Previous Agent Output:');

                if (!isHandoffMessage) {
                    const el = this.createMessageElement(msg.role, msg.content, msg.commitHash, false, msg.agent);
                    if (el) {
                        this.chatThread.appendChild(el);
                    }
                }
            });

            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();
        }
    }

    renderInitialView() {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] renderInitialView called');
        this.chatThread.innerHTML = '';
        // Force full height
        this.chatThread.style.height = '100%';
        this.chatThread.style.flex = '1';
        this.chatThread.style.display = 'flex';
        this.chatThread.style.flexDirection = 'column';

        const container = document.createElement('div');
        container.className = 'initial-view-container';
        // Flex column with space-between to push history to bottom
        container.style.cssText = 'padding: 20px; height: 100%; min-height: 100%; display: flex; flex-direction: column; justify-content: space-between; overflow-y: auto; flex: 1; box-sizing: border-box;';

        // --- TOP SECTION: HEADER & INFO ---
        const topSection = document.createElement('div');
        topSection.style.cssText = 'display: flex; flex-direction: column; gap: 24px;';

        topSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; opacity: 0.8;">
                <div style="width: 24px; height: 24px; background: var(--peak-accent); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="sparkles" style="width: 14px; height: 14px; color: white;"></i>
                </div>
                <h1 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--peak-primary); letter-spacing: -0.02em;">AI Assistant</h1>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <!-- Column 1: Workflow -->
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Workflow</h3>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="map" style="width: 12px; height: 12px; color: var(--peak-accent); opacity: 0.8;"></i>
                            <span><strong>Plan:</strong> Break down tasks</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="code-2" style="width: 12px; height: 12px; color: var(--peak-accent); opacity: 0.8;"></i>
                            <span><strong>Execute:</strong> Write & Edit code</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="check-circle-2" style="width: 12px; height: 12px; color: var(--peak-accent); opacity: 0.8;"></i>
                            <span><strong>Review:</strong> Validate changes</span>
                        </div>
                    </div>
                </div>

                <!-- Column 2: Tools -->
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Power Tools</h3>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <span style="background: var(--control-background-color); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 10px;">@</span>
                            <span>Reference files & symbols</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <span style="background: var(--control-background-color); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 10px;">/</span>
                            <span>Slash commands</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="image" style="width: 12px; height: 12px; color: var(--peak-secondary);"></i>
                            <span>Drag & Drop images</span>
                        </div>
                    </div>
                </div>
            </div>

            <div style="background: var(--control-background-color); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 8px; align-items: flex-start;">
                    <i data-lucide="info" style="width: 14px; height: 14px; color: var(--peak-secondary); margin-top: 1px;"></i>
                    <div style="font-size: 11px; color: var(--peak-secondary); line-height: 1.4;">
                        <strong style="color: var(--peak-primary);">Context Aware:</strong> The AI knows about your active file. Use <strong>@</strong> to add more context explicitly for better results.
                    </div>
                </div>
            </div>
        `;
        container.appendChild(topSection);

        // --- BOTTOM SECTION: HISTORY ---
        const sessions = this.client.getSessions();
        if (sessions.length > 0) {
            const bottomSection = document.createElement('div');
            bottomSection.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-top: 20px;';

            bottomSection.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Recent</h2>
                    <button id="btn-flush-history" style="background: none; border: none; color: var(--peak-secondary); font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 3px; opacity: 0.6; transition: opacity 0.1s;">
                        Clear
                    </button>
                </div>
                <div id="recent-sessions-list" style="display: flex; flex-direction: column; gap: 4px;">
                    <!-- Sessions injected here -->
                </div>
            `;

            const list = bottomSection.querySelector('#recent-sessions-list');
            // Show fewer sessions to keep it compact (max 5)
            sessions.slice(0, 5).forEach(session => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-secondary);';

                // Truncate title
                const title = session.title || 'Untitled Chat';
                const displayTitle = title.length > 35 ? title.substring(0, 35) + '...' : title;

                // Format time (e.g., "2h ago")
                const timeAgo = this.getTimeAgo(session.lastModified);

                item.innerHTML = `
                    <i data-lucide="message-square" style="width: 12px; height: 12px; opacity: 0.7;"></i>
                    <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--peak-primary);">${displayTitle}</span>
                    <span style="font-size: 9px; opacity: 0.6;">${timeAgo}</span>
                `;

                item.onmouseover = () => {
                    item.style.background = 'var(--control-background-color)';
                    item.style.color = 'var(--peak-primary)';
                };
                item.onmouseout = () => {
                    item.style.background = 'transparent';
                    item.style.color = 'var(--peak-secondary)';
                };
                item.onclick = () => {
                    this.client.loadSession(session.id);
                };
                list.appendChild(item);
            });

            // Clear button logic
            const clearBtn = bottomSection.querySelector('#btn-flush-history');
            if (clearBtn) {
                clearBtn.onmouseover = () => clearBtn.style.opacity = '1';
                clearBtn.onmouseout = () => clearBtn.style.opacity = '0.6';
                clearBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (confirm('Clear all chat history?')) {
                        localStorage.removeItem('peak-chat-sessions');
                        this.renderInitialView(); // Re-render
                    }
                };
            }

            container.appendChild(bottomSection);
        }

        this.chatThread.appendChild(container);
        if (window.lucide) window.lucide.createIcons();
    }

    // Helper for time ago
    getTimeAgo(timestamp) {
        if (!timestamp) return '';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return `${minutes}m`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h`;
        const days = Math.floor(hours / 24);
        return `${days}d`;
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

        messages.forEach((msg, index) => {
            if (index < 3) {
                try { require('electron').ipcRenderer.send('log', `[ChatView] History msg[${index}] agent:`, msg.agent); } catch (e) { }
            }
            const el = this.createMessageElement(msg.role, msg.content, msg.commitHash, false, msg.agent);
            if (el) { // Only append if element is valid
                fragment.appendChild(el);
            }
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

        // --- GENERAL SETTINGS ---
        const generalHeader = document.createElement('div');
        generalHeader.className = 'settings-group-header';
        generalHeader.textContent = 'General';
        generalHeader.style.marginTop = '0';
        listContainer.appendChild(generalHeader);

        const generalSettings = [
            { id: 'peak-auto-accept-list', label: 'Auto-accept List Directory', default: true },
            { id: 'peak-auto-accept-read', label: 'Auto-accept Read File / URL', default: true },
            { id: 'peak-auto-accept-create', label: 'Auto-accept Create File', default: false },
            { id: 'peak-auto-accept-edit', label: 'Auto-accept Edit File', default: false },
            { id: 'peak-auto-accept-run', label: 'Auto-accept Run Command', default: false },
        ];

        generalSettings.forEach(setting => {
            const item = document.createElement('div');
            item.className = 'settings-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = setting.id;
            checkbox.checked = localStorage.getItem(setting.id) === null ? setting.default : localStorage.getItem(setting.id) === 'true';

            checkbox.addEventListener('change', (e) => {
                localStorage.setItem(setting.id, e.target.checked);
            });

            const label = document.createElement('label');
            label.htmlFor = setting.id;
            label.style.cursor = 'pointer';
            label.textContent = setting.label;

            item.appendChild(checkbox);
            item.appendChild(label);
            listContainer.appendChild(item);
        });

        // --- AGENT SETTINGS ---
        const agentHeader = document.createElement('div');
        agentHeader.className = 'settings-group-header';
        agentHeader.textContent = 'Agents';
        listContainer.appendChild(agentHeader);

        try {
            this.renderAgentSettings(listContainer);
        } catch (e) {
            console.error('[ChatView] Error rendering agent settings:', e);
            const errDiv = document.createElement('div');
            errDiv.style.color = 'red';
            errDiv.textContent = 'Error loading agent settings';
            listContainer.appendChild(errDiv);
        }

        // --- PROJECT MEMORY SETTINGS ---
        try {
            console.log('[ChatView] Rendering Project Memory settings...');
            const memoryHeader = document.createElement('div');
            memoryHeader.className = 'settings-group-header';
            memoryHeader.textContent = 'Project Memory (Global Context)';
            listContainer.appendChild(memoryHeader);

            const memoryContainer = document.createElement('div');
            memoryContainer.className = 'settings-item';
            memoryContainer.style.flexDirection = 'column';
            memoryContainer.style.alignItems = 'flex-start';
            memoryContainer.style.gap = '8px';

            const memoryDesc = document.createElement('div');
            memoryDesc.style.fontSize = '11px';
            memoryDesc.style.color = 'var(--peak-secondary)';
            memoryDesc.textContent = 'Persistent instructions or context for this project. The AI will see this in every message.';
            memoryContainer.appendChild(memoryDesc);

            const memoryTextarea = document.createElement('textarea');
            memoryTextarea.style.width = '100%';
            memoryTextarea.style.height = '100px';
            memoryTextarea.style.background = 'var(--input-background-color)';
            memoryTextarea.style.border = '1px solid var(--border-color)';
            memoryTextarea.style.borderRadius = '4px';
            memoryTextarea.style.color = 'var(--peak-primary)';
            memoryTextarea.style.padding = '8px';
            memoryTextarea.style.fontSize = '12px';
            memoryTextarea.style.resize = 'vertical';

            // Load current memory
            const currentRoot = window.currentProjectRoot || (this.client && this.client.currentProjectRoot);
            console.log('[ChatView] Current root for memory:', currentRoot);

            if (currentRoot) {
                if (this.client && typeof this.client.getProjectMemory === 'function') {
                    memoryTextarea.value = this.client.getProjectMemory(currentRoot);
                } else {
                    console.error('[ChatView] client.getProjectMemory is not a function', this.client);
                    memoryTextarea.value = 'Error: Client memory feature unavailable.';
                }
            } else {
                memoryTextarea.placeholder = 'Open a project to set memory...';
                memoryTextarea.disabled = true;
            }

            const saveBtn = document.createElement('button');
            saveBtn.textContent = 'Save Memory';
            saveBtn.style.padding = '4px 12px';
            saveBtn.style.background = 'var(--peak-accent)';
            saveBtn.style.color = 'white';
            saveBtn.style.border = 'none';
            saveBtn.style.borderRadius = '4px';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.fontSize = '11px';
            saveBtn.style.alignSelf = 'flex-end';

            saveBtn.onclick = () => {
                if (currentRoot && this.client) {
                    this.client.saveProjectMemory(currentRoot, memoryTextarea.value);
                    const originalText = saveBtn.textContent;
                    saveBtn.textContent = 'Saved!';
                    setTimeout(() => saveBtn.textContent = originalText, 1500);
                }
            };

            memoryContainer.appendChild(memoryTextarea);
            memoryContainer.appendChild(saveBtn);
            listContainer.appendChild(memoryContainer);
        } catch (e) {
            console.error('[ChatView] Error rendering project memory settings:', e);
        }

        // --- DOCS SETTINGS ---
        const docsHeader = document.createElement('div');
        docsHeader.className = 'settings-group-header';
        docsHeader.textContent = 'Documentation';
        listContainer.appendChild(docsHeader);
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

    renderAgentSettings(container) {
        const agents = AgentRegistry.getAgents();
        // Load chain config
        let chainConfig = [];
        try {
            chainConfig = JSON.parse(localStorage.getItem('peak-agent-chain-config') || '["planner", "code-expert", "code-reviewer"]');
        } catch (e) {
            chainConfig = ['planner', 'code-expert', 'code-reviewer'];
        }

        agents.forEach(agent => {
            const item = document.createElement('div');
            item.className = 'settings-item';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';
            item.style.padding = '8px 0';
            item.style.borderBottom = '1px solid var(--border-color)';

            // Left: Color + Name
            const leftDiv = document.createElement('div');
            leftDiv.style.display = 'flex';
            leftDiv.style.alignItems = 'center';
            leftDiv.style.gap = '10px';

            // Color Picker
            const colorInput = document.createElement('input');
            colorInput.type = 'color';
            colorInput.value = agent.color || '#666666';
            colorInput.style.width = '24px';
            colorInput.style.height = '24px';
            colorInput.style.border = 'none';
            colorInput.style.padding = '0';
            colorInput.style.background = 'none';
            colorInput.style.cursor = 'pointer';
            colorInput.title = 'Change Agent Color';

            colorInput.onchange = (e) => {
                agent.color = e.target.value;
                AgentRegistry.saveAgent(agent);
                // Update UI if needed (re-render not strictly necessary for color but good)
            };

            const nameSpan = document.createElement('span');
            nameSpan.textContent = agent.name;
            nameSpan.style.fontWeight = '500';
            nameSpan.style.fontSize = '13px';

            leftDiv.appendChild(colorInput);
            leftDiv.appendChild(nameSpan);

            // Right: Chain Toggle + Delete
            const rightDiv = document.createElement('div');
            rightDiv.style.display = 'flex';
            rightDiv.style.alignItems = 'center';
            rightDiv.style.gap = '10px';

            // Chain Toggle
            const chainLabel = document.createElement('label');
            chainLabel.style.display = 'flex';
            chainLabel.style.alignItems = 'center';
            chainLabel.style.gap = '4px';
            chainLabel.style.fontSize = '11px';
            chainLabel.style.color = 'var(--peak-secondary)';
            chainLabel.style.cursor = 'pointer';
            chainLabel.title = 'Include in Multi-Agent Chain';

            const chainCheckbox = document.createElement('input');
            chainCheckbox.type = 'checkbox';
            chainCheckbox.checked = chainConfig.includes(agent.id);
            chainCheckbox.onchange = (e) => {
                if (e.target.checked) {
                    if (!chainConfig.includes(agent.id)) chainConfig.push(agent.id);
                } else {
                    chainConfig = chainConfig.filter(id => id !== agent.id);
                }
                localStorage.setItem('peak-agent-chain-config', JSON.stringify(chainConfig));
            };

            chainLabel.appendChild(chainCheckbox);
            chainLabel.appendChild(document.createTextNode('Chain'));
            rightDiv.appendChild(chainLabel);

            if (!agent.isSystem) {
                const deleteBtn = document.createElement('button');
                deleteBtn.innerHTML = '<i data-lucide="trash-2" style="width:14px; height:14px;"></i>';
                deleteBtn.style.background = 'none';
                deleteBtn.style.border = 'none';
                deleteBtn.style.color = 'var(--peak-error-text, #dc2626)';
                deleteBtn.style.cursor = 'pointer';
                deleteBtn.style.opacity = '0.7';
                deleteBtn.title = 'Delete Agent';
                deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
                deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.7';

                deleteBtn.onclick = () => {
                    if (confirm(`Are you sure you want to delete agent "${agent.name}"?`)) {
                        AgentRegistry.deleteAgent(agent.id);
                        this.renderSettings(); // Re-render list
                    }
                };
                rightDiv.appendChild(deleteBtn);
            } else {
                // Lock icon for system agents
                const lockIcon = document.createElement('i');
                lockIcon.dataset.lucide = 'lock';
                lockIcon.style.width = '12px';
                lockIcon.style.height = '12px';
                lockIcon.style.color = 'var(--peak-secondary)';
                lockIcon.style.opacity = '0.5';
                lockIcon.title = 'System Agent (Cannot be deleted)';
                rightDiv.appendChild(lockIcon);
            }

            item.appendChild(leftDiv);
            item.appendChild(rightDiv);
            container.appendChild(item);
        });
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
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] handleSubmit called. valueOverride:', valueOverride);

        let prompt = valueOverride || this.inputBar.inputArea.value.trim();
        const attachments = this.inputBar.getAttachments();

        if (!prompt && attachments.length === 0) return;

        // Construct Multimodal Content if attachments exist
        if (attachments.length > 0) {
            const images = attachments.filter(a => a.type === 'image');
            const files = attachments.filter(a => a.type === 'file');

            // Append text files to prompt
            if (files.length > 0) {
                const fileContexts = files.map(f => `\n\n[Attached File: ${f.name}]\n\`\`\`\n${f.content}\n\`\`\``).join('');
                prompt += fileContexts;
            }

            // If images exist, create array content
            if (images.length > 0) {
                const contentArray = [];
                if (prompt) {
                    contentArray.push({ type: 'text', text: prompt });
                }
                images.forEach(img => {
                    contentArray.push({
                        type: 'image_url',
                        image_url: {
                            url: img.content // Base64
                        }
                    });
                });
                prompt = contentArray;
            }
        }

        ipcRenderer.send('log', '[ChatView] handleSubmit prompt:', typeof prompt === 'object' ? 'Multimodal Array' : prompt);

        this.processUserMessage(prompt);
        this.inputBar.clearAttachments();
    }

    async handleTerminalResponse(e) {
        const { cmd, output } = e.detail;

        // Determine success (heuristic: exit code usually not available here, so assume success if output doesn't start with "Error:" or similar)
        // For now, we'll just show it.

        const blockHtml = renderTerminalCard(cmd, output, true);

        // Append to Chat
        const msgDiv = document.createElement('div');
        msgDiv.className = 'term-chat-msg system';
        msgDiv.style.width = '100%'; // Ensure full width
        msgDiv.innerHTML = blockHtml;
        this.chatThread.appendChild(msgDiv);

        // Add toggle listener for this specific card
        const toggleBtn = msgDiv.querySelector('.toggle-terminal-btn');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                const card = e.target.closest('.terminal-card');
                const outputBlock = card.querySelector('.terminal-output-block');
                const icon = toggleBtn.querySelector('[data-lucide]');

                if (outputBlock) {
                    const isHidden = outputBlock.style.display === 'none';
                    outputBlock.style.display = isHidden ? 'block' : 'none';

                    // Rotate icon
                    icon.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
                    icon.style.transition = 'transform 0.2s';
                }
            });
        }

        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();

        // FIX: Add terminal output to chat history so AI can see the command results
        // This matches the behavior of the tool-run-btn handler (lines 2014-2018)
        const outputContent = `Command: ${cmd}\n\n[OUTPUT]\n\`\`\`\n${output}\n\`\`\``;

        this.client.history.push({
            role: 'system',
            content: `Command Execution Result:\n${outputContent}`
        });
        this.client.saveHistory();

        // Auto-continue: Send to AI automatically
        this.processUserMessage('continue', true);

        // (Optional) Add Continue Button for manual override if auto-continue is disabled  
        // const actionDiv = document.createElement('div');
        // actionDiv.style.marginTop = '8px';
        // actionDiv.style.display = 'flex';
        // actionDiv.style.justifyContent = 'flex-end';

        // const continueBtn = document.createElement('button');
        // continueBtn.className = 'msg-action-btn';
        // continueBtn.style.cssText = 'background:var(--peak-accent); color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; display:flex; align-items:center; gap:6px; font-size:11px; font-weight:500; transition: opacity 0.2s;';
        // continueBtn.innerHTML = `<i data-lucide="arrow-right" style="width:12px; height:12px;"></i> Continue`;

        // continueBtn.onclick = async () => {
        //     // Disable button
        //     continueBtn.disabled = true;
        //     continueBtn.style.opacity = '0.7';
        //     continueBtn.innerHTML = `<i data-lucide="loader-2" style="width:12px; height:12px; animation:spin 1s linear infinite;"></i> Sending...`;

        //     // Send to AI
        //     const message = `Command executed: \`${cmd}\`\nOutput:\n\`\`\`\n${output}\n\`\`\`\n\n`;

        //     this.inputBar.setLoading(true);
        //     this.createStreamingMessage();

        //     const agentSelect = document.getElementById('ai-assist-agent-select');
        //     const agentId = agentSelect ? agentSelect.value : null;

        //     const context = await this.getProjectContext([]);
        //     const agent = AgentRegistry.getAgent(agentId);
        //     const modelId = agent ? agent.modelId : null;

        //     try {
        //         await this.client.sendMessage(message, context, modelId);
        //         // Remove button after successful send to keep chat clean
        //         actionDiv.remove();
        //     } catch (err) {
        //         console.error("Failed to send command output:", err);
        //         continueBtn.disabled = false;
        //         continueBtn.style.opacity = '1';
        //         continueBtn.innerHTML = `<i data-lucide="alert-circle" style="width:12px; height:12px;"></i> Retry`;
        //         this.appendMessage('system', `Error sending output: ${err.message}`);
        //         this.inputBar.setLoading(false);
        //     }
        // };

        // actionDiv.appendChild(continueBtn);
        // msgDiv.appendChild(actionDiv);

        // if (window.lucide) window.lucide.createIcons();
        // this.scrollToBottom();
    }

    async processUserMessage(prompt, isAuto = false) {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] processUserMessage called. Prompt:', prompt);

        // Queueing Logic
        if (this.client.isStreaming) {
            console.log('[ChatView] Client is streaming, queueing message:', prompt);
            this.messageQueue.push({ prompt, isAuto });
            return;
        }

        // Get selected agent and mode from InputBar
        const agentId = this.inputBar.agentSelect ? this.inputBar.agentSelect.value : 'planner';
        const mode = this.inputBar.modeSelect ? this.inputBar.modeSelect.value : 'auto';

        ipcRenderer.send('log', '[ChatView] processUserMessage - agentId:', agentId, 'mode:', mode);

        try {
            // Get selected agent (mode is now always 'auto')
            const agent = AgentRegistry.getAgent(agentId);

            // Ensure modelId is never null - fallback to openrouter/auto
            const modelId = (agent && agent.modelId) || 'openrouter/auto';

            // Get mode-based system prompt and inject project root
            const { getSystemPrompt } = require('../core/SystemPrompt');
            const projectRoot = window.currentProjectRoot || (this.client && this.client.context && this.client.context.root) || '/project';

            console.log('[ChatView] Loading system prompt. Mode:', mode, 'Agent:', agentId, 'Has custom prompt:', !!(agent && agent.systemPrompt));

            let systemPrompt = agent && agent.systemPrompt
                ? agent.systemPrompt
                : await getSystemPrompt(mode);

            console.log('[ChatView] System prompt loaded. Length:', systemPrompt ? systemPrompt.length : 'NULL');

            // Replace {{PROJECT_ROOT}} placeholder with actual project path (if prompt exists)
            if (systemPrompt && typeof systemPrompt === 'string') {
                systemPrompt = systemPrompt.replace(/\{\{PROJECT_ROOT\}\}/g, projectRoot);

                // SAFETY NET: Ensure tool definitions are present
                if (!systemPrompt.includes('<tool_definition>') && !systemPrompt.includes('TOOLS AVAILABLE')) {
                    console.warn('[ChatView] System prompt missing tools. Injecting defaults.');
                    const tools = await ToolRegistry.getSystemPromptTools();
                    systemPrompt += `\n\n# TOOLS AVAILABLE\n${tools}\n\n# MANDATORY RULES\n1. Use tools for all file operations.\n2. Do not output code blocks for files.`;
                }

                console.log('[ChatView] Project root injected:', projectRoot);
            } else {
                console.error('[ChatView] Invalid system prompt:', systemPrompt);
                systemPrompt = await getSystemPrompt('hybrid'); // Fallback to hybrid mode
                if (systemPrompt) {
                    systemPrompt = systemPrompt.replace(/\{\{PROJECT_ROOT\}\}/g, projectRoot);
                }
            }


            // UI Updates
            this.inputBar.setLoading(true);
            this.inputBar.updateStatus('thinking', 'Analyzing request...');

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
            this.appendMessage('user', prompt, commitHash, isAuto);

            // Log to agent logger
            const promptLog = Array.isArray(prompt) ? 'Multimodal Request' : prompt.substring(0, 100);
            AgentLogger.agent('User message sent', { prompt: promptLog, mode, agentId });

            // Create AI Placeholder (only if not already streaming/continuing)
            this.inputBar.updateStatus('thinking', 'Processing request...');

            // Check if agent switched - if so, always create new card
            const agentSwitched = this.currentAgentId !== null && this.currentAgentId !== agentId;

            // ALWAYS create a new card for each AI response to preserve history
            // This ensures users can see the full conversation thread
            if (agentSwitched) {
                console.log(`[ChatView] Agent switched from ${this.currentAgentId} to ${agentId}, creating new card`);
            }
            // Create new streaming message for every turn
            console.log('[ChatView] Creating new streaming message');
            this.createStreamingMessage(agent);
            this.currentAgentId = agentId; // Update tracked agent

            // Get Context
            const context = await this.getProjectContext(filesToSend, docsToSend);

            // Send to Client
            if (this.isAgentMode && !isAuto) {
                // Trigger Multi-Agent Loop
                const AgentOrchestrator = require('../core/AgentOrchestrator');

                // Load chain config from Registry (respecting order and enabled state)
                const agents = AgentRegistry.getAgents();

                // For Hierarchical Mode, we start with ROOT agents that are enabled for chaining
                // A "Root" agent is one with no parent (or invalid parent)
                let rootAgents = agents.filter(a => a.isChainEnabled && (!a.parentId || !agents.find(p => p.id === a.parentId))).map(a => a.id);

                // Ensure at least one agent (fallback to default if empty)
                if (rootAgents.length === 0) {
                    // Fallback: If no chain-enabled agents, maybe just run the selected agent?
                    // Or fallback to default planner if nothing selected.
                    rootAgents = ['planner'];
                }

                await AgentOrchestrator.startLoop(prompt, context, rootAgents);
            } else {
                // Single Agent Mode
                await this.client.sendMessage(prompt, context, modelId, commitHash, systemPrompt, agent);
            }
        } catch (err) {
            console.error('[ChatView] processUserMessage failed:', err);
            this.appendMessage('system', `Error processing request: ${err.message}`);
            this.inputBar.setLoading(false);
            this.inputBar.updateStatus('ready');
        }
    }

    createMessageElement(role, content, commitHash = null, isAuto = false, agent = null) {
        // Resolve agent if it's a string (ID)
        if (typeof agent === 'string') {
            const resolved = AgentRegistry.getAgent(agent);
            try { require('electron').ipcRenderer.send('log', '[ChatView] Resolved agent from string:', agent, '->', resolved ? resolved.name : 'null'); } catch (e) { }
            agent = resolved;
        }

        console.log(`[ChatView] createMessageElement called. Role: ${role}, Content Length: ${content ? (typeof content === 'string' ? content.length : 'Multimodal') : 0}`);

        let displayContent = content;

        // Handle Multimodal User Message Display
        if (role === 'user' && Array.isArray(content)) {
            // Extract text and images for display
            const textPart = content.find(c => c.type === 'text')?.text || '';
            const images = content.filter(c => c.type === 'image_url');

            let html = '';
            if (images.length > 0) {
                html += `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
                    ${images.map(img => `<img src="${img.image_url.url}" style="max-width:200px; max-height:200px; border-radius:6px; border:1px solid var(--border-color);">`).join('')}
                </div>`;
            }
            html += textPart ? renderMarkdown(textPart) : '';
            displayContent = html;
        } else {
            displayContent = content;
        }

        let isHtml = role === 'user' && Array.isArray(content);

        // If assistant message, parse it with StreamParser to restore tool cards
        // We only do this for history rendering (where this method is used)
        if (role === 'assistant' && this.client.parser) {
            displayContent = this.client.parser.parse(content);
            isHtml = true;
        }

        const html = renderMessageCard(role, displayContent, commitHash, true, isAuto, agent, isHtml);

        // Handle hidden messages (e.g. "continue")
        if (!html) {
            console.log('[ChatView] renderMessageCard returned null (hidden message)');
            return null;
        }

        const temp = document.createElement('div');
        temp.innerHTML = html;
        const messageElement = temp.firstElementChild;

        if (!messageElement) {
            console.error('[ChatView] Failed to create message element from HTML');
            return null;
        }

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

    appendMessage(role, content, commitHash = null, isAuto = false, agent = null) {
        console.log(`[ChatView] appendMessage called. Role: ${role}, Content length: ${content ? content.length : 0}`);
        // Clear Initial View if present
        if (this.chatThread.querySelector('.initial-view-container')) {
            this.chatThread.innerHTML = '';
            this.chatThread.style.height = 'auto'; // Reset height
        }

        const messageElement = this.createMessageElement(role, content, commitHash, isAuto, agent);
        if (messageElement) {
            console.log('[ChatView] Appending message element to thread');
            this.chatThread.appendChild(messageElement);
        } else {
            console.warn('[ChatView] createMessageElement returned null');
        }
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

        // Merge explicitly selected docs with globally active docs
        const allDocs = new Set([...(selectedDocs || []), ...this.activeDocs]);

        if (allDocs.size > 0) {
            const fs = require('fs');
            const path = require('path');
            const docsDir = path.join(__dirname, '..', 'docs');
            context.documentation = []; // New field for docs

            for (const docIdOrName of allDocs) {
                // Resolve doc from Registry
                const docDef = DocsRegistry.find(d => d.id === docIdOrName || d.filename === docIdOrName);

                if (docDef) {
                    if (docDef.type === 'local') {
                        try {
                            const docPath = path.join(docsDir, docDef.filename);
                            if (fs.existsSync(docPath)) {
                                const content = fs.readFileSync(docPath, 'utf8');
                                context.documentation.push({
                                    name: docDef.name,
                                    type: 'content',
                                    content: content
                                });
                            }
                        } catch (e) {
                            console.error("Failed to read doc:", docDef.name, e);
                        }
                    } else if (docDef.type === 'external') {
                        context.documentation.push({
                            name: docDef.name,
                            type: 'url',
                            url: docDef.url
                        });
                    }
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



    createStreamingMessage(agent = null) {
        // Resolve agent if it's a string (ID)
        if (typeof agent === 'string') {
            agent = AgentRegistry.getAgent(agent);
        }
        this.streamingAgent = agent;
        const html = renderMessageCard('assistant', '', null, false, false, agent);

        this.streamingMessageDiv = document.createElement('div');
        // We don't need extra classes here because renderMessageCard returns the full wrapper
        // But renderMessageCard returns a string.
        // Wait, renderMessageCard returns the OUTER div with class "term-chat-msg".
        // So we should just set innerHTML of a container, or create a temp div and get first child.

        const temp = document.createElement('div');
        temp.innerHTML = html;
        this.streamingMessageDiv = temp.firstElementChild;

        this.chatThread.appendChild(this.streamingMessageDiv);

        // Cache the content div for updates
        this.streamingContentDiv = this.streamingMessageDiv.querySelector('.markdown-content');

        this.scrollToBottom();
    }

    updateStreamingMessage({ html }) {
        // CRITICAL FIX: StreamParser returns BOTH markdown content AND tool cards (command cards, etc.)
        // We need to insert into .message-content-minimal (the parent wrapper), not just .markdown-content
        // Otherwise tool cards won't be visible!

        console.log('[ChatView] updateStreamingMessage called. HTML length:', html?.length);
        console.log('[ChatView] HTML preview:', html?.substring(0, 200));

        const messageContentWrapper = this.streamingMessageDiv?.querySelector('.message-content-minimal');
        console.log('[ChatView] messageContentWrapper found:', !!messageContentWrapper);

        if (messageContentWrapper) {
            // Insert all content (markdown + tool cards) into the wrapper
            // Preserve the divider at the start
            const divider = messageContentWrapper.querySelector('.message-divider');
            messageContentWrapper.innerHTML = '';
            if (divider) messageContentWrapper.appendChild(divider);

            // Insert the parsed HTML content
            messageContentWrapper.insertAdjacentHTML('beforeend', html);

            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();
        } else if (this.streamingContentDiv) {
            console.log('[ChatView] Fallback to streamingContentDiv');
            // Fallback to old behavior if new structure not found
            this.streamingContentDiv.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();
        } else if (this.streamingMessageDiv) {
            console.log('[ChatView] Fallback to streamingMessageDiv');
            // Last resort fallback
            this.streamingMessageDiv.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
            this.scrollToBottom();
        } else {
            console.error('[ChatView] No target div found for streaming update');
        }
    }

    finalizeStreamingMessage({ html, error }) {
        console.log('[ChatView] finalizeStreamingMessage called', { hasDiv: !!this.streamingMessageDiv, error });
        console.log('[ChatView] Final HTML length:', html?.length);
        console.log('[ChatView] Final HTML preview:', html?.substring(0, 300));

        if (this.streamingMessageDiv) {
            // Re-render as complete message (collapsible)
            // CRITICAL FIX: Pass isHtml=true (7th arg) because 'html' is already parsed HTML from StreamParser.
            const finalHtml = renderMessageCard('assistant', html, null, true, false, this.activeStreamAgent || this.streamingAgent || this.currentAgent, true);

            // Replace the streaming div with the final one
            const temp = document.createElement('div');
            temp.innerHTML = finalHtml;
            const finalDiv = temp.firstElementChild;

            this.streamingMessageDiv.replaceWith(finalDiv);
            this.streamingMessageDiv = finalDiv; // Update reference for button logic below

            // We don't need to set innerHTML again because renderMessageCard included the content
            // But wait, the button logic below expects to find buttons in this.streamingMessageDiv
            // which is now the finalDiv. That works.

            // NEW: Trigger Review Mode instead of Auto-Execute
            const buttons = this.streamingMessageDiv.querySelectorAll('.tool-create-btn, .tool-run-btn, .tool-view-btn, .tool-search-btn, .tool-delete-btn, .tool-delegate-btn, .file-action-btn-compact, .tool-action-btn-compact');

            console.log('[ChatView] Found buttons in DOM:', buttons.length);
            buttons.forEach((b, i) => console.log(`[ChatView] Button ${i}:`, b.className, 'Disabled:', b.disabled, 'Type:', b.dataset.type));

            // Filter out disabled buttons AND reject buttons
            const pendingButtons = Array.from(buttons).filter(btn => !btn.disabled && btn.dataset.type !== 'reject');

            console.log('[ChatView] Pending buttons (actionable):', pendingButtons.length);

            if (pendingButtons.length > 0) {
                // --- AUTO-ACCEPT LOGIC ---
                const settings = {
                    list: localStorage.getItem('peak-auto-accept-list') !== 'false', // Default true
                    read: localStorage.getItem('peak-auto-accept-read') !== 'false', // Default true
                    create: localStorage.getItem('peak-auto-accept-create') === 'true', // Default false
                    edit: localStorage.getItem('peak-auto-accept-edit') === 'true', // Default false
                    run: localStorage.getItem('peak-auto-accept-run') === 'true' // Default false
                };

                const allAutoAccept = pendingButtons.every(btn => {
                    // Helper to map button to setting
                    if (btn.classList.contains('tool-list-dir-btn')) return settings.list;
                    if (btn.classList.contains('tool-view-btn') || btn.classList.contains('tool-read-url-btn') || btn.classList.contains('tool-search-btn') || btn.classList.contains('tool-problems-btn')) return settings.read;
                    if (btn.classList.contains('tool-create-btn') && btn.dataset.type === 'create') return settings.create;
                    if (btn.classList.contains('file-action-btn-compact') && btn.dataset.type === 'create') return settings.create;
                    if (btn.classList.contains('tool-create-btn') && btn.dataset.type === 'update') return settings.edit;
                    if (btn.classList.contains('file-action-btn-compact') && btn.dataset.type === 'update') return settings.edit;
                    if (btn.classList.contains('tool-run-btn')) return settings.run;
                    if (btn.classList.contains('tool-delete-btn')) return false; // Never auto-accept delete for now
                    return false;
                });

                if (allAutoAccept) {
                    console.log('[ChatView] Auto-accepting actions based on settings');
                    this.inputBar.updateStatus('thinking', 'Auto-executing...');

                    // Execute immediately
                    (async () => {
                        for (const btn of pendingButtons) {
                            console.log('[ChatView] Auto-executing button:', btn.dataset.type, btn.dataset.path);
                            await this.executeToolAction(btn);
                        }
                        // Auto-Continue
                        console.log('[ChatView] Auto-continuing after auto-accepted actions');
                        this.processUserMessage('continue', true);
                    })();

                    // Close details if present
                    if (this.streamingMessageDiv) {
                        const details = this.streamingMessageDiv.querySelector('details');
                        if (details) details.removeAttribute('open');
                    }
                    return; // Skip showing review controls
                }
                // -------------------------

                console.log('[ChatView] Showing review controls for', pendingButtons.length, 'actions');
                this.inputBar.updateStatus('ready', 'Waiting for review...');
                this.inputBar.showReviewControls(
                    pendingButtons.length,
                    async () => { // On Accept
                        console.log('[ChatView] User accepted all changes');
                        this.inputBar.updateStatus('thinking', 'Applying changes...');
                        this.inputBar.hideReviewControls();

                        // Execute all actions sequentially
                        for (const btn of pendingButtons) {
                            console.log('[ChatView] Executing button:', btn.dataset.type, btn.dataset.path);
                            await this.executeToolAction(btn);
                        }

                        this.inputBar.updateStatus('ready');

                        // Close the current message card after acceptance
                        if (this.streamingMessageDiv) {
                            const details = this.streamingMessageDiv.querySelector('details');
                            if (details) {
                                details.removeAttribute('open');
                            }
                        }

                        // Auto-Continue - reuses the same card for the next response
                        console.log('[ChatView] Auto-continuing after accepted actions');

                        if (this.isAgentMode) {
                            const AgentOrchestrator = require('../core/AgentOrchestrator');
                            AgentOrchestrator.waitForContinue();
                        }

                        this.processUserMessage('continue', true);
                    },
                    () => { // On Reject
                        console.log('[ChatView] User rejected changes');
                        this.inputBar.hideReviewControls();
                        this.appendMessage('system', 'Actions rejected by user.');

                        if (this.isAgentMode) {
                            const AgentOrchestrator = require('../core/AgentOrchestrator');
                            AgentOrchestrator.stopLoop();
                        }

                        // Optionally disable buttons visually
                        pendingButtons.forEach(btn => {
                            btn.disabled = true;
                            btn.style.opacity = '0.5';
                        });
                        this.inputBar.updateStatus('ready');

                        // Clear streaming div reference since we're done
                        this.streamingMessageDiv = null;

                        // Check queue even if rejected
                        this.checkMessageQueue();
                    }
                );
                // Keep streamingMessageDiv alive for auto-continue to reuse the same parent card
            } else {
                console.log('[ChatView] No pending actions found. Resetting status.');
                // DEBUG: Log innerHTML to see what was rendered
                console.log('[ChatView] Message HTML content:', this.streamingMessageDiv.innerHTML.substring(0, 500) + '...');

                // No pending actions, clear the reference
                this.inputBar.setLoading(false);
                this.inputBar.updateStatus('ready');
                this.streamingMessageDiv = null;

                // Check queue
                this.checkMessageQueue();
            }

        } else {
            console.warn('[ChatView] streamingMessageDiv is null in finalizeStreamingMessage');
        }

        if (error) {
            // Provide more helpful error messages
            let errorMessage = error;
            let isEmptyResponseError = error && error.includes('model output must contain');

            if (isEmptyResponseError) {
                errorMessage = `**AI Response Error**\n\nThe model returned an empty response. This usually happens when:\n- The context is too long (try with fewer files)\n- The model's safety filters blocked the response\n- The model encountered an internal error\n\n*Original Error:* ${error}`;
            }

            // Create error message with retry button
            const errorDiv = document.createElement('div');
            errorDiv.className = 'term-chat-msg system';
            errorDiv.style.width = '100%';
            errorDiv.innerHTML = `
                <div class="response-card markdown-content" style="border-left:3px solid #dc2626; padding:12px; background:rgba(220,38,38,0.05);">
                    <div style="color:#dc2626; font-weight:600; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
                        <i data-lucide="alert-circle" style="width:16px; height:16px;"></i>
                        Error
                    </div>
                    <div style="font-size:12px; line-height:1.5; white-space:pre-wrap;">${errorMessage}</div>
                    ${isEmptyResponseError ? `
                    <button class="retry-request-btn" style="margin-top:12px; padding:6px 12px; background:var(--peak-accent); color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px; display:flex; align-items:center; gap:4px;">
                        <i data-lucide="refresh-cw" style="width:12px; height:12px;"></i>
                        Retry with Fresh Context
                    </button>
                    ` : ''}
                </div>
            `;

            this.chatThread.appendChild(errorDiv);

            if (isEmptyResponseError) {
                const retryBtn = errorDiv.querySelector('.retry-request-btn');
                if (retryBtn) {
                    retryBtn.onclick = () => {
                        // Clear selected files to reduce context
                        this.selectedFiles.clear();
                        this.selectedDocs.clear();
                        this.renderFileChips();

                        // Retry with simple "continue"
                        this.processUserMessage('Please try again with a simpler response', false);
                    };
                }
            }

            if (window.lucide) window.lucide.createIcons();

            this.inputBar.setLoading(false);
            this.inputBar.updateStatus('ready');
            this.checkMessageQueue();
        }

        // Reset UI (if not waiting for review)
        // If we showed review controls, we don't want to reset status immediately
        // But we do want to focus input
        setTimeout(() => this.inputBar.inputArea.focus(), 50);
        if (window.lucide) window.lucide.createIcons();
        this.scrollToBottom();
    }

    checkMessageQueue() {
        if (this.messageQueue.length > 0) {
            console.log('[ChatView] Processing queued message. Queue length:', this.messageQueue.length);
            const next = this.messageQueue.shift();
            // Small delay to let UI settle
            setTimeout(() => {
                this.processUserMessage(next.prompt, next.isAuto);
            }, 100);
        }
    }

    scrollToBottom(force = false) {
        if (this.scroller) {
            const threshold = 100; // px from bottom to consider "at bottom"
            const isNearBottom = this.scroller.scrollHeight - this.scroller.scrollTop - this.scroller.clientHeight <= threshold;

            if (force || isNearBottom) {
                this.scroller.scrollTop = this.scroller.scrollHeight;
            }
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

    async executeToolAction(btn) {
        if (!window.currentProjectRoot) {
            this.appendMessage('system', '❌ **Error:** No active project found. Please open a project tab to use tools.');
            return;
        }

        // --- NEW: Remote MCP Tool Handling ---
        const serverId = btn.dataset.serverId;
        if (serverId) {
            const toolName = btn.dataset.tool;
            console.log(`[ChatView] Executing Remote Tool: ${toolName} on Server: ${serverId}`);

            try {
                // Parse arguments
                let args = {};
                if (btn.dataset.args) {
                    args = JSON.parse(decodeURIComponent(btn.dataset.args));
                }

                // Visual feedback
                this.appendMessage('system', `Executing remote tool **${toolName}**...`);

                // Execute via IPC
                const result = await require('electron').ipcRenderer.invoke('mcp:execute-tool', serverId, toolName, args);

                // Display Result
                // Usually MCP tools return a content array. We'll just JSON stringify for now or extract text.
                let outputText = '';
                if (result && result.content && Array.isArray(result.content)) {
                    outputText = result.content.map(c => c.text).join('\n');
                } else {
                    outputText = JSON.stringify(result, null, 2);
                }

                this.appendMessage('system', `Tool Output:\n\`\`\`\n${outputText}\n\`\`\``);
                this.markButtonSuccess(btn, 'Executed');

                // Add to history
                this.client.history.push({
                    role: 'system',
                    content: `Tool Output (${toolName}):\n\`\`\`\n${outputText}\n\`\`\``
                });
                this.client.saveHistory();

                // Auto-continue
                this.processUserMessage('continue', true);

            } catch (e) {
                console.error("MCP Execution Failed", e);
                this.appendMessage('system', `❌ Tool Execution Failed: ${e.message}`);
            }
            return;
        }
        // -------------------------------------

        // FIX: Handle List Directory specifically
        if (btn.classList.contains('tool-list-dir-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            const recursive = btn.dataset.recursive === 'true';
            // Find the card to inject output into
            const targetCard = btn.closest('.list-directory-card');

            // Visual feedback
            const originalText = btn.innerHTML;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Running...';
            btn.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            await this.listDirectoryAndSendToAI(path, recursive, targetCard);

            // Reset button state
            btn.innerHTML = '<i data-lucide="check"></i> Done';
            setTimeout(() => {
                btn.innerHTML = originalText;
                btn.disabled = false;
                if (window.lucide) window.lucide.createIcons();
            }, 2000);
            return;
        }

        // File operations (both old tool-create-btn and new file-action-btn-compact)
        if (btn.classList.contains('tool-create-btn') || btn.classList.contains('file-action-btn-compact')) {
            const path = decodeURIComponent(btn.dataset.path);
            // SAFEGUARD: Check if dataset.content exists AND is not the string "undefined"
            let content = '';
            if (btn.dataset.content && btn.dataset.content !== 'undefined') {
                content = decodeURIComponent(btn.dataset.content);
                if (content === 'undefined') content = ''; // Double check after decode
            }
            const type = btn.dataset.type || 'create';

            console.log(`[ChatView] Handling file action: ${type} for ${path}`);
            console.log(`[ChatView] Raw dataset content:`, btn.dataset.content);
            console.log(`[ChatView] Decoded content length:`, content.length);
            console.log(`[ChatView] Decoded content preview:`, content.slice(0, 100));

            if (type === 'reject') {
                console.log('[ChatView] User rejected file action:', path);
                this.markButtonSuccess(btn, 'Rejected');
                // Disable the corresponding accept button if possible
                const container = btn.closest('.file-edit-actions');
                if (container) {
                    const acceptBtn = container.querySelector(`button[data-type="create"], button[data-type="update"]`);
                    if (acceptBtn) {
                        acceptBtn.disabled = true;
                        acceptBtn.style.opacity = '0.5';
                    }
                }
                return;
            }

            // SAFEGUARD: Prevent writing "undefined" string as content
            if (content === 'undefined' || content === undefined) {
                console.error('[ChatView] Blocked attempt to write "undefined" content to file:', path);
                this.appendMessage('system', `⚠️ **Error**: Attempted to write invalid content ("undefined") to \`${path}\`. Action blocked.`);

                // Visual feedback on button
                btn.innerHTML = `<i data-lucide="alert-triangle"></i> Invalid Content`;
                btn.style.background = 'var(--peak-error-bg, #fee2e2)';
                btn.style.color = 'var(--peak-error-text, #dc2626)';
                btn.style.borderColor = 'var(--peak-error-border, #fca5a5)';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            // IPC IMPLEMENTATION: Use direct IPC to write file
            try {
                const root = window.currentProjectRoot;
                console.log(`[ChatView] executeToolAction - Root: ${root}, Path: ${path}`);

                if (!root) {
                    console.error('[ChatView] No project root found!');
                    throw new Error("No project root found.");
                }
                const fullPath = require('path').join(root, path);

                console.log(`[ChatView] Writing file via IPC: ${fullPath}`);
                console.log(`[ChatView] Content length to write: ${content.length}`);

                // We use invoke to wait for completion
                const writeResult = await require('electron').ipcRenderer.invoke('project:write-file', fullPath, content);
                console.log('[ChatView] Write result:', writeResult);

                if (writeResult && writeResult.error) {
                    throw new Error(`Write failed: ${writeResult.error}`);
                }

                // VERIFICATION: Verify file exists and is readable immediately after write
                // This prevents race conditions where the AI thinks it's done but the FS hasn't caught up
                const verifyRead = await require('electron').ipcRenderer.invoke('project:read-file', fullPath);
                if (verifyRead && verifyRead.error) {
                    throw new Error(`Write verification failed: ${verifyRead.error}`);
                }

                console.log('[ChatView] File write successful and verified');
                this.markButtonSuccess(btn, type === 'update' ? 'Applied' : 'Created');
                // Refresh sidebar in main window
                require('electron').ipcRenderer.send('project:refresh-sidebar');

                // FIX: Force reload of the file in the editor if it's currently open
                // This ensures the AI context (which reads from the editor/currentFileContent) is updated immediately
                if (window.currentFilePath === fullPath) {
                    console.log('[ChatView] Reloading active file to sync context:', path);
                    window.dispatchEvent(new CustomEvent('peak-open-file', { detail: { path: path } }));
                }

            } catch (err) {
                console.error('[ChatView] File write failed:', err);
                this.appendMessage('system', `Error writing file: ${err.message}`);
                btn.innerHTML = `<i data-lucide="alert-circle"></i> Error`;
            }
            return;
        }

        if (btn.classList.contains('tool-run-btn')) {
            const cmd = decodeURIComponent(btn.dataset.cmd);
            console.log('[ChatView] Running command:', cmd);

            this.markButtonSuccess(btn, 'Running...');

            try {
                const root = window.currentProjectRoot;
                // IPC IMPLEMENTATION: Invoke command and wait for result
                const result = await require('electron').ipcRenderer.invoke('project:run-command', cmd, root);

                console.log('[ChatView] Command result:', result);
                console.log(`[ChatView] Output lengths - STDOUT: ${result.stdout?.length || 0}, STDERR: ${result.stderr?.length || 0}, ERROR: ${result.error ? 'YES' : 'NO'}`);

                // Construct output message for AI context
                // Construct output message for AI context
                let outputContent = '';
                if (result.error && !result.stdout && !result.stderr) {
                    outputContent = `⚠️ COMMAND FAILED\nError executing command: ${result.error}`;
                } else {
                    const status = result.exitCode === 0 ? 'SUCCESS' : '⚠️ COMMAND FAILED';
                    outputContent = `Command: ${cmd}\nExit Code: ${result.exitCode} (${status})\n\n`;

                    if (result.stdout) {
                        outputContent += `[STDOUT]\n\`\`\`\n${result.stdout}\n\`\`\`\n\n`;
                    }

                    if (result.stderr) {
                        outputContent += `[STDERR]\n\`\`\`\n${result.stderr}\n\`\`\`\n\n`;
                    }

                    if (result.error) {
                        outputContent += `[ERROR]\n${result.error}\n`;
                    }
                }

                // Append to history so AI sees it in next turn
                // We use 'tool' role if supported, or 'user' with explicit context
                // Using 'user' role is safer for now as per system prompt patterns
                this.client.history.push({
                    role: 'system',
                    content: `Command Execution Result:\n${outputContent}`
                });
                this.client.saveHistory();

                // Render the command output in the chat so it's visible
                this.renderHistory();

                // CRITICAL FIX: Auto-continue to send output to AI
                // This ensures the AI receives the command results immediately
                console.log('[ChatView] Auto-continuing after command execution');
                this.processUserMessage('continue', true);

                // Inject output into the card DOM for inline display
                const card = btn.closest('.command-card');
                if (card) {
                    const outputDiv = card.querySelector('.command-output-compact');
                    const collapsedDiv = card.querySelector('.file-code-collapsed');

                    if (collapsedDiv) {
                        collapsedDiv.style.display = 'block'; // Ensure container is visible

                        // Create output div if it doesn't exist (it should based on template, but let's be safe)
                        let targetDiv = outputDiv;
                        if (!targetDiv) {
                            targetDiv = document.createElement('div');
                            targetDiv.className = 'command-output-compact';
                            targetDiv.style.marginTop = '8px';
                            targetDiv.style.paddingTop = '8px';
                            targetDiv.style.borderTop = '1px solid var(--border-color)';
                            targetDiv.innerHTML = `
                                <div style="font-size:10px; font-weight:600; margin-bottom:4px; color:var(--peak-secondary);">Output:</div>
                                <pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-size:10px; color:var(--peak-secondary);"></pre>
                            `;
                            collapsedDiv.appendChild(targetDiv);
                        }

                        // Update content
                        const pre = targetDiv.querySelector('pre');
                        if (pre) {
                            pre.textContent = result.stdout + (result.stderr ? '\n' + result.stderr : '');
                            if (result.error) pre.textContent += '\nError: ' + result.error;
                        }

                        // Ensure output div is visible
                        targetDiv.style.display = 'block';
                    }
                }

                if (result.exitCode !== 0) {
                    this.markButtonSuccess(btn, 'Failed');
                    btn.style.background = 'var(--peak-error-bg, #fee2e2)';
                    btn.style.color = 'var(--peak-error-text, #dc2626)';
                    btn.style.borderColor = 'var(--peak-error-border, #fca5a5)';
                } else {
                    this.markButtonSuccess(btn, 'Completed');
                }

            } catch (err) {
                console.error('[ChatView] Command execution failed:', err);
                this.markButtonSuccess(btn, 'Error');
            }
            return;
        }

        if (btn.classList.contains('tool-view-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            console.log('[ChatView] Viewing file:', path);
            this.markButtonSuccess(btn, 'Reading...');

            try {
                const root = window.currentProjectRoot;
                let content = '';

                // Check if external
                const isExternal = path.startsWith('/') && (!root || !path.startsWith(root));

                if (isExternal) {
                    console.log('[ChatView] Reading external file via MCP:', path);
                    const result = await require('electron').ipcRenderer.invoke('mcp:execute-tool', 'filesystem', 'read_file', { path });
                    if (result.content && result.content[0]) {
                        content = result.content[0].text;
                    } else {
                        throw new Error('No content returned from MCP read_file');
                    }
                } else {
                    const fullPath = require('path').isAbsolute(path) ? path : require('path').join(root, path);
                    const result = await require('electron').ipcRenderer.invoke('project:read-file', fullPath);
                    if (result && result.error) throw new Error(result.error);
                    content = typeof result === 'string' ? result : result.content;
                }

                // Add to history
                this.client.history.push({
                    role: 'system',
                    content: `File Content (${path}):\n\`\`\`\n${content}\n\`\`\``
                });
                this.client.saveHistory();

                this.markButtonSuccess(btn, 'Read');
                this.processUserMessage('continue', true);

            } catch (e) {
                console.error('[ChatView] View file failed:', e);
                this.markButtonSuccess(btn, 'Error');
                this.appendMessage('system', `Error reading file: ${e.message}`);
            }
            return;
        }

        if (btn.classList.contains('tool-delete-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            console.log('[ChatView] Deleting file:', path);

            // For auto-execution (accept all), we skip confirm if it's part of a batch?
            // Or we assume "Accept All" implies confirmation.
            // But if clicked individually, we might want confirm.
            // For now, let's keep confirm for individual clicks, but maybe skip for programmatic?
            // The btn click event is programmatic in "Accept All".
            // So confirm() will pop up. That's annoying for "Accept All".
            // We should probably skip confirm if it's an "Accept All" flow.
            // But executeToolAction doesn't know context.
            // Let's just do it.

            try {
                const root = window.currentProjectRoot;
                if (!root) throw new Error("No project root found.");
                const fullPath = require('path').join(root, path);

                await require('electron').ipcRenderer.invoke('project:delete-path', fullPath);
                console.log('[ChatView] File delete successful');
                this.markButtonSuccess(btn, 'Deleted');
                require('electron').ipcRenderer.send('project:refresh-sidebar');
            } catch (err) {
                console.error('[ChatView] File delete failed:', err);
                this.appendMessage('system', `Error deleting file: ${err.message}`);
            }
            return;
        } else if (btn.classList.contains('tool-search-btn')) {
            const query = decodeURIComponent(btn.dataset.query);
            this.runSearchAndSendToAI(query);
            this.markButtonSuccess(btn, 'Searched');
        } else if (btn.classList.contains('tool-view-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            window.dispatchEvent(new CustomEvent('peak-open-file', { detail: { path } }));
            this.markButtonSuccess(btn, 'Opened');
            await this.sendFileContentToAI(path, btn);
        } else if (btn.classList.contains('tool-problems-btn')) {
            this.getProblemsAndSendToAI(btn);
            this.markButtonSuccess(btn, 'Checked');
        } else if (btn.classList.contains('tool-capture-live-btn')) {
            this.captureLiveViewAndSendToAI(btn);
            this.markButtonSuccess(btn, 'Captured');
        } else if (btn.classList.contains('tool-read-url-btn')) {
            const url = decodeURIComponent(btn.dataset.url);
            this.readUrlAndSendToAI(url, btn);
            this.markButtonSuccess(btn, 'Fetched');
        } else if (btn.classList.contains('tool-list-dir-btn')) {
            const path = decodeURIComponent(btn.dataset.path);
            const recursive = btn.dataset.recursive === 'true';
            // Find parent card
            // FIX: Updated selector to include new class list-directory-card and file-edit-card-compact
            let card = btn.closest('.tool-card-compact, .list-directory-card, .file-edit-card-compact');
            console.log('[ChatView] Executing list_directory. Path:', path, 'Recursive:', recursive, 'Card found:', !!card);

            if (!card) {
                console.warn('[ChatView] Failed to find parent .tool-card-compact for list_directory button');
                console.log('[ChatView] Button parent structure:', btn.parentElement, btn.parentElement?.parentElement);

                // Fallback: Try to find the card by traversing up more aggressively or by ID if we had one
                // For now, let's try to find ANY .tool-card-compact in the same message container
                const msg = btn.closest('.term-chat-msg');
                if (msg) {
                    // This is risky if there are multiple list_directory cards in one message
                    // But better than nothing for now
                    const cards = msg.querySelectorAll('.tool-card-compact');
                    // Try to find one that contains this button (which failed via closest??)
                    // If closest failed, querySelectorAll won't help if the DOM is disconnected.
                    // But maybe the class is missing?
                    console.log('[ChatView] Checking message container for cards:', cards.length);
                }
            }
            this.listDirectoryAndSendToAI(path, recursive, card);
            this.markButtonSuccess(btn, 'Listed');
        }
    }

    async handleToolAction(e) {
        // DEBUG: Trace all clicks in the chat thread
        // console.log('[ChatView] handleToolAction click target:', e.target);

        // Toggle Code (both old and new compact styles)
        const toggleBtn = e.target.closest('.toggle-code-btn, .toggle-code-btn-compact');
        if (toggleBtn) {
            // ... (existing toggle logic) ...
            // Old style
            const oldCard = toggleBtn.closest('.file-edit-card');
            if (oldCard) {
                const content = oldCard.querySelector('.file-edit-content');
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

            // New compact style
            const compactCard = toggleBtn.closest('.file-edit-card-compact');
            if (compactCard) {
                const content = compactCard.querySelector('.file-code-collapsed');
                if (content) {
                    if (content.style.display === 'none' || !content.style.display) {
                        content.style.display = 'block';
                    } else {
                        content.style.display = 'none';
                    }
                }
                return;
            }
        }

        // Accept All
        // Command output toggle
        const outputToggle = e.target.closest('.tool-toggle-output-btn');
        if (outputToggle) {
            // ... (existing output toggle logic) ...
            const card = outputToggle.closest('.tool-card-compact');
            if (card) {
                const output = card.querySelector('.command-output-compact');
                const icon = outputToggle.querySelector('[data-lucide]');
                if (output) {
                    const isHidden = output.style.display === 'none';
                    output.style.display = isHidden ? 'block' : 'none';
                    if (icon) {
                        icon.setAttribute('data-lucide', isHidden ? 'chevron-up' : 'chevron-down');
                        if (window.lucide) window.lucide.createIcons();
                    }
                }
            }
            return;
        }

        const acceptAllBtn = e.target.closest('.accept-all-btn');
        if (acceptAllBtn) {
            console.log('[ChatView] Accept All clicked');
            const msgDiv = acceptAllBtn.closest('.term-chat-msg');
            const allActions = msgDiv.querySelectorAll('.tool-create-btn, .tool-run-btn, .file-action-btn-compact, .tool-action-btn-compact, .tool-list-dir-btn');

            // Use executeToolAction for each
            for (const btn of allActions) {
                if (!btn.disabled) await this.executeToolAction(btn);
            }

            acceptAllBtn.innerHTML = '<i data-lucide="check-check"></i> All Actions Started';
            acceptAllBtn.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            // Check if we're in agent mode and should resume orchestrator
            const AgentOrchestrator = require('../core/AgentOrchestrator');
            if (AgentOrchestrator.isLoopActive) {
                console.log('[ChatView] Resuming agent orchestrator after Accept All');
                AgentOrchestrator.resumeLoop();
            } else {
                // Normal mode: auto-continue with new message
                this.processUserMessage('continue', true);
            }
            return;
        }

        // Handle both old and new button styles
        const btn = e.target.closest('.msg-action-btn, .file-action-btn-compact, .tool-action-btn-compact');

        if (btn) {
            console.log('[ChatView] Tool action button clicked:', btn.className);
            if (btn.disabled) {
                console.log('[ChatView] Button is disabled, ignoring.');
                return;
            }
            // Use extracted method
            await this.executeToolAction(btn);
        } else {
            // console.log('[ChatView] Click was not on a known tool action button');
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
        if (this.inputBar && this.inputBar.inputArea) {
            this.inputBar.inputArea.focus();
        }
    }

    async captureLiveViewAndSendToAI(triggerButton = null) {
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

            // Create Live View Block HTML (minimalistic)
            const preview = html.slice(0, 100).replace(/\n/g, ' ').trim() + (html.length > 100 ? '...' : '');
            const blockHtml = `
                <details class="analysis-block-minimal">
                    <summary class="analysis-summary-minimal">
                        <i data-lucide="chevron-right" class="analysis-chevron" style="width:12px; height:12px; transition: transform 0.2s;"></i>
                        <i data-lucide="eye" style="width:12px; height:12px; color: #10b981;"></i>
                        <span class="analysis-summary-text">Live View: ${url}</span>
                    </summary>
                    <div class="analysis-content-minimal">
                        <div style="margin-bottom:8px; font-weight:bold; color:var(--peak-primary); font-size: 10px;">${url}</div>
                        <pre style="white-space: pre-wrap; word-break: break-all;">${html}</pre>
                        <div style="margin-top:8px; font-size: 9px; color: var(--peak-secondary); opacity: 0.6;">DOM snapshot sent to AI</div>
                    </div>
                </details>
            `;

            // If we have a trigger button, insert the analysis card right after it
            if (triggerButton) {
                const analysisDiv = document.createElement('div');
                analysisDiv.innerHTML = blockHtml;
                // Insert after the button's parent card
                const cardParent = triggerButton.closest('.tool-card-minimal, .file-action-card-compact');
                if (cardParent && cardParent.parentNode) {
                    cardParent.parentNode.insertBefore(analysisDiv.firstElementChild, cardParent.nextSibling);
                    if (window.lucide) window.lucide.createIcons();
                    this.scrollToBottom();
                }
            } else {
                // Original behavior: Create streaming message FIRST, then append analysis card into it
                const agentSelect = document.getElementById('ai-assist-agent-select');
                const agentId = agentSelect ? agentSelect.value : null;
                const agent = AgentRegistry.getAgent(agentId);

                this.createStreamingMessage(agent);

                // Append analysis card INTO the streaming message's content div
                if (this.streamingContentDiv) {
                    this.streamingContentDiv.innerHTML = blockHtml;
                    if (window.lucide) window.lucide.createIcons();
                    this.scrollToBottom();
                }
            }

            // Send to AI via History Push + Auto-Continue
            const messageContent = `Live View Snapshot (${url}):\n\`\`\`html\n${html}\n\`\`\``;

            this.client.history.push({
                role: 'system',
                content: messageContent
            });
            this.client.saveHistory();

            // Trigger Auto-Continue
            this.processUserMessage('continue', true);

        } catch (e) {
            console.error("Failed to capture live view:", e);
            this.appendMessage('system', `Error capturing live view: ${e.message}`);
        }
    }

    async readUrlAndSendToAI(url, triggerButton = null) {
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

            // Create Tool Output Block (minimalistic)
            const preview = content.slice(0, 80).replace(/\n/g, ' ') + (content.length > 80 ? '...' : '');
            const blockHtml = `
                <details class="analysis-block-minimal">
                    <summary class="analysis-summary-minimal">
                        <i data-lucide="chevron-right" class="analysis-chevron" style="width:12px; height:12px; transition: transform 0.2s;"></i>
                        <i data-lucide="globe" style="width:12px; height:12px; color: #3b82f6;"></i>
                        <span class="analysis-summary-text">Read URL: ${new URL(url).hostname}</span>
                    </summary>
                    <div class="analysis-content-minimal">
                        <div style="margin-bottom:8px; font-weight:bold; color:var(--peak-primary); font-size: 10px;">${url}</div>
                        <pre style="white-space: pre-wrap; word-break: break-all;">${content}</pre>
                        <div style="margin-top:8px; font-size: 9px; color: var(--peak-secondary); opacity: 0.6;">Content sent to AI</div>
                    </div>
                </details>
            `;

            // If we have a trigger button, insert the analysis card right after it
            if (triggerButton) {
                const analysisDiv = document.createElement('div');
                analysisDiv.innerHTML = blockHtml;
                // Insert after the button's parent card
                const cardParent = triggerButton.closest('.tool-card-minimal, .file-action-card-compact');
                if (cardParent && cardParent.parentNode) {
                    cardParent.parentNode.insertBefore(analysisDiv.firstElementChild, cardParent.nextSibling);
                    if (window.lucide) window.lucide.createIcons();
                    this.scrollToBottom();
                }
            } else {
                // Original behavior: Create streaming message FIRST, then append analysis card into it
                const agentSelect = document.getElementById('ai-assist-agent-select');
                const agentId = agentSelect ? agentSelect.value : null;
                const agent = AgentRegistry.getAgent(agentId);

                this.createStreamingMessage(agent);

                // Append analysis card INTO the streaming message's content div
                if (this.streamingContentDiv) {
                    this.streamingContentDiv.innerHTML = blockHtml;
                    if (window.lucide) window.lucide.createIcons();
                    this.scrollToBottom();
                }
            }

            // Send to AI via History Push + Auto-Continue
            const messageContent = `Content of ${url}:\n\`\`\`text\n${content.slice(0, 20000)}\n\`\`\``;

            this.client.history.push({
                role: 'system',
                content: messageContent
            });
            this.client.saveHistory();

            // Trigger Auto-Continue
            this.processUserMessage('continue', true);

        } catch (e) {
            console.error("Failed to read URL:", e);
            this.appendMessage('system', `Error reading URL: ${e.message}. (Note: CORS might block some sites. Try using a proxy or backend fetch if needed.)`);
        }
    }

    async getProblemsAndSendToAI(triggerButton = null) {
        try {
            if (window.peakGetDiagnostics) {
                const diags = window.peakGetDiagnostics();
                console.log('[ChatView] Diagnostics retrieved:', diags);
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

                    // If we have a trigger button, insert the analysis card right after it
                    if (triggerButton) {
                        const analysisDiv = document.createElement('div');
                        analysisDiv.innerHTML = displayHtml;
                        // Insert after the button's parent card
                        const cardParent = triggerButton.closest('.tool-card-minimal, .file-action-card-compact');
                        if (cardParent && cardParent.parentNode) {
                            cardParent.parentNode.insertBefore(analysisDiv.firstElementChild, cardParent.nextSibling);
                            if (window.lucide) window.lucide.createIcons();
                            this.scrollToBottom();
                        }
                    } else {
                        // Append to Chat (Left Side / System)
                        const msgDiv = document.createElement('div');
                        msgDiv.className = 'term-chat-msg system';
                        msgDiv.innerHTML = displayHtml;
                        this.chatThread.appendChild(msgDiv);
                        if (window.lucide) window.lucide.createIcons();
                        this.scrollToBottom();
                    }
                }

                const fullMessage = `Problems Check Result:\n\`\`\`\n${message}\n\`\`\``;

                // Send to AI via History Push + Auto-Continue
                this.client.history.push({
                    role: 'system',
                    content: fullMessage
                });
                this.client.saveHistory();

                // Trigger Auto-Continue
                this.processUserMessage('continue', true);

            } else {
                this.appendMessage('system', "Error: Diagnostics service not available.");
            }
        } catch (e) {
            console.error("Failed to get problems:", e);
        }
    }

    async sendFileContentToAI(relPath, triggerButton = null) {
        if (!window.currentProjectRoot) {
            this.appendMessage('system', '❌ **Error:** No active project found. Please open a project tab.');
            return;
        }

        try {
            const root = window.currentProjectRoot;
            const fullPath = require('path').isAbsolute(relPath) ? relPath : require('path').join(root, relPath);
            const content = await require('electron').ipcRenderer.invoke('project:read-file', fullPath);

            // Create Analysis Block HTML (minimalistic)
            const preview = typeof content === 'string'
                ? content.slice(0, 80).replace(/\n/g, ' ').trim() + (content.length > 80 ? '...' : '')
                : 'Error reading file';

            const analysisHtml = `
                <details class="analysis-block-minimal">
                    <summary class="analysis-summary-minimal">
                        <i data-lucide="chevron-right" class="analysis-chevron" style="width:12px; height:12px; transition: transform 0.2s;"></i>
                        <i data-lucide="microscope" style="width:12px; height:12px; color: #8b5cf6;"></i>
                        <span class="analysis-summary-text">Analysis: ${relPath}</span>
                    </summary>
                    <div class="analysis-content-minimal">
                        <pre style="white-space: pre-wrap; word-break: break-all;">${typeof content === 'string' ? content : 'Error reading file'}</pre>
                        <div style="margin-top:8px; font-size: 9px; color: var(--peak-secondary); opacity: 0.6;">File content sent for analysis</div>
                    </div>
                </details>
            `;

            // If we have a trigger button, insert the analysis card right after it
            if (triggerButton) {
                const analysisDiv = document.createElement('div');
                analysisDiv.innerHTML = analysisHtml;
                // Insert after the button's parent card
                const cardParent = triggerButton.closest('.tool-card-minimal, .file-action-card-compact');
                if (cardParent && cardParent.parentNode) {
                    cardParent.parentNode.insertBefore(analysisDiv.firstElementChild, cardParent.nextSibling);
                    if (window.lucide) window.lucide.createIcons();
                    this.scrollToBottom();
                }
            }

            // Send to AI via history (not streaming)
            // When triggered from a button, we don't create a new streaming message
            // The analysis card is already inserted inline, and the AI will see this in history
            const message = `File Content: \`${relPath}\`\n\`\`\`\n${typeof content === 'string' ? content : 'Error reading file'}\n\`\`\``;

            this.client.history.push({
                role: 'system',
                content: message
            });
            this.client.saveHistory();

            // Trigger Auto-Continue to ensure AI sees the content and proceeds
            this.processUserMessage('continue', true);

        } catch (e) {
            console.error("Failed to send file content to AI:", e);
        }
    }

    async listDirectoryAndSendToAI(relPath, recursive, targetCard = null) {
        if (!window.currentProjectRoot) {
            this.appendMessage('system', '❌ **Error:** No active project found. Please open a project tab.');
            return;
        }

        try {
            const root = window.currentProjectRoot;
            console.log(`[ChatView] listDirectoryAndSendToAI called for path: ${relPath}, recursive: ${recursive}`);
            const targetPath = require('path').isAbsolute(relPath) ? relPath : require('path').join(root, relPath === '.' ? '' : relPath);
            console.log(`[ChatView] Resolved target path: ${targetPath}`);

            // Check if external
            const isExternal = targetPath.startsWith('/') && (!root || !targetPath.startsWith(root));
            let treeOutput = '';

            if (isExternal) {
                console.log('[ChatView] Listing external directory via MCP:', targetPath);
                try {
                    const result = await require('electron').ipcRenderer.invoke('mcp:execute-tool', 'filesystem', 'list_directory', { path: targetPath });
                    if (result.content && result.content[0]) {
                        // MCP list_directory usually returns a JSON string or text listing
                        // We'll use it directly
                        treeOutput = result.content[0].text;
                    } else {
                        treeOutput = '(Empty Directory or Error)';
                    }
                } catch (e) {
                    treeOutput = `Error listing directory via MCP: ${e.message}`;
                }
            } else {
                // Invoke Backend IPC
                const tree = await require('electron').ipcRenderer.invoke('project:get-file-tree', targetPath);

                if (tree.error) {
                    console.error(`[ChatView] Error listing directory: ${tree.error}`);
                    this.appendMessage('system', `Error listing directory: ${tree.error}`);
                    return;
                }

                // Format Tree Output
                treeOutput = formatTree(tree);
            }

            // Format Tree Output
            function formatTree(item, prefix = '') {
                let output = '';
                if (item.children) {
                    // Filter out noise directories
                    const filteredChildren = item.children.filter(child =>
                        !['node_modules', '.git', '.DS_Store', 'dist', 'build', '.next', '.idea', '.vscode'].includes(child.name)
                    );

                    filteredChildren.forEach((child, index) => {
                        const isLast = index === filteredChildren.length - 1;
                        const connector = isLast ? '└── ' : '├── ';
                        const childPrefix = isLast ? '    ' : '│   ';
                        output += `${prefix}${connector}${child.name}${child.type === 'directory' ? '/' : ''}\n`;
                        if (child.type === 'directory' && recursive) {
                            output += formatTree(child, prefix + childPrefix);
                        }
                    });
                }
                return output;
            }

            const displayOutput = treeOutput || '(Empty Directory)';

            // Inject into Target Card if available
            // Inject into Target Card if available
            let injected = false;
            if (targetCard) {
                console.log('[ChatView] Injecting list_directory output into target card');
                const outputDiv = targetCard.querySelector('.list-dir-output');
                if (outputDiv) {
                    const pre = outputDiv.querySelector('pre');
                    if (pre) {
                        pre.textContent = displayOutput;
                    }
                    outputDiv.style.display = 'block';
                    injected = true;
                } else {
                    console.warn('[ChatView] Output div not found in target card');
                }
            }

            if (!injected) {
                console.log('[ChatView] Target card not found or injection failed. Showing fallback output.');
                this.appendMessage('system', `**Directory Listing:** \`${targetPath}\`\n\`\`\`\n${displayOutput}\n\`\`\``);
            }


            // Send to AI via History Push + Auto-Continue
            // This ensures the context is preserved and the AI sees the result immediately
            const messageContent = `Directory Listing for \`${relPath}\`:\n\`\`\`text\n${displayOutput}\n\`\`\``;

            this.client.history.push({
                role: 'system',
                content: messageContent
            });
            this.client.saveHistory();

            // Trigger Auto-Continue
            this.processUserMessage('continue', true);

        } catch (e) {
            console.error("Failed to list directory:", e);
            this.appendMessage('system', `Error listing directory: ${e.message}`);
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

            this.inputBar.setLoading(true);
            this.createStreamingMessage();

            const agentSelect = document.getElementById('ai-assist-agent-select');
            const agentId = agentSelect ? agentSelect.value : null;
            const agent = AgentRegistry.getAgent(agentId);
            const modelId = agent ? agent.modelId : null;

            const aiContext = await this.getProjectContext([]);
            await this.client.sendMessage(message, aiContext, modelId);

        } catch (e) {
            console.error("Failed to send active file to AI:", e);
        }
    }

    async runSearchAndSendToAI(query) {
        try {
            const root = window.currentProjectRoot;
            if (!root) {
                this.appendMessage('system', 'Error: No project root found.');
                return;
            }

            // Use grep via IPC
            const cmd = `grep -r "${query}" .`;

            // Visual feedback
            this.appendMessage('system', `Searching for "${query}"...`);

            // IPC IMPLEMENTATION: Invoke command and wait for result
            const result = await require('electron').ipcRenderer.invoke('project:run-command', cmd, root);

            // Construct output message for AI context
            let outputContent = '';
            if (result.error && !result.stdout && !result.stderr) {
                outputContent = `Error executing search: ${result.error}`;
            } else {
                // Limit output size to prevent context overflow
                const stdout = result.stdout.slice(0, 20000);
                const truncated = result.stdout.length > 20000 ? '\n... (output truncated)' : '';
                outputContent = `Search Command: ${cmd}\nExit Code: ${result.exitCode}\n\nOutput:\n\`\`\`\n${stdout}${truncated}\n${result.stderr}\n\`\`\``;
            }

            // Append to history so AI sees it in next turn
            this.client.history.push({
                role: 'system',
                content: outputContent
            });
            this.client.saveHistory();

            // Trigger Auto-Continue
            this.processUserMessage('continue', true);

        } catch (e) {
            console.error("Failed to run search:", e);
            this.appendMessage('system', `Error running search: ${e.message}`);
        }
    }
    markButtonSuccess(btn, text) {
        btn.innerHTML = `<i data-lucide="check"></i> ${text}`;
        btn.disabled = true;
        if (window.lucide) window.lucide.createIcons();
    }

    destroy() {
        console.log('[ChatView] Destroying instance');

        // Remove Window Listeners
        if (this.handleStreamUpdateBound) window.removeEventListener('mcp:stream-update', this.handleStreamUpdateBound);
        if (this.handleStreamCompleteBound) window.removeEventListener('mcp:stream-complete', this.handleStreamCompleteBound);
        if (this.handleTerminalResponseBound) window.removeEventListener('peak-terminal-response', this.handleTerminalResponseBound);
        if (this.handleToggleSettingsBound) {
            document.removeEventListener('peak-toggle-ai-settings', this.handleToggleSettingsBound);
        }
        if (this.handleProjectRootUpdateBound) {
            window.removeEventListener('peak-project-root-updated', this.handleProjectRootUpdateBound);
        }
        window.peakToggleAISettings = null;

        // Clean up client if needed
        if (this.client) {
            this.client.abort(); // Stop any active streams
            // this.client.destroy(); // If client had listeners
        }
    }

    handleProjectRootUpdate(e) {
        const root = e.detail.root;
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] Project root updated event received:', root);

        // Prevent infinite loop: only update if root has actually changed AND we're not already processing
        if (root && root !== this.client.currentProjectRoot && !this._switchingProject) {
            this._switchingProject = true; // Guard against re-entry
            try {
                this.client.switchProject(root);
                this.renderHistory();
            } finally {
                this._switchingProject = false;
            }
        }
    }

    async handleDelegation(args) {
        const { agent_id, instruction } = args;
        const AgentRegistry = require('../core/AgentRegistry');
        const agent = AgentRegistry.getAgent(agent_id);

        if (!agent) {
            this.appendMessage('system', `Error: Could not find agent with ID "${agent_id}".`);
            return;
        }

        // Visual Indicator
        this.appendMessage('system', `🔄 Delegating to **${agent.name}**...`);

        const context = await this.getProjectContext([]);
        const modelId = agent.modelId;
        const systemPrompt = agent.systemPrompt;

        // We need to clarify to the new agent what is happening
        const delegationPrompt = `[System: You have been delegated a task by another agent.]\n\nTASK: ${instruction}`;

        await this.client.sendMessage(delegationPrompt, context, modelId, null, systemPrompt);
    }

    renderInputBar() {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[ChatView] renderInputBar called');

        // 1. Generate new HTML
        const isFileContextUsable = window.currentProjectRoot ? true : false;
        const selectedAgentId = localStorage.getItem('peak-ai-agent');
        const html = this.inputBar.render(isFileContextUsable, selectedAgentId, this.isAgentMode);

        // 2. Find existing input container
        const existingInput = this.container.querySelector('.inspector-input-container');

        if (existingInput) {
            // Replace
            existingInput.outerHTML = html;
        } else {
            // Append if missing (shouldn't happen if structure is correct)
            this.container.insertAdjacentHTML('beforeend', html);
        }

        if (this.inputBarCallbacks) {
            ipcRenderer.send('log', '[ChatView] Re-attaching InputBar listeners');
            this.inputBar.attachListeners(this.container, this.inputBarCallbacks);
        } else {
            ipcRenderer.send('log', '[ChatView] renderInputBar called but inputBarCallbacks is undefined (expected during init)');
        }

        if (window.lucide) window.lucide.createIcons();
    }
}

module.exports = ChatView;
