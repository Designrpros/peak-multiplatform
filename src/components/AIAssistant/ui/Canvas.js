/**
 * Canvas.js
 * 
 * Main UI container - implemented with "Antigravity" aesthetic.
 * Features:
 * - Tabs: Chat | Task | Extensions | Live
 * - Panels: Chat (Messages), Task View (Artifact Viewer), Extension Marketplace, Live (Webview)
 */

const StateStore = require('../core/StateStore');
const StateToUITransformer = require('../transformation/StateToUITransformer');
const InputBar = require('./InputBar');
const AIExecutor = require('../core/AIExecutor');
const MessageRenderer = require('./MessageRenderer');
const ExtensionMarketplace = require('../../Extensions/ExtensionMarketplace');
const { getWebViewComponent, attachWebViewListeners } = require('../../WebView/index');

class Canvas {
    constructor() {
        this.container = null;
        this.inputBar = new InputBar();
        this.messageRenderer = null;
        this.MarketplaceClass = ExtensionMarketplace; // Store class ref
        this.MarketplaceClass = ExtensionMarketplace; // Store class ref
        this.marketplaceInstance = null; // Instance
        this.SettingsControllerClass = require('./SettingsController');
        this.settingsController = null;

        // Subscribe to state changes
        this._setupSubscriptions();
    }

    init(container) {
        this.container = container;
        this._render();
        this._attachInputBar();
        this._attachMessageRenderer();
    }

    _render() {
        this.container.innerHTML = `
            <div style="display: flex; flex-direction: column; height: 100%; background: var(--window-background-color);">
                
                <!-- Tab Navigation: Chat | Task | Extensions | Live -->
                <div class="term-tabs" style="display: flex; align-items: center; border-bottom: 1px solid var(--border-color); background: var(--window-background-color); padding: 12px; gap: 8px; flex-wrap: wrap;">
                    <button class="tab-btn active" data-target="chat">Chat</button>
                    <button class="tab-btn" data-target="task">Task</button>
                    <button class="tab-btn" data-target="extensions">Extensions</button>
                    <button class="tab-btn" data-target="live">Live</button>
                    
                    <!-- Spacer -->
                    <div style="flex: 1;"></div>
                </div>

                <!-- Panel Content -->
                <div class="term-panels" style="flex: 1; position: relative; overflow: hidden;">
                    <!-- Chat Panel -->
                    <div id="panel-chat" class="term-panel active" style="height: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative;">
                        <div id="term-chat-messages" class="term-chat-messages" style="flex: 1; overflow-y: auto; overflow-x: hidden; min-height: 0; padding: 0;"></div>
                        <!-- Input container wrapper - will be replaced but acts as placeholder -->
                        <div class="inspector-input-container" style="flex-shrink: 0; z-index: 10; position: relative;"></div>
                    </div>

                    <!-- Task Panel (Artifact Viewer) -->
                    <!-- Task Panel (Artifact Viewer) -->
                    <div id="panel-task" class="term-panel" style="height: 100%; display: none; flex-direction: column; overflow: hidden;">
                         <!-- Sub-navigation for artifacts -->
                         <div class="artifact-tabs" style="display: flex; gap: 8px; padding: 12px; border-bottom: 1px solid var(--border-color); overflow-x: auto;">
                             <button class="artifact-pill active" data-file="TODO.md">Task List</button>
                             <button class="artifact-pill" data-file="implementation_plan.md">Plan</button>
                             <button class="artifact-pill" data-file="walkthrough.md">Walkthrough</button>
                             <button class="artifact-pill" data-file="vision.md">Vision</button>
                         </div>
                         <!-- Content -->
                         <div id="artifact-content" class="artifact-content markdown-body" style="flex: 1; padding: 24px; overflow-y: auto; background: var(--window-background-color); color: var(--peak-primary);">
                             <div style="display:flex; align-items:center; justify-content:center; height:100%; opacity:0.5; font-size:13px;">Select an artifact to view</div>
                         </div>
                    </div>

                    <!-- Extensions Panel -->
                    <div id="panel-extensions" class="term-panel" style="height: 100%; overflow: hidden; display: none; flex-direction: column;">
                        <!-- Marketplace inserted here -->
                    </div>
                    
                     <div id="panel-live" class="term-panel" style="height: 100%; overflow: hidden; display: none; flex-direction: column;">
                        <!-- Toolbar -->
                        <div style="display:flex; align-items:center; gap:8px; padding:6px 12px; border-bottom:1px solid var(--border-color); background:var(--window-background-color);">
                            <button id="live-refresh-btn" class="icon-btn" title="Refresh"><i data-lucide="rotate-cw" style="width:14px; height:14px;"></i></button>
                            <div style="flex:1; font-size:11px; color:var(--peak-secondary); text-align:center; user-select:none;">localhost:3000</div>
                            <button id="live-external-btn" class="icon-btn" title="Open in Browser"><i data-lucide="external-link" style="width:14px; height:14px;"></i></button>
                        </div>
                        <!-- WebView will be inserted here -->
                        <div class="webview-placeholder" style="flex:1; display:flex; flex-direction:column;"></div>
                    </div>

                    <!-- Settings Panel -->
                    <div id="panel-settings" class="term-panel" style="height: 100%; overflow-y: auto; display: none; flex-direction: column;">
                         <div id="ai-assist-settings-content" style="padding: 12px;"></div>
                    </div>
                </div>
            </div>
            
            <style>
                html, body {
                    height: 100vh; /* Use vh to be sure */
                    margin: 0;
                    overflow: hidden !important; /* Force no scroll on body so flex works */
                }
                /* Shared Pill Styles */
                .tab-btn, .artifact-pill {
                    padding: 6px 12px;
                    border-radius: 20px;
                    border: 1px solid var(--border-color);
                    background: var(--control-background-color);
                    color: var(--peak-secondary);
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    white-space: nowrap;
                }
                .tab-btn:hover, .artifact-pill:hover {
                    border-color: var(--peak-secondary);
                    color: var(--peak-primary) !important;
                }
                .tab-btn.active, .artifact-pill.active {
                    background: var(--peak-accent);
                    color: #fff !important;
                    border-color: var(--peak-accent) !important;
                }
                
                /* Simple Markdown Styles */
                .markdown-body h1, .markdown-body h2, .markdown-body h3 { margin-top: 1.5em; margin-bottom: 1em; font-weight: 600; }
                .markdown-body h1 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
                .markdown-body h2 { font-size: 1.3em; }
                .markdown-body p { margin-bottom: 1em; line-height: 1.6; }
                .markdown-body ul, .markdown-body ol { padding-left: 2em; margin-bottom: 1em; }
                .markdown-body li { margin-bottom: 0.5em; }
                .markdown-body code { background: rgba(100,100,100,0.1); padding: 2px 4px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
                .markdown-body pre { background: rgba(0,0,0,0.2); padding: 12px; border-radius: 6px; overflow-x: auto; margin-bottom: 1em; }
                .markdown-body pre code { background: none; padding: 0; }
                .markdown-body blockquote { border-left: 3px solid var(--peak-accent); margin: 0; padding-left: 1em; opacity: 0.8; }
                .markdown-body a { color: var(--peak-accent); text-decoration: none; }
                .markdown-body a:hover { text-decoration: underline; }
                .markdown-body strong { color: var(--peak-primary); }
            </style>
        `;

        // Initialize lucide icons
        if (window.lucide) window.lucide.createIcons();

        // Attach listeners

        this._attachTabListeners();
        this._attachArtifactListeners();
        this._attachLiveListeners();
    }




