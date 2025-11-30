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
            ipcRenderer.send('log', '[LayoutController] Initializing ChatView');
            this.chatView = new ChatView();
            this.init();
        }, 50);
    }

    init() {
        this.attachTabListeners();
        this.attachTaskListeners();
        this.attachLiveViewListeners();
        this.attachLogListeners();
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

    attachLogListeners() {
        const logsStream = document.getElementById('logs-stream');
        const btnClearLogs = document.getElementById('btn-clear-logs');
        const filterBtns = document.querySelectorAll('.log-filter-btn');

        let currentFilter = 'all';

        // Filter buttons
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                currentFilter = btn.dataset.filter;
                filterBtns.forEach(b => {
                    b.classList.remove('active');
                    b.style.background = 'var(--control-background-color)';
                    b.style.color = 'var(--peak-secondary)';
                });
                btn.classList.add('active');
                btn.style.background = 'var(--peak-accent)';
                btn.style.color = 'white';
                this.renderLogs(currentFilter);
            });
        });

        // Clear logs
        if (btnClearLogs) {
            btnClearLogs.addEventListener('click', () => {
                AgentLogger.clear();
                this.renderLogs(currentFilter);
            });
        }

        // Listen for new logs
        AgentLogger.on('log', (logEntry) => {
            if (currentFilter === 'all' || currentFilter === logEntry.type) {
                this.appendLog(logEntry);
            }
        });

        AgentLogger.on('clear', () => {
            if (logsStream) {
                logsStream.innerHTML = '<div style="color: var(--peak-secondary); text-align: center; padding: 20px;">No logs yet. Logs will appear here as the agent executes.</div>';
            }
        });

        // Initial Render of Persisted Logs
        this.renderLogs(currentFilter);
    }

    renderLogs(filter = 'all') {
        const logsStream = document.getElementById('logs-stream');
        if (!logsStream) return;

        const logs = AgentLogger.getLogs(filter);

        if (logs.length === 0) {
            logsStream.innerHTML = '<div style="color: var(--peak-secondary); text-align: center; padding: 20px;">No logs for this filter.</div>';
            return;
        }

        // Group logs by Agent/Context if possible, or just improve styling
        // For now, let's keep it linear but with better visual separation for agents
        logsStream.innerHTML = logs.map(log => this.formatLogEntry(log)).join('');
        logsStream.scrollTop = logsStream.scrollHeight;
    }

    appendLog(logEntry) {
        const logsStream = document.getElementById('logs-stream');
        if (!logsStream) return;

        // Remove empty state if exists
        if (logsStream.querySelector('div[style*="text-align: center"]')) {
            logsStream.innerHTML = '';
        }

        const logHTML = this.formatLogEntry(logEntry);
        logsStream.insertAdjacentHTML('beforeend', logHTML);
        logsStream.scrollTop = logsStream.scrollHeight;
    }

    formatLogEntry(log) {
        const colors = {
            agent: '#8b5cf6', // Purple for Agent
            tool: '#10b981',  // Green for Tools
            error: '#ef4444', // Red for Errors
            system: '#64748b' // Slate for System
        };

        const color = colors[log.type] || '#666';

        // Use specific icons for agents if available in data
        let icon = 'circle';
        if (log.type === 'agent') icon = 'bot';
        else if (log.type === 'tool') icon = 'wrench';
        else if (log.type === 'error') icon = 'alert-triangle';
        else if (log.type === 'system') icon = 'info';

        // Agent specific styling
        const isAgent = log.type === 'agent';
        const bgStyle = isAgent ? 'background: rgba(139, 92, 246, 0.05);' : '';
        const borderStyle = isAgent ? 'border-left: 2px solid var(--peak-accent);' : 'border-left: 2px solid transparent;';

        return `
            <div style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); display: flex; gap: 8px; align-items: flex-start; ${bgStyle} ${borderStyle}">
                <span style="color: ${color}; flex-shrink: 0; margin-top: 2px;">
                    <i data-lucide="${icon}" style="width: 12px; height: 12px;"></i>
                </span>
                <div style="flex: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 2px;">
                        <span style="color: ${color}; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px;">${log.type}</span>
                        <span style="color: var(--peak-secondary); font-size: 9px; font-family: monospace;">${log.time}</span>
                    </div>
                    <div style="color: var(--peak-primary); font-size: 11px; line-height: 1.4;">${this.escapeHTML(log.message)}</div>
                    ${log.data && Object.keys(log.data).length > 0 ? `
                        <details style="margin-top: 4px;">
                            <summary style="cursor: pointer; color: var(--peak-secondary); font-size: 9px; user-select: none;">Details</summary>
                            <pre style="margin: 4px 0 0; font-size: 9px; color: var(--peak-secondary); background: var(--control-background-color); padding: 4px; border-radius: 4px; overflow-x: auto;">${this.escapeHTML(JSON.stringify(log.data, null, 2))}</pre>
                        </details>
                    ` : ''}
                </div>
            </div>
        `;
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

    async loadTasks() {
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

        try {
            const todoPath = path.join(root, 'TODO.md');
            const content = await ipcRenderer.invoke('project:read-file', todoPath);
            const timestamp = new Date().toLocaleTimeString();

            if (content && !content.error) {
                // Render Markdown content
                const renderedContent = renderMarkdown(content);

                tasksContent.innerHTML = `
                    <div style="font-size:10px; color:var(--peak-secondary); text-align:right; margin-bottom:8px; opacity:0.6;">
                        Updated: ${timestamp}
                    </div>
                    <div class="markdown-content">
                        ${renderedContent}
                    </div>
                `;
            } else {
                this.renderEmptyTasks(tasksContent, todoPath);
            }
        } catch (e) {
            tasksContent.innerHTML = `<div style="color:var(--error-color); padding:20px; text-align:center;">Error loading tasks: ${e.message}</div>`;
        }
    }

    renderEmptyTasks(container, todoPath) {
        container.innerHTML = `
            <div style="padding:30px 20px; text-align:center; color:var(--peak-secondary);">
                <i data-lucide="clipboard-list" style="width:32px; height:32px; margin-bottom:12px; opacity:0.5;"></i>
                <p style="margin-bottom:16px;">No Project Plan found.</p>
                <div style="font-size:10px; opacity:0.5; margin-bottom:12px;">Looking in: ${todoPath}</div>
                <button id="btn-generate-plan" style="padding:8px 16px; background:var(--peak-accent); color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                    <i data-lucide="sparkles" style="width:14px; height:14px;"></i> Generate Plan
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
                // We can access chatView instance or just populate the input
                const textarea = document.getElementById('ai-assist-input-textarea');
                const submitBtn = document.getElementById('ai-assist-submit-button');
                if (textarea && submitBtn) {
                    textarea.value = "Please analyze the project structure and create a comprehensive `TODO.md` file with a prioritized implementation plan. Use the `create_file` tool.";
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
