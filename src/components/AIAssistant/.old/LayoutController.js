/**
 * LayoutController.js
 * Manages the overall layout, tab switching, and the Tasks view.
 */

const ChatView = require('./ChatView');
const path = require('path');
const { ipcRenderer } = require('electron');
const { renderMarkdown } = require('../../../utils/markdown');
const AgentLogger = require('../core/AgentLogger');

class LayoutController {
    constructor() {
        const { ipcRenderer } = require('electron');
        ipcRenderer.send('log', '[LayoutController] Constructor called');
        this.container = document.getElementById('ai-assist-content');
        // Delay init to ensure DOM is ready
        setTimeout(() => {
            try {
                ipcRenderer.send('log', '[LayoutController] Initializing ChatView');
                this.chatView = new ChatView();
                this.init();
            } catch (e) {
                console.error('[LayoutController] Initialization failed:', e);
                ipcRenderer.send('log', '[LayoutController] Initialization failed: ' + e.message);
                if (this.container) {
                    this.container.innerHTML = `<div style="padding:20px; color:red;">Initialization Error: ${e.message}</div>`;
                }
            }
        }, 50);
    }

    init() {
        this.attachTabListeners();
        this.attachTaskListeners();
        this.attachLiveViewListeners();
        this.attachMCPListeners();

        // Initialize CanvasController
        this.initializeCanvas();

        // Initial Connection
        this.connectToMCPServers();

        // Listen for config changes from Settings
        window.addEventListener('peak-mcp-config-updated', () => {
            console.log("[LayoutController] MCP Config updated, reconnecting...");
            this.connectToMCPServers();
        });

        // Listen for plan file updates to refresh Task tab
        window.addEventListener('peak-plan-files-updated', () => {
            console.log("[LayoutController] Plan files updated, refreshing Task tab...");
            // Check if Tasks tab is currently active
            const parent = this.container ? this.container.parentNode : document;
            const tasksTab = parent.querySelector('.tab-btn[data-target="tasks"]');
            if (tasksTab && tasksTab.classList.contains('active')) {
                // Reload the current tab
                this.loadTasks();
            }
        });
    }

    initializeCanvas() {
        // Find or create a container for the Canvas
        // The Canvas will be injected into the Tasks panel as a persistent side-panel
        const tasksPanel = document.getElementById('panel-tasks');
        if (!tasksPanel) {
            console.warn('[LayoutController] Tasks panel not found, Canvas initialization skipped');
            return;
        }

        // Create a canvas container wrapper (will be positioned/styled by CanvasController)
        const canvasWrapper = document.createElement('div');
        canvasWrapper.id = 'canvas-container-wrapper';
        tasksPanel.appendChild(canvasWrapper);

        // Initialize CanvasController
        const CanvasController = require('./CanvasController');
        this.canvas = new CanvasController(canvasWrapper);
        console.log('[LayoutController] CanvasController initialized');

        // Listen for plan updates from the AI
        window.addEventListener('peak-plan-update', (e) => {
            console.log('[LayoutController] Plan update received:', e.detail);
            if (this.canvas && e.detail && e.detail.markdown) {
                this.canvas.updatePlan(e.detail.markdown);
                // Auto-show the canvas on first plan update
                this.openCanvasPanel();
            }
        });
    }

    openCanvasPanel() {
        // Switch to Tasks tab to show the canvas
        const parent = this.container ? this.container.parentNode : document;
        const tasksTab = parent.querySelector('.tab-btn[data-target="tasks"]');
        if (tasksTab && !tasksTab.classList.contains('active')) {
            tasksTab.click();
        }
    }

    async connectToMCPServers() {
        const config = JSON.parse(localStorage.getItem('peak-mcp-config') || '{}');

        // Cleanup legacy git config
        if (config.git) {
            delete config.git;
            localStorage.setItem('peak-mcp-config', JSON.stringify(config));
        }

        // Ensure filesystem is enabled by default if not present
        if (!config.filesystem) {
            config.filesystem = { enabled: true };
            localStorage.setItem('peak-mcp-config', JSON.stringify(config));
        }

        try {
            const result = await ipcRenderer.invoke('mcp:connect-dynamic', config);
            console.log("MCP Dynamic Connect Result:", result);
            this.renderMCPServers();
        } catch (err) {
            console.error("MCP Connect Failed:", err);
        }
    }