    _attachLiveListeners() {
        const refreshBtn = this.container.querySelector('#live-refresh-btn');
        const externalBtn = this.container.querySelector('#live-external-btn');

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                const webview = this.container.querySelector('#webview-live-preview');
                if (webview) {
                    try {
                        webview.reload();
                    } catch (e) {
                        console.error('[Canvas] Failed to reload webview:', e);
                    }
                }
            });
        }

        if (externalBtn) {
            externalBtn.addEventListener('click', () => {
                // Open external logic
                if (require('electron') && require('electron').shell) {
                    require('electron').shell.openExternal('http://localhost:3000');
                }
            });
        }
    }

    _attachTabListeners() {
        const tabs = this.container.querySelectorAll('.tab-btn');
        const panels = this.container.querySelectorAll('.term-panel');
        const extPanel = this.container.querySelector('#panel-extensions');
        const taskPanel = this.container.querySelector('#panel-task');
        const livePanel = this.container.querySelector('#panel-live');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const target = tab.dataset.target;

                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active panel
                panels.forEach(p => {
                    p.style.display = 'none';
                    p.classList.remove('active');
                });

                const panel = this.container.querySelector(`#panel-${target}`);
                if (panel) {
                    // Chat, Extensions, Live, and Task all need flex for proper internal layout/scrolling
                    if (target === 'chat' || target === 'extensions' || target === 'live' || target === 'task' || target === 'settings') {
                        panel.style.display = 'flex';
                    } else {
                        panel.style.display = 'block';
                    }
                    panel.classList.add('active');
                }

                // Initial render for lazy components
                if (target === 'extensions' && !this.marketplaceInstance) {
                    console.log('[Canvas] Initializing ExtensionMarketplace...');
                    try {
                        this.marketplaceInstance = new this.MarketplaceClass(extPanel);
                    } catch (e) {
                        console.error('[Canvas] Failed to init marketplace:', e);
                        extPanel.innerHTML = `<div style="padding:20px; color:var(--error-text);">Error loading extensions: ${e.message}</div>`;
                    }
                }

                // Initial load for Task tab (Artifacts)
                if (target === 'task') {
                    const activeArtifact = taskPanel.querySelector('.artifact-pill.active');
                    if (activeArtifact) {
                        this._loadArtifact(activeArtifact.dataset.file);
                    } else {
                        const firstBtn = taskPanel.querySelector('.artifact-pill[data-file="TODO.md"]');
                        if (firstBtn) {
                            firstBtn.click();
                        }
                    }
                }

                // Initial load for Live tab (WebView)
                if (target === 'live') {
                    const placeholder = livePanel.querySelector('.webview-placeholder');
                    if (placeholder && placeholder.children.length === 0) {
                        console.log('[Canvas] Initializing Live WebView...');
                        const url = 'http://localhost:3000';
                        const tabId = 'live-preview';

                        // Create WebView html
                        placeholder.innerHTML = getWebViewComponent(url, tabId);

                        // Attach View Listeners
                        // We need a slight delay to ensure DOM is ready? 
                        setTimeout(() => {
                            if (attachWebViewListeners) {
                                attachWebViewListeners(null, tabId);
                            }
                        }, 100);
                    }
                }

                // Initial load for Settings tab
                if (target === 'settings' && !this.settingsController) {
                    console.log('[Canvas] Initializing SettingsController...');
                    try {
                        this.settingsController = new this.SettingsControllerClass();
                    } catch (e) {
                        console.error('[Canvas] Failed to init settings:', e);
                        this.container.querySelector('#ai-assist-settings-content').innerHTML = `<div style="padding:20px; color:var(--error-text);">Error loading settings: ${e.message}</div>`;
                    }
                }
            });
        });
    }

    _attachArtifactListeners() {
        const pills = this.container.querySelectorAll('.artifact-pill');
        pills.forEach(pill => {
            pill.addEventListener('click', () => {
                pills.forEach(n => n.classList.remove('active'));
                pill.classList.add('active');
                this._loadArtifact(pill.dataset.file);
            });
        });
    }

    async _loadArtifact(filename) {
        const contentArea = this.container.querySelector('#artifact-content');
        if (!contentArea) return;

        contentArea.innerHTML = '<div style="opacity:0.5; padding:20px; text-align:center;">Loading...</div>';

        try {
            const { ipcRenderer } = require('electron');

            // Try 1: Check project root
            let content = null;
            let loadedPath = '';

            if (window.currentProjectRoot) {
                const rootPath = window.currentProjectRoot;
                const path = require('path');
                loadedPath = path.join(rootPath, filename);

                try {
                    content = await ipcRenderer.invoke('project:read-file', loadedPath);
                } catch (e) {
                    console.error('[Canvas] Failed to load artifact from root:', e);
                }
            } else {
                console.warn('[Canvas] No project root found.');
            }

            // Fallback: If not found, check if it's the specific task.md case and we are in a mode where we might want to check the brain?
            // User requested "from the same repo not somewhere else", so we strictly disable the brain fallback.

            if (content && typeof content === 'string' && !content.error) {
                const marked = require('marked');
                const html = marked.parse(content);
                contentArea.innerHTML = html;
            } else {
                contentArea.innerHTML = `<div style="color:var(--error-text); padding:20px; text-align:center;">
                    <h3>File not found</h3>
                    <p>Could not locate <code>${filename}</code> in project root.</p>
                 </div>`;
            }
        } catch (e) {
            console.error('[Canvas] Error loading artifact:', e);
            contentArea.innerHTML = `<div style="color:var(--error-text); padding:20px;">Error: ${e.message}</div>`;
        }
    }

    _attachMessageRenderer() {
        const chatContainer = this.container.querySelector('#term-chat-messages');
        if (!chatContainer) {
            console.error('[Canvas] Chat messages container not found');
            return;
        }

        this.messageRenderer = new MessageRenderer(chatContainer);
    }

    _attachInputBar() {
        const inputContainer = this.container.querySelector('.inspector-input-container');
        if (!inputContainer) {
            console.error('[Canvas] Input container not found');
            return;
        }

        inputContainer.outerHTML = this.inputBar.render(true, null, false);

        const newInputContainer = this.container.querySelector('.inspector-input-container');
        this.inputBar.attachListeners(newInputContainer, {
            onSubmit: (value) => this._handleSubmit(value),
            onStop: () => AIExecutor.abort(),
            onAgentModeToggle: (isActive) => console.log('Agent mode:', isActive)
        });
    }

    async _handleSubmit(message) {
        const context = {
            projectTitle: window.currentProjectTitle || 'Project',
            root: window.currentProjectRoot || '.'
        };

        await AIExecutor.sendMessage(message, context);
    }

    _setupSubscriptions() {
        StateStore.subscribeTo('ui.isStreaming', (isStreaming) => {
            if (this.inputBar) {
                this.inputBar.setLoading(isStreaming);
            }
        });
    }

    destroy() {
        if (this.messageRenderer) {
            this.messageRenderer.destroy();
        }
    }
}

module.exports = Canvas;
