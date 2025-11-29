/**
 * LayoutController.js
 * Manages the overall layout, tab switching, and the Tasks view.
 */

const ChatView = require('./ChatView');
const path = require('path');
const { ipcRenderer } = require('electron');
const { renderMarkdown } = require('../../../utils/markdown');

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
