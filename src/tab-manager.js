// src/tab-manager.js
const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const { Fabric } = require('fabric'); 

function load(path) {
    try { return require(path); } 
    catch (e) { console.warn(`[Peak] Optional component missing: ${path}`); return null; }
}

const TabBar = load('./components/TabBar/index.js');
const GlobalToolbar = load('./components/GlobalToolbar/index.js');
const LandingPage = load('./components/LandingPage/index.js');
const WebView = load('./components/WebView/index.js');
const NoteEditor = load('./components/NoteEditor/index.js');
const ChatView = load('./components/ChatView/index.js');
const ProjectView = load('./components/ProjectView/index.js');
const TerminalView = load('./components/TerminalView/index.js');
const Dashboard = load('./components/Dashboard/index.js');
const MindMap = load('./components/MindMap/index.js');
const Kanban = load('./components/Kanban/index.js');
const Whiteboard = load('./components/Whiteboard/index.js');
const Docs = load('./components/Docs/index.js');
// NEW: Import SettingsView explicitly
const SettingsView = load('./components/SettingsView/index.js'); 

const ChatController = load('./controllers/ChatController.js');
const WhiteboardController = load('./controllers/WhiteboardController.js'); 
const Inspector = load('./components/Inspector/index.js'); 

// ... (Store Initialization - UNCHANGED) ...

let noteStore, chatStore, historyStore, closedTabsStore, bookmarkStore, mindMapStore, kanbanStore, terminalStore, whiteboardStore, docsStore, store;
let globalTabs = [];
let selectedTabId = null;
const tabCleanups = new Map(); 

try {
    const commonOpts = { clearInvalidConfig: true };
    noteStore = new Store({ name: 'notes', defaults: { notes: [] }, ...commonOpts });
    chatStore = new Store({ name: 'chats', defaults: { sessions: [] }, ...commonOpts });
    historyStore = new Store({ name: 'history', defaults: { items: [] }, ...commonOpts });
    closedTabsStore = new Store({ name: 'closedTabs', defaults: { items: [] }, ...commonOpts });
    bookmarkStore = new Store({ name: 'bookmarks', defaults: { items: [] }, ...commonOpts }); 
    mindMapStore = new Store({ name: 'mindmaps', defaults: { maps: [] }, ...commonOpts });
    kanbanStore = new Store({ name: 'kanban', defaults: { boards: [] }, ...commonOpts });
    terminalStore = new Store({ name: 'terminals', defaults: { items: [] }, ...commonOpts });
    whiteboardStore = new Store({ name: 'whiteboards', defaults: { items: [] }, ...commonOpts });
    docsStore = new Store({ name: 'docs', defaults: { items: [] }, ...commonOpts });
    
    store = new Store({ name: 'appState', ...commonOpts });

    globalTabs = store.get('openTabs', []);
    if (!globalTabs || !Array.isArray(globalTabs) || globalTabs.length === 0) {
        const id = Date.now();
        globalTabs = [{ id, title: 'New Tab', content: { type: 'empty', id, data: {}, viewMode: 'landing' } }];
        selectedTabId = id;
    } else {
        selectedTabId = store.get('selectedTabId', globalTabs[0].id);
    }
} catch (e) {
    console.error("Store Init Critical Error:", e);
    const safeId = Date.now();
    globalTabs = [{ id: safeId, title: 'New Tab', content: { type: 'empty', id: safeId, data: {}, viewMode: 'landing' } }];
    selectedTabId = safeId;
}

function getTabIcon(content) {
    switch(content.type) {
        case 'note': return 'file-text';
        case 'llmChat': return 'message-square';
        case 'web': return 'globe';
        case 'terminal': return 'terminal';
        case 'project': return 'folder-kanban';
        case 'mindmap': return 'git-fork';
        case 'whiteboard': return 'pen-tool';
        case 'kanban': return 'check-square';
        case 'docs': return 'book-open';
        default: return 'plus'; 
    }
}

