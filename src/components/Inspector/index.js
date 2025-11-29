// src/components/Inspector/index.js
const path = require('path');
const { ipcRenderer } = require('electron');

// --- SAFE MODULE LOADING ---
let aiAssist = null;
let terminalOps = null;

try {
    // FIX: Point to new folder structure
    aiAssist = require('../AIAssistant/index.js');
} catch (e) {
    console.error("[Inspector] Failed to load AI Assist module:", e);
}

try {
    terminalOps = require('./terminal-ops.js');
} catch (e) {
    console.error("[Inspector] Failed to load Terminal Ops module:", e);
}
// ---------------------------

let currentMode = null;
let noteSortMode = 'date';

function toggle(mode) {
    const container = document.getElementById('inspector-container');
    const isCurrentlyOpen = container && container.classList.contains('visible');

    if (isCurrentlyOpen && currentMode === mode) {
        close();
        return;
    }
    open(mode);
}

function open(mode) {
    let container = document.getElementById('inspector-container');
    const mainContent = document.getElementById('main-content-area');

    if (!container) {
        container = document.createElement('div');
        container.id = 'inspector-container';
        if (mainContent && mainContent.parentNode) {
            mainContent.parentNode.appendChild(container);
        } else {
            document.body.appendChild(container);
        }
    }

    if (window.currentInspectorCleanup) {
        try { window.currentInspectorCleanup(); } catch (e) { console.error(e); }
        window.currentInspectorCleanup = null;
    }
    container.innerHTML = '';

    currentMode = mode;

    try {
        renderInspector(mode);
        void container.offsetWidth;
        container.classList.add('visible');
    } catch (e) {
        console.error("[Inspector] Render Error:", e);
        container.innerHTML = `
            <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                <h3>Error</h3>
                <button class="icon-btn" onclick="window.closeInspector()"><i data-lucide="x"></i></button>
            </div>
            <div style="padding:20px; color:red;">
                <strong>Failed to render inspector:</strong><br>
                ${e.message}
            </div>`;
        container.classList.add('visible');
        if (window.lucide) window.lucide.createIcons();
    }
}

function close() {
    const container = document.getElementById('inspector-container');
    if (container) {
        container.classList.remove('visible');
        setTimeout(() => {
            if (!container.classList.contains('visible')) {
                container.innerHTML = '';
                if (window.currentInspectorCleanup) {
                    try { window.currentInspectorCleanup(); } catch (e) { }
                    window.currentInspectorCleanup = null;
                }
            }
        }, 300);
    }
    currentMode = null;
}

function refresh() {
    const container = document.getElementById('inspector-container');
    if (container && container.classList.contains('visible') && currentMode) {
        renderInspector(currentMode);
    }
}