    attachTabListeners() {
        const parent = this.container ? this.container.parentNode : document;
        const tabs = parent.querySelectorAll('.tab-btn');
        const panels = parent.querySelectorAll('.term-panel');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                panels.forEach(p => {
                    p.style.display = 'none';
                    p.classList.remove('active');
                });

                const target = parent.querySelector(`#panel-${tab.dataset.target}`);
                if (target) {
                    target.style.display = 'flex';
                    target.classList.add('active');

                    if (tab.dataset.target === 'tasks') {
                        this.loadTasks();
                    }

                    // Initialize ExtensionMarketplace when Extensions tab is clicked
                    if (tab.dataset.target === 'extensions' && !target.dataset.initialized) {
                        target.dataset.initialized = 'true';
                        const ExtensionMarketplace = require('../../Extensions/ExtensionMarketplace');
                        new ExtensionMarketplace(target);
                    }
                }
            });
        });
    }

    attachTaskListeners() {
        const btnRefresh = document.getElementById('btn-refresh-tasks');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.loadTasks());
        }
    }

    attachMCPListeners() {
        const btnRefresh = document.getElementById('btn-refresh-mcp');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.renderMCPServers());
        }
        this.renderMCPServers();
    }

    async renderMCPServers() {
        const listContainer = document.getElementById('mcp-server-list');
        if (!listContainer) return;

        try {
            listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--peak-secondary);">Loading...</div>';
            const servers = await ipcRenderer.invoke('mcp:get-server-status');

            if (!servers || servers.length === 0) {
                listContainer.innerHTML = '<div style="padding:20px; text-align:center; color:var(--peak-secondary);">No active MCP servers.</div>';
                return;
            }

            const descriptions = {
                'filesystem': 'Access to local files',
                'git': 'Git version control',
                'memory': 'Persistent knowledge graph'
            };

            listContainer.innerHTML = servers.map(server => {
                const statusColor = server.status === 'connected' ? '#4caf50' : '#f44336';
                return `
                    <div style="padding: 12px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 12px; font-weight: 600; color: var(--peak-primary); display: flex; align-items: center; gap: 6px;">
                                ${server.id}
                                <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${statusColor};"></span>
                            </div>
                            <div style="font-size: 11px; color: var(--peak-secondary); margin-top: 2px;">
                                ${descriptions[server.id] || 'External Tool Provider'}
                            </div>
                        </div>
                        <div style="font-size: 10px; color: var(--peak-secondary); opacity: 0.7; text-transform: uppercase;">
                            ${server.status}
                        </div>
                    </div>
                `;
            }).join('');

        } catch (e) {
            console.error("Failed to render MCP servers:", e);
            listContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--error-color);">Error: ${e.message}</div>`;
        }
    }

    attachLiveViewListeners() {
        const webview = document.getElementById('inspector-live-view');
        const urlInput = document.getElementById('live-url-input');
        const btnRefresh = document.getElementById('btn-live-refresh');
        const btnPopout = document.getElementById('btn-live-popout');

        if (!webview || !urlInput) return;

        // URL Input Enter
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                let url = urlInput.value.trim();
                if (!url.startsWith('http')) {
                    url = 'http://' + url;
                }
                webview.src = url;
            }
        });

        // Refresh Button
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                webview.reload();
            });
        }

        // Popout Button
        if (btnPopout) {
            btnPopout.addEventListener('click', () => {
                const url = webview.src;
                if (url && url !== 'about:blank') {
                    require('electron').shell.openExternal(url);
                }
            });
        }

        // Sync Input with Webview Navigation
        webview.addEventListener('did-navigate', (e) => {
            urlInput.value = e.url;
        });

        webview.addEventListener('did-navigate-in-page', (e) => {
            urlInput.value = e.url;
        });
    }

    async loadTasks(activeTab = 'task') {
        const tasksContent = document.getElementById('tasks-content');
        if (!tasksContent) return;

        // Determine root path
        const freshContext = window.getProjectFileContext ? window.getProjectFileContext() : {};
        const activePath = freshContext.currentFilePath;
        const root = window.currentProjectRoot || (activePath ? path.dirname(activePath) : null);

        if (!root) {
            tasksContent.innerHTML = '<div style="padding:20px; color:var(--peak-secondary); text-align:center;">Project root not found.<br>Open a file to initialize context.</div>';
            return;
        }

        // Render Tabs
        tasksContent.innerHTML = `
            <div class="inspector-tabs-row" style="margin-bottom: 0; border-bottom: 1px solid var(--border-color); background: var(--window-background-color);">
                <button class="inspector-tab-btn ${activeTab === 'task' ? 'active' : ''}" id="tab-task">Task</button>
                <button class="inspector-tab-btn ${activeTab === 'plan' ? 'active' : ''}" id="tab-plan">Plan</button>
                <button class="inspector-tab-btn ${activeTab === 'walkthrough' ? 'active' : ''}" id="tab-walkthrough">Walkthrough</button>
            </div>
            <div id="task-file-content" class="markdown-content" style="padding: 16px; overflow-y: auto; height: calc(100% - 33px);">
                <div style="display:flex; justify-content:center; padding:20px;"><i data-lucide="loader-2" class="spin"></i></div>
            </div>
        `;

        // Attach Tab Listeners
        tasksContent.querySelector('#tab-task').onclick = () => this.loadTasks('task');
        tasksContent.querySelector('#tab-plan').onclick = () => this.loadTasks('plan');
        tasksContent.querySelector('#tab-walkthrough').onclick = () => this.loadTasks('walkthrough');

        if (window.lucide) window.lucide.createIcons();

        // Load Content
        try {
            let filename = 'task.md';
            if (activeTab === 'plan') filename = 'implementation_plan.md';
            if (activeTab === 'walkthrough') filename = 'walkthrough.md';

            // Try .peak folder first, then fall back to root
            let filePath = null;
            const peakPath = path.join(root, '.peak', filename);

            // Check .peak folder first
            let content = await ipcRenderer.invoke('project:read-file', peakPath);
            if (content && !content.error) {
                filePath = peakPath;
            } else {
                // Fall back to root
                filePath = path.join(root, filename);
                content = await ipcRenderer.invoke('project:read-file', filePath);

                // If task.md not found in root, try TODO.md as legacy fallback
                if ((!content || content.error) && activeTab === 'task') {
                    const todoPath = path.join(root, 'TODO.md');
                    const todoContent = await ipcRenderer.invoke('project:read-file', todoPath);
                    if (todoContent && !todoContent.error) {
                        content = todoContent;
                        filePath = todoPath;
                    }
                }
            }

            const contentContainer = tasksContent.querySelector('#task-file-content');

            if (content && !content.error) {
                contentContainer.innerHTML = renderMarkdown(content);
            } else {
                this.renderEmptyTasks(contentContainer, filename, root);
            }
        } catch (e) {
            const contentContainer = tasksContent.querySelector('#task-file-content');
            if (contentContainer) {
                contentContainer.innerHTML = `<div style="color:var(--error-color); padding:20px; text-align:center;">Error loading ${activeTab}: ${e.message}</div>`;
            }
        }
    }

    renderEmptyTasks(container, filename, root) {
        container.innerHTML = `
            <div style="padding:30px 20px; text-align:center; color:var(--peak-secondary);">
                <i data-lucide="file-question" style="width:32px; height:32px; margin-bottom:12px; opacity:0.5;"></i>
                <p style="margin-bottom:16px;">${filename} not found.</p>
                <div style="font-size:10px; opacity:0.5; margin-bottom:12px;">Looking in .peak folder</div>
                <button id="btn-generate-plan" style="padding:8px 16px; background:var(--peak-accent); color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                    <i data-lucide="sparkles" style="width:14px; height:14px;"></i> Generate ${filename}
                </button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();

        const btnGenerate = container.querySelector('#btn-generate-plan');
        if (btnGenerate) {
            btnGenerate.addEventListener('click', () => {
                // Switch to Chat tab
                const parent = this.container.parentNode;
                const chatTab = parent.querySelector('.tab-btn[data-target="ai"]');
                if (chatTab) chatTab.click();

                // Trigger generation via ChatView
                const textarea = document.getElementById('ai-assist-input-textarea');
                const submitBtn = document.getElementById('ai-assist-submit-button');
                if (textarea && submitBtn) {
                    textarea.value = `Please create a ${filename} file for this project.`;
                    textarea.dispatchEvent(new Event('input'));
                    submitBtn.click();
                }
            });
        }
    }

    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    destroy() {
        // Clean up ChatView
        if (this.chatView) {
            this.chatView.destroy();
        }

        // Remove Tab Listeners (Optional, as DOM is removed by Inspector)
        // But good practice if we had global listeners.
    }
}

module.exports = LayoutController;
