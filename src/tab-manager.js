// src/tab-manager.js
const { ipcRenderer } = require('electron');
const Store = require('electron-store');

function load(path) {
    try { return require(path); }
    catch (e) { console.warn(`[Peak] Optional component missing: ${path}`, e); return null; }
}

// --- Component Imports ---
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
const SettingsView = load('./components/SettingsView/index.js');
const Finder = load('./components/Finder/index.js');
const Workspaces = load('./components/Workspaces/index.js'); // NEW IMPORT

const ChatController = load('./controllers/ChatController.js');
const WhiteboardController = load('./controllers/WhiteboardController.js');
const Inspector = load('./components/Inspector/index.js');

// --- Store Setup ---
let noteStore, chatStore, historyStore, closedTabsStore, bookmarkStore, mindMapStore, kanbanStore, terminalStore, whiteboardStore, docsStore, workspaceStore, store;
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
    workspaceStore = new Store({ name: 'workspaces', defaults: { items: [] }, ...commonOpts }); // NEW STORE

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

// --- Helper Functions ---

function getTabIcon(content) {
    switch (content.type) {
        case 'note': return 'file-text';
        case 'llmChat': return 'message-square';
        case 'web': return 'globe';
        case 'terminal': return 'terminal';
        case 'project': return 'folder-kanban';
        case 'mindmap': return 'git-fork';
        case 'whiteboard': return 'pen-tool';
        case 'kanban': return 'check-square';
        case 'docs': return 'book-open';
        case 'finder': return 'hard-drive';
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

        // Update Navigation Buttons State
        const backBtn = document.getElementById('global-nav-back');
        const fwdBtn = document.getElementById('global-nav-forward');

        if (backBtn && fwdBtn) {
            // Reset first
            backBtn.disabled = true;
            fwdBtn.disabled = true;

            if (type === 'web') {
                if (WebView && WebView.updateWebViewUI) WebView.updateWebViewUI(activeTab.id);
            } else if (type === 'project') {
                // Project navigation state is handled by the ProjectView's internal logic updating these buttons
            }
        }

        if (type === 'web') {
            // UI updated via WebView helper above
        } else {
            if (type === 'project') addrBar.value = `project://${data.title}`;
            else if (type === 'mindmap') addrBar.value = `mindmap://${data.title}`;
            else if (type === 'whiteboard') addrBar.value = `peak://whiteboard`;
            else if (type === 'kanban') addrBar.value = `peak://tasks`;
            else if (type === 'docs') addrBar.value = `peak://docs`;
            else if (type === 'finder') addrBar.value = `file://${data.path || 'home'}`;
            else if (type !== 'empty') addrBar.value = `${type}://${activeTab.title}`;
            else addrBar.value = '';
        }
    }
    if (window.lucide) window.lucide.createIcons();
}

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