function renderInspector(type) {
    const container = document.getElementById('inspector-container');

    if (window.currentInspectorCleanup) {
        try { window.currentInspectorCleanup(); } catch (e) { }
        window.currentInspectorCleanup = null;
    }

    if (type === 'terminal-ops') {
        if (!terminalOps) throw new Error("Terminal Ops module is missing or failed to load.");
        container.innerHTML = `
            <div class="inspector-inner-wrapper">
                <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:14px; font-weight:600; color:var(--peak-primary);">Terminal Ops</h3>
                    <button class="icon-btn" onclick="window.closeInspector()"><i data-lucide="x"></i></button>
                </div>
                ${terminalOps.getTerminalOpsHTML()}
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        attachResizeListener(container);
        window.currentInspectorCleanup = terminalOps.attachTerminalOpsListeners(container);
        return;
    }

    if (type === 'ai-assist' || type === 'ai' || type === 'settings') {
        if (!aiAssist) throw new Error("AI Assist module is missing or failed to load.");
        const { currentFilePath, currentFileContent, currentFileContentError, projectTitle } = window.getProjectFileContext ? window.getProjectFileContext() : {};
        let htmlContent = '';
        let displayFileName = currentFilePath ? path.basename(currentFilePath) : 'No File';

        if (type === 'ai' || type === 'ai-assist') { // 'ai-assist' is the old type, 'ai' is the new one for chat
            htmlContent = currentFileContentError ? `<div style="padding:20px;">Error: ${currentFileContentError}</div>` : aiAssist.getAIAssistHTML(currentFileContent, currentFilePath);
            displayFileName = currentFilePath ? path.basename(currentFilePath) : (projectTitle || 'Project');
        } else if (type === 'settings') {
            htmlContent = aiAssist.getSettingsHTML();
            displayFileName = 'Settings';
        } else {
            htmlContent = `<div style="padding:20px;">Unknown Inspector Type: ${type}</div>`;
        }

        container.innerHTML = `
            <div class="inspector-inner-wrapper">
                <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:14px; font-weight:600; color:var(--peak-primary);">AI Assistant <span style="opacity:0.5; font-weight:400;">(${displayFileName})</span></h3>
                    <div style="display:flex; gap:4px;">
                        ${type === 'settings' ?
                `<button class="icon-btn" onclick="window.openInspector('ai')" title="Back to Chat"><i data-lucide="arrow-left"></i></button>` :
                `<button id="inspector-settings-btn" class="icon-btn" title="Settings"><i data-lucide="settings"></i></button>`
            }
                        <button class="icon-btn" onclick="window.showChatHistory()" title="Chat History"><i data-lucide="history"></i></button>
                        <button class="icon-btn" onclick="window.closeInspector()"><i data-lucide="x"></i></button>
                    </div>
                </div>
                ${htmlContent}
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();

        // Attach listener to settings button
        const settingsBtn = container.querySelector('#inspector-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => {
                console.log('[Inspector] Settings button clicked');
                window.openInspector('settings');
            });
        }

        attachResizeListener(container);

        if (type === 'ai' || type === 'ai-assist') {
            window.currentInspectorCleanup = aiAssist.attachAIAssistListeners(currentFileContent, currentFilePath);
        } else if (type === 'settings') {
            // Initialize Settings Controller
            const SettingsController = require('../AIAssistant/ui/SettingsController');
            const controller = new SettingsController();
            window.currentInspectorCleanup = () => controller.destroy();
        }

        return;
    }

    if (type === 'chat-history') {
        const sessions = window.peakMCPClient ? window.peakMCPClient.getSessions() : [];
        const currentSessionId = window.peakMCPClient ? window.peakMCPClient.currentSessionId : null;

        const listHtml = sessions.map(session => {
            const isActive = session.id === currentSessionId;
            const dateStr = new Date(session.lastModified).toLocaleDateString();
            return `
                <div class="inspector-list-item ${isActive ? 'active' : ''}" onclick="window.loadChatSession('${session.id}')" style="${isActive ? 'background-color:var(--control-background-color);' : ''}">
                    <div class="inspector-item-text">
                        <div class="inspector-item-title">${session.title || 'New Chat'}</div>
                        <div class="inspector-item-subtitle">${dateStr} • ${session.history.length} msgs</div>
                    </div>
                    ${isActive ? '<div style="font-size:10px; opacity:0.5;">Active</div>' : ''}
                </div>
            `;
        }).join('');

        container.innerHTML = `
            <div class="inspector-inner-wrapper">
                <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:14px; font-weight:600; color:var(--peak-primary);">Chat History</h3>
                    <div style="display:flex; gap:4px;">
                         <button class="icon-btn" onclick="window.startNewChatSession()" title="New Chat"><i data-lucide="plus"></i></button>
                         <button class="icon-btn" onclick="window.openInspector('ai-assist')"><i data-lucide="arrow-left"></i></button>
                    </div>
                </div>
                <div class="inspector-content">
                    ${sessions.length > 0 ? listHtml : '<div class="empty-inspector-state">No history found</div>'}
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        attachResizeListener(container);
        return;
    }

    if (type === 'whiteboard-properties') {
        const activeTab = window.tabManager?.getActiveTab ? window.tabManager.getActiveTab() : null;
        if (!activeTab || activeTab.content?.type !== 'whiteboard') {
            container.innerHTML = `
                 <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                     <h3 style="margin:0; font-size:14px; font-weight:600; color:var(--peak-primary);">Object Properties</h3>
                     <button class="icon-btn" onclick="window.closeInspector()"><i data-lucide="x"></i></button>
                 </div>
                 <div class="inspector-content" style="padding: 20px;">
                     <div class="empty-inspector-state">Open a Whiteboard tab to inspect properties.</div>
                 </div>
             `;
            return;
        }
        container.innerHTML = `
            <div class="inspector-inner-wrapper">
                <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:14px; font-weight:600; color:var(--peak-primary);">Object Properties</h3>
                    <button class="icon-btn" onclick="window.closeInspector()"><i data-lucide="x"></i></button>
                </div>
                <div id="whiteboard-inspector-content" class="inspector-content whiteboard-properties-pane"></div>
            </div>
        `;
        if (window.attachWhiteboardInspector) {
            const contentPane = document.getElementById('whiteboard-inspector-content');
            if (contentPane) window.currentInspectorCleanup = window.attachWhiteboardInspector(contentPane);
        }
        if (window.lucide) window.lucide.createIcons();
        attachResizeListener(container);
        return;
    }

    const config = getInspectorConfig(type);
    const sortButtonHtml = type === 'notes'
        ? `<button class="icon-btn" id="btn-inspector-sort" title="Sort by ${noteSortMode === 'date' ? 'Tag' : 'Date'}"><i data-lucide="${noteSortMode === 'date' ? 'tag' : 'calendar'}"></i></button>`
        : '';

    container.innerHTML = `
        <div class="inspector-inner-wrapper">
            <div class="inspector-header" style="display:flex; justify-content:space-between; align-items:center;">
                <div class="inspector-search-wrapper" style="flex-grow: 1; max-width: 200px;">
                     <div class="search-icon"><i data-lucide="search"></i></div>
                     <input type="text" id="inspector-search" class="inspector-search-input" placeholder="${config.title}...">
                </div>
                <div class="header-actions" style="display:flex; align-items:center; margin-left:auto;">
                    ${sortButtonHtml}
                    <button class="icon-btn" id="btn-inspector-clear" title="Clear All"><i data-lucide="trash-2"></i></button>
                    <button class="icon-btn" onclick="window.closeInspector()"><i data-lucide="x"></i></button>
                </div>
            </div>
            <div id="inspector-content-list" class="inspector-content"></div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const renderList = (filter = "") => {
        const data = config.getData();
        let safeData = Array.isArray(data) ? [...data] : [];
        if (type === 'notes' && noteSortMode === 'tag') {
            safeData.sort((a, b) => {
                const tagA = (a.tags && a.tags.length > 0) ? a.tags[0].toLowerCase() : 'zzzz';
                const tagB = (b.tags && b.tags.length > 0) ? b.tags[0].toLowerCase() : 'zzzz';
                if (tagA < tagB) return -1; if (tagA > tagB) return 1;
                return b.createdAt - a.createdAt;
            });
        } else {
            if (safeData.length > 0) {
                if (safeData[0].timestamp) safeData.sort((a, b) => b.timestamp - a.timestamp);
                else if (safeData[0].createdAt) safeData.sort((a, b) => b.createdAt - a.createdAt);
            }
        }
        const filteredData = safeData.filter(item => config.filter(item, filter));
        const listHtml = filteredData.length > 0
            ? filteredData.map(item => config.renderItem(item)).join('')
            : `<div class="empty-inspector-state">No items found</div>`;
        const contentList = document.getElementById('inspector-content-list');
        if (contentList) {
            contentList.innerHTML = listHtml;
            attachContextMenu(contentList, type);
            if (window.lucide) window.lucide.createIcons();
        }
        attachResizeListener(container);
    };

    renderList();
    const searchInput = document.getElementById('inspector-search');
    if (searchInput) searchInput.addEventListener('input', (e) => renderList(e.target.value.toLowerCase()));
    const clearBtn = document.getElementById('btn-inspector-clear');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            if (confirm(`Delete all ${config.title}?`)) {
                config.clearAll();
                renderList();
            }
        });
    }
    const sortBtn = document.getElementById('btn-inspector-sort');
    if (sortBtn) {
        sortBtn.addEventListener('click', () => {
            noteSortMode = noteSortMode === 'date' ? 'tag' : 'date';
            renderInspector(type);
        });
    }
}