function renderTabBarOnly() {
    if (!globalTabs) return;
    globalTabs.forEach(t => {
        t.icon = getTabIcon(t.content);
        if (!t.title) t.title = "New Tab";
    });
    const tabsEl = document.getElementById('tab-bar-container');
    if (tabsEl && TabBar) {
        tabsEl.innerHTML = TabBar.renderTabBar(globalTabs, selectedTabId);
        if (TabBar.attachTabListeners) TabBar.attachTabListeners();
    }
    
    const activeTab = globalTabs.find(t => t.id === selectedTabId);
    const addrBar = document.getElementById('global-address-bar-input');
    if (addrBar && activeTab) {
        const { type, data } = activeTab.content;
        if (type === 'web') {
             if (WebView && WebView.updateWebViewUI) WebView.updateWebViewUI(activeTab.id);
        } else {
             const backBtn = document.getElementById('global-nav-back');
             const fwdBtn = document.getElementById('global-nav-forward');
             if(backBtn) backBtn.disabled = true;
             if(fwdBtn) fwdBtn.disabled = true;
             
             if (type === 'project') addrBar.value = `project://${data.title}`;
             else if (type === 'mindmap') addrBar.value = `mindmap://${data.title}`;
             else if (type === 'whiteboard') addrBar.value = `peak://whiteboard`;
             else if (type === 'kanban') addrBar.value = `peak://tasks`;
             else if (type === 'docs') addrBar.value = `peak://docs`;
             else if (type !== 'empty') addrBar.value = `${type}://${activeTab.title}`;
             else addrBar.value = '';
        }
    }
    if (window.lucide) window.lucide.createIcons();
}

// ... (saveCurrentMindMap, saveKanban, getRecentActivity - UNCHANGED) ...
function saveCurrentMindMap(id, newData) {
    if (!mindMapStore) return;
    const maps = mindMapStore.get('maps', []);
    const idx = maps.findIndex(m => m.id === id);
    if (idx > -1) {
        maps[idx] = newData;
        mindMapStore.set('maps', maps);
    } else {
        maps.unshift(newData);
        mindMapStore.set('maps', maps);
    }
    const tab = globalTabs.find(t => t.content.type === 'mindmap' && t.content.id === id);
    if (tab) {
        tab.content.data = newData;
        tab.title = newData.title || 'Mind Map';
    }
    saveTabs();
}

function saveKanban(boardData) {
    if (!kanbanStore) return;
    const boards = kanbanStore.get('boards', []);
    const idx = boards.findIndex(b => b.id === boardData.id);
    
    if (idx > -1) boards[idx] = boardData;
    else boards.push(boardData);
    
    kanbanStore.set('boards', boards);
    
    const tab = globalTabs.find(t => t.content.type === 'kanban' && t.content.data.id === boardData.id);
    if (tab) tab.title = boardData.title || 'Task Board';
    saveTabs();
}

function getRecentActivity() {
    let activity = [];
    if (historyStore) { activity.push(...historyStore.get('items', []).map(i => ({ ...i, type: 'web', icon: 'globe', sortTime: i.timestamp }))); }
    if (chatStore) { activity.push(...chatStore.get('sessions', []).map(i => ({ ...i, type: 'chat', icon: 'message-square', sortTime: i.timestamp || i.createdAt }))); }
    if (noteStore) { activity.push(...noteStore.get('notes', []).map(i => ({ ...i, type: 'note', icon: 'file-text', sortTime: i.createdAt }))); }
    if (mindMapStore) { activity.push(...mindMapStore.get('maps', []).map(i => ({ ...i, type: 'mindmap', icon: 'git-fork', sortTime: i.createdAt }))); }
    if (whiteboardStore) { activity.push(...whiteboardStore.get('items', []).map(i => ({ ...i, type: 'whiteboard', icon: 'pen-tool', sortTime: i.createdAt }))); }
    if (kanbanStore) { activity.push(...kanbanStore.get('boards', []).map(i => ({ ...i, type: 'kanban', icon: 'check-square', sortTime: i.createdAt || 0 }))); }
    return activity.sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
}