// --- CORE RENDERING LOGIC ---

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

    const isReactiveView = ['note', 'llmChat', 'empty', 'mindmap', 'kanban', 'whiteboard', 'finder'].includes(type);

    // Preserve scroll position helper (defined here for scope access)
    let savedScrollTop = 0;
    const restoreScroll = () => {
        const newScroller = container ? container.querySelector('.note-editor-scroller') : null;
        if (newScroller) newScroller.scrollTop = savedScrollTop;
    };

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

        if (type === 'project') {
            window.dispatchEvent(new CustomEvent('project-tab-shown', { detail: { id: activeTab.id } }));
            return;
        } else {
            // Clear project root for non-project tabs to avoid AI context confusion
            if (window.currentProjectRoot) {
                window.currentProjectRoot = null;
                window.dispatchEvent(new CustomEvent('peak-project-root-updated', { detail: { root: null } }));
            }
        }

        if (type === 'terminal') {
            window.dispatchEvent(new CustomEvent('terminal-tab-shown', { detail: { id: activeTab.id } }));
            return;
        }

        if (type === 'web') {
            if (WebView && WebView.updateWebViewUI) WebView.updateWebViewUI(activeTab.id);
            return;
        }

        if (!isReactiveView) return;

        if (tabCleanups.has(activeTab.id)) {
            try { tabCleanups.get(activeTab.id)(); } catch (e) { }
            tabCleanups.delete(activeTab.id);
        }

        // Capture scroll position before clearing
        const scroller = container.querySelector('.note-editor-scroller');
        if (scroller) savedScrollTop = scroller.scrollTop;

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
            } else if (viewMode === 'finder' && Finder) {
                // Keeping Finder logic if still needed, though UI access might be removed
                container.innerHTML = Finder.renderFinderHTML();
                cleanup = Finder.attachFinderListeners(data, container);
            } else if (viewMode === 'workspaces' && Workspaces) {
                // NEW WORKSPACES VIEW
                container.innerHTML = Workspaces.renderWorkspacesHTML();
                cleanup = Workspaces.attachWorkspacesListeners(container);
            } else {
                container.innerHTML = LandingPage.renderLandingPageHTML(activeTab.id);
                cleanup = LandingPage.attachLandingPageListeners(activeTab.id);
            }
        }
        else if (type === 'web' && WebView) {
            container.innerHTML = WebView.getWebViewComponent(data.url, activeTab.id);
            cleanup = WebView.attachWebViewListeners(data, activeTab.id);
        }
        else if (type === 'note' && NoteEditor) {
            const note = noteStore ? noteStore.get('notes', []).find(n => n.id === id) : null;
            if (note) {
                activeTab.content.data = note;
                container.innerHTML = NoteEditor.renderNoteEditorHTML(note, activeTab.id);
                cleanup = NoteEditor.attachNoteEditorListeners(note, container);
                restoreScroll();
            } else container.innerHTML = `<div class="error">Note not found.</div>`;
        }
        else if (type === 'llmChat' && ChatView) {
            const chat = chatStore ? chatStore.get('sessions', []).find(s => s.id === id) : null;
            if (chat) {
                activeTab.content.data = chat;
                container.innerHTML = ChatView.renderChatViewHTML(chat, activeTab.id);
                cleanup = ChatView.attachChatViewListeners(chat, container);
            } else container.innerHTML = `<div class="error">Chat session not found.</div>`;
        }
        else if (type === 'project' && ProjectView) {
            ProjectView.renderProjectViewHTML(data, container);
            cleanup = await ProjectView.attachProjectViewListeners(data, container);
        }
        else if (type === 'terminal' && TerminalView) {
            TerminalView.renderTerminalHTML(activeTab, container);
            cleanup = TerminalView.attachTerminalListeners(activeTab, container);
        }
        else if (type === 'mindmap' && MindMap) {
            container.innerHTML = MindMap.renderMindMapHTML(data);
            cleanup = MindMap.attachMindMapListeners(data, container, (newData) => {
                saveCurrentMindMap(id, newData);
            });
        }
        else if (type === 'kanban' && Kanban) {
            if (data && data.id) {
                container.innerHTML = Kanban.renderKanbanHTML(data);
                cleanup = Kanban.attachKanbanListeners(data, container, saveKanban);
            }
        }
        else if (type === 'whiteboard' && Whiteboard) {
            const boardId = data.id || activeTab.id;
            const savedItem = whiteboardStore ? whiteboardStore.get('items', []).find(i => i.id === boardId) : null;
            const initialData = savedItem?.data ? { data: savedItem.data, title: savedItem.title } : {};
            if (savedItem?.title) activeTab.title = savedItem.title;
            container.innerHTML = Whiteboard.renderWhiteboardHTML(boardId, initialData);
            cleanup = Whiteboard.attachWhiteboardListeners(boardId, initialData);
        }
        else if (type === 'docs' && Docs) {
            container.innerHTML = Docs.renderDocsHTML();
            cleanup = Docs.attachDocsListeners();
        }
        else if (type === 'finder' && Finder) {
            container.innerHTML = Finder.renderFinderHTML();
            cleanup = Finder.attachFinderListeners(data, container);
        }

    } catch (err) {
        console.error("Render Content Error:", err);
        container.innerHTML = `<div class="error">Error rendering ${type}: ${err.message}</div>`;
    }

    if (cleanup) tabCleanups.set(activeTab.id, cleanup);
    if (window.lucide) window.lucide.createIcons();
    saveTabs();
}

// --- TAB MANAGEMENT ---

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

