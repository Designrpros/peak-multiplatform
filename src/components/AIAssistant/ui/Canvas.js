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
                <div class="term-tabs" style="display: flex; align-items: center; border-bottom: 1px solid var(--border-color); background: var(--window-background-color); padding: 0 12px; gap: 16px; flex-wrap: wrap;">
                    <button class="tab-btn active" data-target="chat" style="padding: 10px 0; font-size: 12px; font-weight: 500; color: var(--peak-secondary); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">
                        Chat
                    </button>
                    <button class="tab-btn" data-target="task" style="padding: 10px 0; font-size: 12px; font-weight: 500; color: var(--peak-secondary); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">
                        Task
                    </button>
                    <button class="tab-btn" data-target="extensions" style="padding: 10px 0; font-size: 12px; font-weight: 500; color: var(--peak-secondary); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">
                        Extensions
                    </button>
                    <button class="tab-btn" data-target="live" style="padding: 10px 0; font-size: 12px; font-weight: 500; color: var(--peak-secondary); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">
                        Live
                    </button>
                    <button class="tab-btn" data-target="settings" style="padding: 10px 0; font-size: 12px; font-weight: 500; color: var(--peak-secondary); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.2s;">
                        Settings
                    </button>
                    
                    <!-- Spacer -->
                    <div style="flex: 1;"></div>
                    

                </div>

                <!-- Panel Content -->
                <div class="term-panels" style="flex: 1; position: relative; overflow: hidden;">
                    <!-- Chat Panel -->
                    <div id="panel-chat" class="term-panel active" style="height: 100%; display: flex; flex-direction: column; overflow: hidden;">
                        <div id="term-chat-messages" class="term-chat-messages" style="flex: 1; overflow-y: auto; min-height: 0; padding: 12px;"></div>
                        <!-- Input container wrapper - will be replaced but acts as placeholder -->
                        <div class="inspector-input-container" style="flex-shrink: 0;"></div>
                    </div>

                    <!-- Task Panel (Artifact Viewer) -->
                    <div id="panel-task" class="term-panel" style="height: 100%; display: none; overflow: hidden;">
                         <div style="display: flex; height: 100%;">
                            <!-- Sidebar -->
                            <div class="artifact-sidebar" style="width: 180px; border-right: 1px solid var(--border-color); display: flex; flex-direction: column; padding-top: 10px; background: rgba(0,0,0,0.02);">
                                 <button class="artifact-nav-item active" data-file="task.md">
                                    <i data-lucide="check-square" style="width: 14px; height: 14px;"></i>
                                    <span>Task List</span>
                                 </button>
                                 <button class="artifact-nav-item" data-file="implementation_plan.md">
                                    <i data-lucide="file-text" style="width: 14px; height: 14px;"></i>
                                    <span>Plan</span>
                                 </button>
                                 <button class="artifact-nav-item" data-file="walkthrough.md">
                                    <i data-lucide="footprints" style="width: 14px; height: 14px;"></i>
                                    <span>Walkthrough</span>
                                 </button>
                            </div>
                            <!-- Content -->
                            <div id="artifact-content" class="artifact-content markdown-body" style="flex: 1; padding: 24px; overflow-y: auto; background: var(--window-background-color); color: var(--peak-primary);">
                                <div style="display:flex; align-items:center; justify-content:center; height:100%; opacity:0.5; font-size:13px;">Select an artifact to view</div>
                            </div>
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
                .tab-btn:hover { color: var(--peak-primary) !important; }
                .tab-btn.active { 
                    color: var(--peak-primary) !important; 
                    font-weight: 600 !important;
                    border-bottom-color: var(--peak-accent) !important;
                }
                .icon-btn:hover { color: var(--peak-primary) !important; background: var(--control-background-color) !important; border-radius: 4px; }
                
                .artifact-nav-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 8px 16px;
                    margin: 2px 8px;
                    border: none;
                    background: none;
                    color: var(--peak-secondary);
                    font-size: 12px;
                    cursor: pointer;
                    border-radius: 6px;
                    text-align: left;
                    transition: all 0.1s;
                }
                .artifact-nav-item:hover {
                    background: var(--control-background-color);
                    color: var(--peak-primary);
                }
                .artifact-nav-item.active {
                    background: rgba(59, 130, 246, 0.1); 
                    color: var(--peak-accent);
                    font-weight: 500;
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
                    panel.style.display = (target === 'chat' ? 'flex' : (target === 'extensions' ? 'flex' : (target === 'live' ? 'flex' : 'block')));
                    if (target === 'settings') panel.style.display = 'flex'; // Settings can be flex too
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
                    const activeArtifact = taskPanel.querySelector('.artifact-nav-item.active');
                    if (activeArtifact) {
                        this._loadArtifact(activeArtifact.dataset.file);
                    } else {
                        const firstBtn = taskPanel.querySelector('.artifact-nav-item[data-file="task.md"]');
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
        const navItems = this.container.querySelectorAll('.artifact-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                this._loadArtifact(item.dataset.file);
            });
        });
    }

    async _loadArtifact(filename) {
        const contentArea = this.container.querySelector('#artifact-content');
        if (!contentArea) return;

        contentArea.innerHTML = '<div style="opacity:0.5; padding:20px; text-align:center;">Loading...</div>';

        // Hardcoded path to brain artifacts for this session
        const brainPath = '/Users/vegarberentsen/.gemini/antigravity/brain/b81e3084-a500-4755-89b0-c1a29e9c9d71';
        const fullPath = `${brainPath}/${filename}`;

        try {
            const { ipcRenderer } = require('electron');
            const content = await ipcRenderer.invoke('project:read-file', fullPath);

            if (content && typeof content === 'string' && !content.error) {
                const marked = require('marked');
                // Use DOMPurify if available? marked is safe enough for trusted artifacts
                const html = marked.parse(content);
                contentArea.innerHTML = html;
            } else {
                contentArea.innerHTML = `<div style="color:var(--error-text); padding:20px;">
                    <h3>Failed to load ${filename}</h3>
                    <p>${content && content.error ? content.error : 'File not found'}</p>
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