function getInspectorConfig(type) {
    const tm = window.tabManager;
    if (!tm) return { title: 'Error', getData: () => [], filter: () => false, renderItem: () => '' };

    switch (type) {
        case 'notes': return { title: 'Search Notes', getData: () => tm.noteStore ? tm.noteStore.get('notes', []) : [], filter: (item, f) => (item.title || 'Untitled').toLowerCase().includes(f) || (item.tags || []).some(t => t.toLowerCase().includes(f)), clearAll: () => { tm.noteStore.set('notes', []); }, deleteItem: (id) => { const notes = tm.noteStore.get('notes', []); tm.noteStore.set('notes', notes.filter(n => n.id != id)); }, renderItem: (item) => { const tagHtml = (item.tags && item.tags.length > 0) ? `<div style="display:flex; gap:4px; margin-top:4px;">${item.tags.slice(0, 3).map(t => `<span class="control-pill" style="font-size:10px; padding:2px 6px; background-color:var(--control-background-color); border:none;">${t}</span>`).join('')}</div>` : ''; return `<div class="inspector-list-item" onclick="window.openNoteFromHistory('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title || 'Untitled'}</div><div class="inspector-item-subtitle">${new Date(item.createdAt).toLocaleDateString()}</div>${tagHtml}</div></div>`; } };
        case 'chat': return { title: 'Search Chats', getData: () => tm.chatStore ? tm.chatStore.get('sessions', []) : [], filter: (item, f) => (item.title || 'New Chat').toLowerCase().includes(f), clearAll: () => { tm.chatStore.set('sessions', []); }, deleteItem: (id) => { const sessions = tm.chatStore.get('sessions', []); tm.chatStore.set('sessions', sessions.filter(s => s.id != id)); }, renderItem: (item) => `<div class="inspector-list-item" onclick="window.openChatFromHistory('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title || 'New Chat'}</div><div class="inspector-item-subtitle">${item.model || 'GPT-4o Mini'}</div></div></div>` };
        case 'terminal': return { title: 'Terminals', getData: () => tm.terminalStore ? tm.terminalStore.get('items', []) : [], filter: (item, f) => item.title.toLowerCase().includes(f), clearAll: () => { tm.terminalStore.set('items', []); }, deleteItem: (id) => { const i = tm.terminalStore.get('items', []); tm.terminalStore.set('items', i.filter(x => x.id != id)); }, renderItem: (item) => `<div class="inspector-list-item" onclick="window.openTerminalFromHistory('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title}</div><div class="inspector-item-subtitle">${new Date(item.createdAt).toLocaleString()}</div></div></div>` };
        case 'whiteboard': return { title: 'Whiteboards', getData: () => tm.whiteboardStore ? tm.whiteboardStore.get('items', []) : [], filter: (item, f) => item.title.toLowerCase().includes(f), clearAll: () => { tm.whiteboardStore.set('items', []); }, deleteItem: (id) => { const i = tm.whiteboardStore.get('items', []); tm.whiteboardStore.set('items', i.filter(x => x.id != id)); }, renderItem: (item) => `<div class="inspector-list-item" onclick="window.openWhiteboardFromHistory('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title}</div><div class="inspector-item-subtitle">${new Date(item.createdAt).toLocaleString()}</div></div></div>` };

        // --- ADDED MINDMAP & TASKS SUPPORT ---
        case 'mindmap': return {
            title: 'Mind Maps',
            getData: () => tm.mindMapStore ? tm.mindMapStore.get('maps', []) : [],
            filter: (item, f) => (item.title || 'Untitled').toLowerCase().includes(f),
            clearAll: () => { tm.mindMapStore.set('maps', []); },
            deleteItem: (id) => { const items = tm.mindMapStore.get('maps', []); tm.mindMapStore.set('maps', items.filter(i => i.id != id)); },
            renderItem: (item) => `<div class="inspector-list-item" onclick="window.openMindMapFromHistory('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title || 'Mind Map'}</div><div class="inspector-item-subtitle">${new Date(item.createdAt).toLocaleDateString()}</div></div></div>`
        };
        case 'tasks': return {
            title: 'Task Boards',
            getData: () => tm.kanbanStore ? tm.kanbanStore.get('boards', []) : [],
            filter: (item, f) => (item.title || 'Tasks').toLowerCase().includes(f),
            clearAll: () => { tm.kanbanStore.set('boards', []); },
            deleteItem: (id) => { const items = tm.kanbanStore.get('boards', []); tm.kanbanStore.set('boards', items.filter(i => i.id != id)); },
            renderItem: (item) => `<div class="inspector-list-item" onclick="window.openKanbanBoard('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title || 'Task Board'}</div><div class="inspector-item-subtitle">${new Date(item.createdAt || Date.now()).toLocaleDateString()}</div></div></div>`
        };
        // -------------------------------------

        case 'docs': return { title: 'Docs Sessions', getData: () => tm.docsStore ? tm.docsStore.get('items', []) : [], filter: (item, f) => item.title.toLowerCase().includes(f), clearAll: () => { tm.docsStore.set('items', []); }, deleteItem: (id) => { const i = tm.docsStore.get('items', []); tm.docsStore.set('items', i.filter(x => x.id != id)); }, renderItem: (item) => `<div class="inspector-list-item" onclick="window.openDocsFromHistory('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title}</div><div class="inspector-item-subtitle">${new Date(item.createdAt).toLocaleString()}</div></div></div>` };
        case 'log': return { title: 'Web History', getData: () => tm.historyStore ? tm.historyStore.get('items', []) : [], filter: (item, f) => (item.title || '').toLowerCase().includes(f) || (item.url || '').toLowerCase().includes(f), clearAll: () => { tm.historyStore.set('items', []); }, deleteItem: (id) => { const items = tm.historyStore.get('items', []); tm.historyStore.set('items', items.filter(i => i.id != id)); }, renderItem: (item) => { const bookmarks = tm.bookmarkStore ? tm.bookmarkStore.get('items', []) : []; const isBookmarked = bookmarks.some(b => b.url === item.url); const iconStyle = isBookmarked ? 'fill: var(--peak-accent); stroke: var(--peak-accent);' : 'fill: none; stroke: var(--peak-secondary);'; return `<div class="inspector-list-item" data-id="${item.id}"><div class="inspector-item-text" onclick="window.openUrlFromHistory('${item.url}')"><div class="inspector-item-title">${item.title || item.url}</div><div class="inspector-item-subtitle">${item.url}</div></div><button class="icon-btn" onclick="event.stopPropagation(); window.toggleBookmark('${item.url}', '${item.title?.replace(/'/g, "\\'")}')" title="${isBookmarked ? 'Remove Bookmark' : 'Add Bookmark'}"><i data-lucide="star" style="width:14px; height:14px; ${iconStyle}"></i></button></div>`; } };
        case 'session': return { title: 'Closed Tabs', getData: () => tm.closedTabsStore ? tm.closedTabsStore.get('items', []) : [], filter: (item, f) => (item.title || '').toLowerCase().includes(f), clearAll: () => { tm.closedTabsStore.set('items', []); }, deleteItem: (id) => { const items = tm.closedTabsStore.get('items', []); tm.closedTabsStore.set('items', items.filter(i => i.id != id)); }, renderItem: (item) => `<div class="inspector-list-item" onclick="window.restoreClosedTab('${item.id}')" data-id="${item.id}"><div class="inspector-item-text"><div class="inspector-item-title">${item.title || 'Tab'}</div><div class="inspector-item-subtitle">${item.type}</div></div></div>` };
        default: return { title: 'Search', getData: () => [], filter: () => false, renderItem: () => '' };
    }
}