function openKanbanBoard(boardId) {
    const existingTab = globalTabs.find(t => t.content.type === 'kanban' && t.content.data && t.content.data.id === boardId);
    if (existingTab) { selectTab(existingTab.id); return; }
    const boards = kanbanStore ? kanbanStore.get('boards', []) : [];
    const boardData = boards.find(b => b.id === boardId);
    if (boardData) {
        const tabId = Date.now();
        globalTabs.push({ id: tabId, title: boardData.title, content: { type: 'kanban', id: tabId, data: boardData } });
        selectTab(tabId);
    }
}

function deleteKanbanBoard(boardId) {
    if (!kanbanStore) return;
    const boards = kanbanStore.get('boards', []);
    kanbanStore.set('boards', boards.filter(b => b.id !== boardId));
    refreshInspector();
    const tab = globalTabs.find(t => t.content.type === 'kanban' && t.content.data && t.content.data.id === boardId);
    if (tab) closeTab(tab.id);
}

function refreshInspector() {
    if (Inspector && Inspector.refresh) Inspector.refresh();
}

function getActiveTab() {
    return globalTabs.find(t => t.id === selectedTabId);
}

// --- WORKSPACE CONTROLLERS (NEW) ---

function saveCurrentWorkspace(title, color) {
    if (!workspaceStore) return;

    const currentTabs = globalTabs.map(t => ({
        title: t.title,
        content: t.content
    }));

    const newWorkspace = {
        id: Date.now().toString(),
        title: title,
        color: color,
        tabs: currentTabs,
        createdAt: Date.now()
    };

    const items = workspaceStore.get('items', []);
    items.push(newWorkspace);
    workspaceStore.set('items', items);

    // Refresh if currently on workspaces page
    const activeTab = globalTabs.find(t => t.id === selectedTabId);
    if (activeTab && activeTab.content.viewMode === 'workspaces') {
        renderContentOnly();
    }
}

function restoreWorkspace(id) {
    if (!workspaceStore) return;
    const items = workspaceStore.get('items', []);
    const workspace = items.find(w => w.id === id);

    if (workspace && workspace.tabs.length > 0) {
        globalTabs = [];
        workspace.tabs.forEach(savedTab => {
            globalTabs.push({
                id: Date.now() + Math.random(),
                title: savedTab.title,
                content: savedTab.content
            });
        });

        selectedTabId = globalTabs[0].id;
        saveTabs();
        renderTabBarOnly();
        renderContentOnly();
    }
}

function deleteWorkspace(id) {
    if (!workspaceStore) return;
    let items = workspaceStore.get('items', []);
    items = items.filter(w => w.id !== id);
    workspaceStore.set('items', items);

    const activeTab = globalTabs.find(t => t.id === selectedTabId);
    if (activeTab && activeTab.content.viewMode === 'workspaces') {
        renderContentOnly();
    }
}

// --- END WORKSPACE CONTROLLERS ---

function setupGlobalNavigation() {
    const btnBack = document.getElementById('global-nav-back');
    const btnFwd = document.getElementById('global-nav-forward');
    const btnReload = document.getElementById('global-nav-reload');

    const handleBack = () => {
        const activeTab = globalTabs.find(t => t.id === selectedTabId);
        if (!activeTab) return;

        if (activeTab.content.type === 'project') {
            const container = document.getElementById(`tab-content-${activeTab.id}`);
            if (container && container.goBack) container.goBack();
        } else {
            const container = document.getElementById(`tab-content-${activeTab.id}`);
            const wv = container ? container.querySelector('webview') : null;
            if (wv && wv.canGoBack()) wv.goBack();
        }
    };

    const handleForward = () => {
        const activeTab = globalTabs.find(t => t.id === selectedTabId);
        if (!activeTab) return;

        if (activeTab.content.type === 'project') {
            const container = document.getElementById(`tab-content-${activeTab.id}`);
            if (container && container.goForward) container.goForward();
        } else {
            const container = document.getElementById(`tab-content-${activeTab.id}`);
            const wv = container ? container.querySelector('webview') : null;
            if (wv && wv.canGoForward()) wv.goForward();
        }
    };

    const handleReload = () => {
        const activeTab = globalTabs.find(t => t.id === selectedTabId);
        if (!activeTab) return;
        const container = document.getElementById(`tab-content-${activeTab.id}`);
        const wv = container ? container.querySelector('webview') : null;
        if (wv) wv.reload(); else reloadActiveTab();
    };

    if (btnBack) btnBack.onclick = handleBack;
    if (btnFwd) btnFwd.onclick = handleForward;
    if (btnReload) btnReload.onclick = handleReload;
}