async function renderContentOnly() {
    const contentArea = document.getElementById('main-content-area');
    if (!contentArea) return;

    const allContainers = contentArea.querySelectorAll('.tab-content-wrapper');
    allContainers.forEach(el => el.style.display = 'none');

    let activeTab = globalTabs.find(t => t.id === selectedTabId);
    if (!activeTab && globalTabs.length > 0) {
        selectedTabId = globalTabs[0].id;
        activeTab = globalTabs[0];
        saveTabs();
    }
    if (!activeTab) return;

    let container = document.getElementById(`tab-content-${activeTab.id}`);
    const { type, id, data, viewMode } = activeTab.content;
    
    const isReactiveView = ['note', 'llmChat', 'project', 'empty', 'mindmap', 'kanban', 'whiteboard'].includes(type);

    if (!container) {
        container = document.createElement('div');
        container.id = `tab-content-${activeTab.id}`;
        container.className = 'tab-content-wrapper';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.display = 'flex'; 
        container.style.flexDirection = 'column';
        contentArea.appendChild(container);
    } else {
        container.style.display = 'flex';
        if (type === 'terminal') {
            window.dispatchEvent(new CustomEvent('terminal-tab-shown', { detail: { id: activeTab.id } }));
            return;
        }
        if (!isReactiveView) return;
        
        if (tabCleanups.has(activeTab.id)) {
            try { tabCleanups.get(activeTab.id)(); } catch(e) {}
            tabCleanups.delete(activeTab.id);
        }
        container.innerHTML = ''; 
    }

    let cleanup = null;
    try {
        if (type === 'empty') {
            if (viewMode === 'dashboard' && Dashboard) {
                const recentActivity = getRecentActivity();
                const bookmarks = bookmarkStore ? bookmarkStore.get('items', []) : []; 
                container.innerHTML = Dashboard.renderDashboardHTML(recentActivity, bookmarks);
                cleanup = Dashboard.attachDashboardListeners();
            } else {
                container.innerHTML = LandingPage.renderLandingPageHTML(activeTab.id);
                cleanup = LandingPage.attachLandingPageListeners(activeTab.id);
            }
        } else if (type === 'web' && WebView) {
            container.innerHTML = WebView.getWebViewComponent(data.url, activeTab.id);
            cleanup = WebView.attachWebViewListeners(data, activeTab.id);
        } else if (type === 'note' && NoteEditor) {
            const note = noteStore ? noteStore.get('notes', []).find(n => n.id === id) : null;
            if (note) {
                activeTab.content.data = note; 
                container.innerHTML = NoteEditor.renderNoteEditorHTML(note, activeTab.id);
                cleanup = NoteEditor.attachNoteEditorListeners(note, container);
            } else container.innerHTML = `<div class="error">Note not found.</div>`;
        } else if (type === 'llmChat' && ChatView) {
            const chat = chatStore ? chatStore.get('sessions', []).find(s => s.id === id) : null;
            if (chat) {
                activeTab.content.data = chat; 
                container.innerHTML = ChatView.renderChatViewHTML(chat, activeTab.id);
                cleanup = ChatView.attachChatViewListeners(chat, container);
            } else container.innerHTML = `<div class="error">Chat session not found.</div>`;
        } else if (type === 'project' && ProjectView) {
            ProjectView.renderProjectViewHTML(data, container); 
            cleanup = await ProjectView.attachProjectViewListeners(data, container);
        } else if (type === 'terminal' && TerminalView) {
            TerminalView.renderTerminalHTML(activeTab, container);
            cleanup = TerminalView.attachTerminalListeners(activeTab, container);
        } else if (type === 'mindmap' && MindMap) {
            container.innerHTML = MindMap.renderMindMapHTML(data);
            cleanup = MindMap.attachMindMapListeners(data, container, (newData) => {
                saveCurrentMindMap(id, newData);
            });
        } else if (type === 'kanban' && Kanban) {
            if (data && data.id) {
                container.innerHTML = Kanban.renderKanbanHTML(data);
                cleanup = Kanban.attachKanbanListeners(data, container, saveKanban);
            } else {
                const boards = kanbanStore ? kanbanStore.get('boards', []) : [];
                container.innerHTML = renderKanbanSelectorHTML(boards);
                cleanup = attachKanbanSelectorListeners(container);
            }
        } else if (type === 'whiteboard' && Whiteboard) {
            const boardId = data.id || activeTab.id; 
            const savedItem = whiteboardStore ? whiteboardStore.get('items', []).find(i => i.id === boardId) : null;
            const initialData = savedItem?.data ? { data: savedItem.data, title: savedItem.title } : {}; 
            if(savedItem?.title) activeTab.title = savedItem.title; 
            
            container.innerHTML = Whiteboard.renderWhiteboardHTML(boardId, initialData);
            cleanup = Whiteboard.attachWhiteboardListeners(boardId, initialData);
        } else if (type === 'docs' && Docs) {
            container.innerHTML = Docs.renderDocsHTML();
            cleanup = Docs.attachDocsListeners();
        }
    } catch (err) {
        console.error("Render Content Error:", err);
        container.innerHTML = `<div class="error">Error rendering ${type}: ${err.message}</div>`;
    }
    
    if (cleanup) tabCleanups.set(activeTab.id, cleanup);
    if (window.lucide) window.lucide.createIcons();
    saveTabs();
}