function attachContextMenu(container, type) {
    container.addEventListener('contextmenu', (e) => {
        const item = e.target.closest('.inspector-list-item');
        if (!item) return;
        e.preventDefault();
        if (ipcRenderer) ipcRenderer.send('show-inspector-context-menu', { type, id: item.dataset.id });
    });
}

ipcRenderer.removeAllListeners('delete-inspector-item');
ipcRenderer.on('delete-inspector-item', (event, { type, id }) => {
    const config = getInspectorConfig(type);
    if (config && config.deleteItem) { config.deleteItem(id); refresh(); }
});

window.addEventListener('peak-project-file-selected', () => {
    if (currentMode === 'ai-assist') refresh();
});

// --- Session Management Helpers ---
window.showChatHistory = () => {
    open('chat-history');
};

window.loadChatSession = (id) => {
    if (window.peakMCPClient) {
        window.peakMCPClient.loadSession(id);
        open('ai-assist');
    }
};

window.startNewChatSession = () => {
    if (window.peakMCPClient) {
        window.peakMCPClient.startNewSession();
        open('ai-assist');
    }
};

function attachResizeListener(container) {
    let handle = container.querySelector('.inspector-resize-handle');
    if (!handle) {
        handle = document.createElement('div');
        handle.className = 'inspector-resize-handle';
        container.appendChild(handle);
    }

    let startX, startWidth;
    let overlay;

    const onDrag = (e) => {
        const newWidth = startWidth + (startX - e.clientX);
        console.log('[Inspector] Dragging. New Width:', newWidth);
        if (newWidth > 200 && newWidth < 1200) {
            container.style.width = `${newWidth}px`;
        }
    };

    const onStop = () => {
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', onStop);
        container.classList.remove('resizing');
        if (overlay) {
            overlay.remove();
            overlay = null;
        }
    };

    handle.addEventListener('mousedown', (e) => {
        console.log('[Inspector] Resize handle mousedown');
        startX = e.clientX;
        startWidth = container.offsetWidth;
        console.log('[Inspector] Start width:', startWidth, 'StartX:', startX);

        container.classList.add('resizing');

        // Create a global overlay to capture events over iframes
        overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.zIndex = '99999'; // Highest possible
        overlay.style.cursor = 'col-resize';
        document.body.appendChild(overlay);

        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', onStop);
        e.preventDefault();
    });
}

// --- EXPOSE GLOBAL FUNCTIONS ---
window.openInspector = open;
window.closeInspector = close;

module.exports = { toggle, open, close, refresh };