// --- RENDER VIEW ---
async function renderView() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('settingsMode') === 'true') {
        const toolbar = document.getElementById('global-toolbar-container');
        const tabBar = document.getElementById('tab-bar-container');
        const contentArea = document.getElementById('main-content-area');
        const inspector = document.getElementById('inspector-container');

        if (toolbar) toolbar.style.display = 'none';
        if (tabBar) tabBar.style.display = 'none';
        if (inspector) inspector.style.display = 'none';

        if (contentArea && SettingsView) {
            const settings = await ipcRenderer.invoke('get-all-settings');
            contentArea.innerHTML = SettingsView.renderSettingsHTML(settings);
            SettingsView.attachSettingsListeners();
            if (window.lucide) window.lucide.createIcons();
        } else {
            contentArea.innerHTML = '<div style="padding:20px;">Error loading settings view.</div>';
        }
        return;
    }

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
        if (activeTab && activeTab.title !== newTitle) {
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
        if (cleanup) { try { cleanup(); } catch (e) { } tabCleanups.delete(id); }
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
function addTab(type = 'empty') {
    if (type === 'note' || type === 'chat') { handlePerformAction({ mode: type === 'note' ? 'Note' : 'LLM', query: type === 'note' ? 'Untitled' : '' }); return; }
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
        const initialBlocks = [];
        if (data.query && data.query.trim() !== '' && data.query !== 'Untitled Note') {
            const type = data.blockType || 'paragraph';
            let content = data.query;
            if (type === 'todo') content = `[ ] ${content}`;

            initialBlocks.push({
                id: Date.now().toString(),
                type: type,
                content: content,
                orderIndex: 0
            });
        }
        const note = { id, title: data.query || 'Untitled', blocks: initialBlocks, createdAt: Date.now() };
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
        } catch (e) { console.error(e); return; }
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
    } else if (data.mode === 'Workspaces') {
        const id = Date.now();
        newContent = { type: 'empty', id, data: {}, viewMode: 'workspaces' };
        title = "Workspaces";
    }

    if (newContent) {
        const current = globalTabs.find(t => t.id === selectedTabId);
        if (current && current.content.type === 'empty') {
            const oldContainer = document.getElementById(`tab-content-${selectedTabId}`);
            if (oldContainer) { if (tabCleanups.has(selectedTabId)) tabCleanups.get(selectedTabId)(); oldContainer.remove(); }
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
        if (query.startsWith('note://')) { mode = 'Note'; cleanQuery = query.replace('note://', ''); }
        else if (query.startsWith('term://')) { mode = 'Terminal'; cleanQuery = query.replace('term://', ''); }
        else if (query.startsWith('chat://')) { mode = 'LLM'; cleanQuery = query.replace('chat://', ''); }
        else if (query.startsWith('project://')) { mode = 'Project'; cleanQuery = query.replace('project://', ''); }
        else if (query.startsWith('file://')) { mode = 'Finder'; cleanQuery = query.replace('file://', ''); }
        handlePerformAction({ mode, query: cleanQuery, engine: 'google' });
        e.target.blur();
    }
}

module.exports = {
    renderView,
    setActiveTab,
    addTab,
    closeTab,
    handlePerformAction,
    selectTab,
    reorderTabs,
    navigateTab,
    openExistingTab,
    closeActiveTab,
    reloadActiveTab,
    logHistoryItem,
    restoreClosedTab,
    setEmptyTabMode,
    toggleBookmark,
    reorderBookmarks,
    openMindMapFromHistory,
    openTerminalFromHistory,
    openWhiteboardFromHistory,
    openDocsFromHistory,
    openKanbanBoard,
    deleteKanbanBoard,
    refreshInspector,
    saveCurrentWorkspace, // Exported
    restoreWorkspace,     // Exported
    deleteWorkspace,      // Exported
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
    get workspaceStore() { return workspaceStore; }, // Exported
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