// ... (Kanban selector helpers - UNCHANGED) ...
function renderKanbanSelectorHTML(boards) {
    const list = boards.map(b => `
        <div class="bookmark-item" onclick="window.openKanbanBoard('${b.id}')">
            <div class="bookmark-delete" onclick="event.stopPropagation(); window.deleteKanbanBoard('${b.id}')"><i data-lucide="x"></i></div>
            <div class="bookmark-icon" style="background:rgba(128,128,128,0.05);display:flex;align-items:center;justify-content:center;">
                <i data-lucide="layout-kanban" style="color:var(--peak-primary);"></i>
            </div>
            <div class="bookmark-text"><span class="bookmark-title">${b.title}</span></div>
        </div>
    `).join('');

    return `
        <div id="dashboard-content" class="centered-content-container">
            <div class="dashboard-vstack">
                <div class="dashboard-header">
                    <h1 class="dashboard-title">My Task Boards</h1>
                </div>
                <div class="bookmark-grid" id="kanban-selector-grid">
                    ${list}
                    <div class="bookmark-item" id="btn-create-new-board" style="cursor:pointer;">
                        <div class="bookmark-icon" style="border:2px dashed var(--border-color);background:transparent;display:flex;align-items:center;justify-content:center;">
                            <i data-lucide="plus" style="color:var(--peak-secondary);"></i>
                        </div>
                        <div class="bookmark-text"><span class="bookmark-title" style="color:var(--peak-secondary);">New Board</span></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function attachKanbanSelectorListeners(container) {
    const btnNew = container.querySelector('#btn-create-new-board');
    if (btnNew) {
        btnNew.addEventListener('click', (e) => {
            if (btnNew.querySelector('input')) return;
            const originalContent = btnNew.innerHTML;
            btnNew.innerHTML = `
                <input type="text" id="new-board-input" placeholder="Name..." 
                       style="width:90%; border:1px solid var(--peak-accent); border-radius:4px; padding:4px; font-size:12px; text-align:center; outline:none;">
            `;
            const input = btnNew.querySelector('input');
            input.focus();
            const confirmCreation = () => {
                const title = input.value.trim() || "New Project";
                const newBoard = {
                    id: 'board-' + Date.now(),
                    title: title,
                    description: 'Add a description...',
                    columns: [ { id: 'c1', title: 'To Do', items: [] }, { id: 'c2', title: 'In Progress', items: [] }, { id: 'c3', title: 'Done', items: [] } ],
                    createdAt: Date.now()
                };
                if (kanbanStore) {
                    const boards = kanbanStore.get('boards', []);
                    boards.push(newBoard);
                    kanbanStore.set('boards', boards);
                }
                openKanbanBoard(newBoard.id);
            };
            input.addEventListener('keydown', (ev) => {
                if (ev.key === 'Enter') { ev.preventDefault(); confirmCreation(); } 
                else if (ev.key === 'Escape') { ev.preventDefault(); btnNew.innerHTML = originalContent; if(window.lucide) window.lucide.createIcons(); }
            });
            input.addEventListener('blur', (ev) => {
                setTimeout(() => {
                    if (document.activeElement !== input) {
                        if (input.value.trim()) confirmCreation();
                        else { btnNew.innerHTML = originalContent; if(window.lucide) window.lucide.createIcons(); }
                    }
                }, 100);
            });
        });
    }
    if(window.lucide) window.lucide.createIcons();
    container.addEventListener('click', (e) => { if (e.target.closest('.bookmark-delete')) return; });
    return () => {};
}

// ... (openKanbanBoard, etc - UNCHANGED) ...
function openKanbanBoard(boardId) {
    const existingTab = globalTabs.find(t => t.content.type === 'kanban' && t.content.data && t.content.data.id === boardId);
    if (existingTab) { selectTab(existingTab.id); return; }
    const boards = kanbanStore ? kanbanStore.get('boards', []) : [];
    const boardData = boards.find(b => b.id === boardId);
    if (boardData) {
        const current = globalTabs.find(t => t.id === selectedTabId);
        if (current && current.content.type === 'kanban' && !current.content.data.id) {
            current.content.data = boardData;
            current.title = boardData.title;
            renderContentOnly();
            saveTabs();
        } else {
            const id = Date.now();
            globalTabs.push({ id, title: boardData.title, content: { type: 'kanban', id, data: boardData } });
            selectTab(id);
        }
    }
}

function deleteKanbanBoard(boardId) {
    if (!kanbanStore) return;
    const boards = kanbanStore.get('boards', []);
    const newBoards = boards.filter(b => b.id !== boardId);
    kanbanStore.set('boards', newBoards);
    const tab = globalTabs.find(t => t.content.type === 'kanban' && t.content.data.id === boardId);
    if (tab) {
        tab.content.data = {}; 
        tab.title = 'Tasks';
        if (selectedTabId === tab.id) renderContentOnly();
    } else {
        const active = globalTabs.find(t => t.id === selectedTabId);
        if (active && active.content.type === 'kanban' && !active.content.data.id) {
            renderContentOnly();
        }
    }
    refreshInspector();
}

function logHistoryItem(url, title) {
    if (!historyStore) return;
    const items = historyStore.get('items', []);
    if (items.length > 0 && items[0].url === url) return;
    const newItem = { id: Date.now(), url, title: title || url, timestamp: Date.now() };
    items.unshift(newItem);
    if (items.length > 200) items.pop();
    historyStore.set('items', items);
    refreshInspector();
}

function toggleBookmark(url, title) {
    if (!bookmarkStore) return;
    const bookmarks = bookmarkStore.get('items', []);
    const index = bookmarks.findIndex(b => b.url === url);
    if (index > -1) bookmarks.splice(index, 1);
    else {
        bookmarks.push({
            id: Date.now(),
            url,
            title: title || new URL(url).hostname,
            icon: `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64` 
        });
    }
    bookmarkStore.set('items', bookmarks);
    const activeTab = globalTabs.find(t => t.id === selectedTabId);
    if (activeTab && activeTab.content.type === 'empty' && activeTab.content.viewMode === 'dashboard') {
        renderContentOnly();
    }
    refreshInspector();
}

function reorderBookmarks(fromIndex, toIndex) {
    if (!bookmarkStore || fromIndex === toIndex) return;
    const items = bookmarkStore.get('items', []);
    if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return;
    const item = items.splice(fromIndex, 1)[0];
    items.splice(toIndex, 0, item);
    bookmarkStore.set('items', items);
    const activeTab = globalTabs.find(t => t.id === selectedTabId);
    if (activeTab && activeTab.content.type === 'empty' && activeTab.content.viewMode === 'dashboard') {
        renderContentOnly();
    }
}

function restoreClosedTab(id) {
    if (!closedTabsStore) return;
    const items = closedTabsStore.get('items', []);
    const item = items.find(i => i.id == id);
    if (item) {
        globalTabs.push({ id: Date.now(), title: item.title, content: item.content });
        closedTabsStore.set('items', items.filter(i => i.id != id));
        selectTab(globalTabs[globalTabs.length - 1].id);
        refreshInspector();
    }
}

function openExistingTab(type, id) {
    const existingTab = globalTabs.find(t => t.content.type === type && t.content.id === id);
    if (existingTab) { selectTab(existingTab.id); return; }
    
    let data, title;
    if (type === 'note' && noteStore) {
        data = noteStore.get('notes', []).find(n => n.id === id);
        title = data?.title || 'Note';
    } 
    else if (type === 'llmChat' && chatStore) {
        data = chatStore.get('sessions', []).find(s => s.id === id);
        title = data?.title || 'Chat';
    }

    if (data) {
        const tabId = Date.now();
        globalTabs.push({ id: tabId, title: title, content: { type, id, data } });
        selectTab(tabId);
    }
}

function setEmptyTabMode(mode) {
    const activeTab = globalTabs.find(t => t.id === selectedTabId);
    if (activeTab && activeTab.content.type === 'empty') {
        activeTab.content.viewMode = mode;
        renderContentOnly(); 
    }
}

function openMindMapFromHistory(id) {
    const existingTab = globalTabs.find(t => t.content.type === 'mindmap' && t.content.id === id);
    if (existingTab) { selectTab(existingTab.id); return; }
    const maps = mindMapStore.get('maps', []);
    const mapData = maps.find(m => m.id == id);
    if (mapData) {
        const tabId = Date.now();
        globalTabs.push({ id: tabId, title: mapData.title, content: { type: 'mindmap', id, data: mapData } });
        selectTab(tabId);
    }
}

function openTerminalFromHistory(id) { handlePerformAction({ mode: 'Terminal', query: '' }); }
function openWhiteboardFromHistory(id) { 
    const existingTab = globalTabs.find(t => t.content.type === 'whiteboard' && t.content.id === id);
    if (existingTab) { selectTab(existingTab.id); return; }
    
    const items = whiteboardStore.get('items', []);
    const itemData = items.find(i => i.id == id);
    if (itemData) {
        const tabId = Date.now();
        globalTabs.push({ id: tabId, title: itemData.title, content: { type: 'whiteboard', id, data: itemData } });
        selectTab(tabId);
    }
}
function openDocsFromHistory(id) { handlePerformAction({ mode: 'Docs' }); }

function refreshInspector() {
    if (Inspector && Inspector.refresh) Inspector.refresh();
}

function getActiveTab() {
    return globalTabs.find(t => t.id === selectedTabId);
}

function setupGlobalNavigation() {
    const getActiveWebview = () => {
        const container = document.getElementById(`tab-content-${selectedTabId}`);
        return container ? container.querySelector('webview') : null;
    };
    const btnBack = document.getElementById('global-nav-back');
    const btnFwd = document.getElementById('global-nav-forward');
    const btnReload = document.getElementById('global-nav-reload');

    if (btnBack) btnBack.onclick = () => { const wv = getActiveWebview(); if(wv && wv.canGoBack()) wv.goBack(); };
    if (btnFwd) btnFwd.onclick = () => { const wv = getActiveWebview(); if(wv && wv.canGoForward()) wv.goForward(); };
    if (btnReload) btnReload.onclick = () => { 
        const wv = getActiveWebview(); 
        if(wv) wv.reload(); else reloadActiveTab();
    };
}

async function renderView() {
    // --- FIX: Check if we are in "Settings Mode" ---
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('settingsMode') === 'true') {
        // 1. Hide main app UI elements
        const toolbar = document.getElementById('global-toolbar-container');
        const tabBar = document.getElementById('tab-bar-container');
        const contentArea = document.getElementById('main-content-area');
        const inspector = document.getElementById('inspector-container');
        
        if (toolbar) toolbar.style.display = 'none';
        if (tabBar) tabBar.style.display = 'none';
        if (inspector) inspector.style.display = 'none';
        
        // 2. Render ONLY Settings
        if (contentArea && SettingsView) {
            // We fetch settings via IPC first
            const settings = await ipcRenderer.invoke('get-all-settings');
            contentArea.innerHTML = SettingsView.renderSettingsHTML(settings);
            SettingsView.attachSettingsListeners();
            if (window.lucide) window.lucide.createIcons();
        } else {
            contentArea.innerHTML = '<div style="padding:20px;">Error loading settings view.</div>';
        }
        return; // STOP here, do not render tabs/etc
    }
    // -----------------------------------------------

    const toolbarEl = document.getElementById('global-toolbar-container');
    if (toolbarEl && GlobalToolbar && toolbarEl.innerHTML === "") {
        toolbarEl.innerHTML = GlobalToolbar.renderGlobalToolbar();
        const addrInput = document.getElementById('global-address-bar-input');
        if (addrInput) addrInput.addEventListener('keydown', handleAddressBarEnter);
        setupGlobalNavigation();
    }
    
    ipcRenderer.removeAllListeners('whiteboard-save-data');
    ipcRenderer.on('whiteboard-save-data', (event, id, data, title) => {
        const newTitle = WhiteboardController.save(id, data, title);
        const activeTab = globalTabs.find(t => t.content.type === 'whiteboard' && t.content.id === Number(id));
        if(activeTab && activeTab.title !== newTitle) {
            activeTab.title = newTitle;
            renderTabBarOnly();
            saveTabs();
        }
        refreshInspector();
    });
    
    ipcRenderer.removeAllListeners('whiteboard-action');
    ipcRenderer.on('whiteboard-action', async (event, data) => {
        const activeEngine = window.activeWhiteboardEngine; 
        if (!activeEngine) return;
        
        const action = data.action;
        const activeObjects = activeEngine.canvas.getActiveObjects();
        
        if (action === 'copy') { activeEngine.groupSystem.copy(); }
        else if (action === 'paste') { activeEngine.groupSystem.paste(); }
        else if (action === 'group') { activeEngine.groupSystem.groupSelected(); }
        else if (action === 'ungroup') { activeEngine.groupSystem.ungroupSelected(); }
        else if (action === 'copyPng') { await activeEngine.exportSelectedToClipboard(); }
        
        else if (action === 'bringForward') { activeEngine.layerSystem.bringForward(activeObjects); }
        else if (action === 'sendBackwards') { activeEngine.layerSystem.sendBackwards(activeObjects); }
        else if (action === 'bringToFront') { activeEngine.layerSystem.bringToFront(activeObjects); }
        else if (action === 'sendToBack') { activeEngine.layerSystem.sendToBack(activeObjects); }
        
        else if (action === 'delete') {
            if (activeObjects.length) {
                activeEngine.canvas.remove(...activeObjects);
                activeEngine.canvas.discardActiveObject();
                activeEngine.canvas.requestRenderAll();
                activeEngine.debouncedSave();
            }
        }
    });
    
    renderTabBarOnly();
    await renderContentOnly();
}

function saveTabs() {
    if (!store) return;
    const toSave = globalTabs.map(t => ({
        id: t.id, title: t.title,
        content: { type: t.content.type, id: t.content.id, data: t.content.data, viewMode: t.content.viewMode || 'landing' }
    }));
    store.set('openTabs', toSave);
    store.set('selectedTabId', selectedTabId);
}

function selectTab(id) {
    const found = globalTabs.find(t => t.id == id);
    if (found) {
        selectedTabId = found.id;
        renderTabBarOnly();
        requestAnimationFrame(() => renderContentOnly());
    }
}
function closeTab(id) {
    const idx = globalTabs.findIndex(t => t.id == id);
    if (idx > -1) {
        const tabToClose = globalTabs[idx];
        if (closedTabsStore && tabToClose.content.type !== 'empty') {
            const closedItems = closedTabsStore.get('items', []);
            closedItems.unshift({ 
                id: Date.now(), title: tabToClose.title, type: tabToClose.content.type, content: tabToClose.content, timestamp: Date.now()
            });
            if (closedItems.length > 20) closedItems.pop();
            closedTabsStore.set('items', closedItems);
            refreshInspector();
        }
        const cleanup = tabCleanups.get(id);
        if (cleanup) { try { cleanup(); } catch(e) {} tabCleanups.delete(id); }
        const el = document.getElementById(`tab-content-${id}`);
        if (el) el.remove();
        globalTabs.splice(idx, 1);
        if (selectedTabId == id) {
            if (globalTabs.length > 0) selectTab(globalTabs[Math.max(0, idx - 1)].id);
            else addTab('empty');
        } else {
            renderTabBarOnly();
            saveTabs();
        }
    }
}
function closeActiveTab() { if (selectedTabId) closeTab(selectedTabId); }
function reloadActiveTab() { renderContentOnly(); }
function reorderTabs(from, to) { if (from === to) return; const item = globalTabs.splice(from, 1)[0]; globalTabs.splice(to, 0, item); renderTabBarOnly(); saveTabs(); }
function navigateTab(dir) { const idx = globalTabs.findIndex(t => t.id === selectedTabId); if (idx === -1) return; let newIdx = idx + dir; if (newIdx < 0) newIdx = globalTabs.length - 1; if (newIdx >= globalTabs.length) newIdx = 0; selectTab(globalTabs[newIdx].id); }
function setActiveTab(id) { selectTab(id); }
function addTab(type='empty') {
    if (type==='note'||type==='chat') { handlePerformAction({mode: type==='note'?'Note':'LLM', query: type==='note'?'Untitled':''}); return; }
    const id = Date.now();
    globalTabs.push({ id, title: 'New Tab', content: { type: 'empty', id, data: {}, viewMode: 'landing' } });
    selectTab(id);
}
async function handlePerformAction(data) {
    const id = Date.now();
    let newContent = null;
    let title = data.query;
    if (data.mode === 'Search') {
        const SearchEngine = require('./utils/enums.js').SearchEngine;
        const engine = SearchEngine.find(e => e.id === data.engine);
        const prefix = engine ? engine.url : 'https://google.com/search?q=';
        let url = data.query;
        if (!url.startsWith('http') && !url.includes('://')) {
            if (url.includes('.') && !url.includes(' ')) url = 'https://' + url;
            else url = prefix + encodeURIComponent(url);
        }
        newContent = { type: 'web', id, data: { url } };
    } else if (data.mode === 'Note') {
        const note = { id, title: data.query || 'Untitled', blocks: [], createdAt: Date.now() };
        const notes = noteStore.get('notes', []); notes.unshift(note); noteStore.set('notes', notes);
        newContent = { type: 'note', id, data: note };
        refreshInspector();
    } else if (data.mode === 'LLM') {
        const session = { id, title: 'New Chat', messages: [], model: data.model || 'gpt-4o-mini', createdAt: Date.now() };
        const sessions = chatStore.get('sessions', []); sessions.unshift(session); chatStore.set('sessions', sessions);
        newContent = { type: 'llmChat', id, data: session };
        title = "New Chat";
        refreshInspector();
    } else if (data.mode === 'Terminal') {
        const items = terminalStore.get('items', []);
        items.unshift({ id, title: 'Terminal Session', createdAt: Date.now() });
        terminalStore.set('items', items);
        refreshInspector();
        newContent = { type: 'terminal', id, data: { initialCommand: data.query } };
        title = "Terminal";
    } else if (data.mode === 'Project') {
        try {
            const path = await ipcRenderer.invoke('project:open-dialog');
            if (!path) { if (LandingPage) LandingPage.resetLandingPageSubmitGuard(); return; }
            title = path.split(/[\\/]/).pop();
            newContent = { type: 'project', id, data: { path, title } };
        } catch(e) { console.error(e); return; }
    } else if (data.mode === 'Mind Map') {
        const newMap = { id, title: data.query || 'Central Idea', nodes: [], createdAt: Date.now() };
        const maps = mindMapStore.get('maps', []);
        maps.unshift(newMap);
        mindMapStore.set('maps', maps);
        refreshInspector();
        newContent = { type: 'mindmap', id, data: newMap };
        title = "Mind Map";
    } else if (data.mode === 'Whiteboard') {
        const items = whiteboardStore.get('items', []);
        const newItem = { id, title: data.query || 'Whiteboard Session', createdAt: Date.now(), data: {} };
        items.unshift(newItem);
        whiteboardStore.set('items', items);
        refreshInspector();
        newContent = { type: 'whiteboard', id, data: newItem };
        title = newItem.title;
    } else if (data.mode === 'Tasks') { 
        if (data.query && data.query.trim() !== '') {
             const newBoardId = 'board-' + Date.now();
             const newBoard = {
                 id: newBoardId,
                 title: data.query, 
                 description: 'New Task Board',
                 columns: [
                     { id: 'col-todo', title: 'To Do', items: [] },
                     { id: 'col-progress', title: 'In Progress', items: [] },
                     { id: 'col-done', title: 'Done', items: [] }
                 ],
                 createdAt: Date.now()
             };

             const boards = kanbanStore.get('boards', []);
             boards.push(newBoard);
             kanbanStore.set('boards', boards);

             newContent = { type: 'kanban', id, data: newBoard };
             title = newBoard.title;
             refreshInspector(); 
        } else {
            newContent = { type: 'kanban', id, data: {} };
            title = "Tasks";
        }
    } else if (data.mode === 'Docs') {
        const items = docsStore.get('items', []);
        items.unshift({ id, title: 'DevDocs Session', createdAt: Date.now() });
        docsStore.set('items', items);
        refreshInspector();
        newContent = { type: 'docs', id, data: {} };
        title = "DevDocs";
    }

    if (newContent) {
        const current = globalTabs.find(t => t.id === selectedTabId);
        if (current && current.content.type === 'empty') {
            const oldContainer = document.getElementById(`tab-content-${selectedTabId}`);
            if (oldContainer) { if(tabCleanups.has(selectedTabId)) tabCleanups.get(selectedTabId)(); oldContainer.remove(); }
            current.content = newContent;
            current.title = title;
            renderTabBarOnly();
            renderContentOnly();
        } else {
            globalTabs.push({ id, title, content: newContent });
            selectTab(id);
        }
        if (data.mode === 'LLM' && data.query) {
            setTimeout(() => {
                 if (ChatController && ChatController.sendChatMessage) ChatController.sendChatMessage(id, data.query, data.model);
            }, 200);
        }
    }
}
function handleAddressBarEnter(e) {
    if (e.key === 'Enter') {
        const query = e.target.value.trim();
        if (!query) return;
        let mode = 'Search';
        let cleanQuery = query;
        if (query.startsWith('note://')) { mode = 'Note'; cleanQuery = query.replace('note://',''); }
        else if (query.startsWith('term://')) { mode = 'Terminal'; cleanQuery = query.replace('term://',''); }
        else if (query.startsWith('chat://')) { mode = 'LLM'; cleanQuery = query.replace('chat://',''); }
        else if (query.startsWith('project://')) { mode = 'Project'; cleanQuery = query.replace('project://',''); }
        handlePerformAction({ mode, query: cleanQuery, engine: 'google' });
        e.target.blur(); 
    }
}
module.exports = {
    renderView, setActiveTab, addTab, closeTab, handlePerformAction, selectTab, reorderTabs, navigateTab, openExistingTab, closeActiveTab, reloadActiveTab,
    logHistoryItem, restoreClosedTab, setEmptyTabMode, toggleBookmark, reorderBookmarks, 
    openMindMapFromHistory, openTerminalFromHistory, openWhiteboardFromHistory, openDocsFromHistory, 
    openKanbanBoard, deleteKanbanBoard, refreshInspector, openExistingTab, 
    getActiveTab, 
    get noteStore() { return noteStore; },
    get chatStore() { return chatStore; },
    get historyStore() { return historyStore; }, 
    get closedTabsStore() { return closedTabsStore; }, 
    get bookmarkStore() { return bookmarkStore; }, 
    get mindMapStore() { return mindMapStore; }, 
    get kanbanStore() { return kanbanStore; },
    get terminalStore() { return terminalStore; }, 
    get whiteboardStore() { return whiteboardStore; }, 
    get docsStore() { return docsStore; }, 
    get store() { return store; }, 
    addNoteBlock: (id, t, c) => require('./controllers/NoteController.js').addNoteBlock(id, t, c),
    updateNoteBlock: (id, b, c) => require('./controllers/NoteController.js').updateNoteBlock(id, b, c),
    handleTodoToggle: (id, b, c) => require('./controllers/NoteController.js').handleTodoToggle(id, b, c),
    deleteNoteBlock: (id, b) => require('./controllers/NoteController.js').deleteNoteBlock(id, b),
    moveNoteBlock: (id, s, t, p) => require('./controllers/NoteController.js').moveNoteBlock(id, s, t, p),
    sendChatMessage: (id, c, m, f) => ChatController.sendChatMessage(id, c, m, f),
    stopChatStream: () => ChatController.stopChatStream(),
    addNoteTag: (id, t) => require('./controllers/NoteController.js').addNoteTag(id, t),
    removeNoteTag: (id, t) => require('./controllers/NoteController.js').removeNoteTag(id, t),
};