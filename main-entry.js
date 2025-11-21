// main-entry.js
const { ipcRenderer, shell } = require('electron');
const tabManager = require('./src/tab-manager'); 
const { AvailableModels } = require('./src/utils/enums.js');

window.ipcRenderer = ipcRenderer;
window.tabManager = tabManager;
window.AvailableModels = AvailableModels; 
window.handlePerformAction = (data) => tabManager.handlePerformAction(data);

// --- NEW: Global Save Helpers for Whiteboard Export ---
// Assuming project:write-file handles plain text/JSON/SVG
window.saveFile = (filePath, content) => {
    return ipcRenderer.invoke('project:write-file', filePath, content);
};

// Assuming this helper exists to handle Base64 to file (PNG)
// We use the 'encoding' option supported by Node's fs.writeFile which the main process will handle.
window.saveBase64File = (filePath, content, encoding) => {
     return ipcRenderer.invoke('project:write-file', filePath, content, encoding);
};
// --- END NEW ---


// --- 1. KEYBOARD SHORTCUTS ---
document.addEventListener('keydown', (e) => {
    const isCmdOrCtrl = e.metaKey || e.ctrlKey;
    if (isCmdOrCtrl && e.key.toLowerCase() === 'n') { e.preventDefault(); tabManager.addTab('empty'); return; }
    if (isCmdOrCtrl && e.key.toLowerCase() === 'w') { e.preventDefault(); tabManager.closeActiveTab(); return; }
    if (isCmdOrCtrl && e.key.toLowerCase() === 'r') { e.preventDefault(); tabManager.reloadActiveTab(); return; }
    if (isCmdOrCtrl && e.altKey) {
        if (e.key === 'ArrowRight') { e.preventDefault(); tabManager.navigateTab(1); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); tabManager.navigateTab(-1); }
    }
});

// --- 2. TAB ACTIONS ---
window.reorderTabs = (from, to) => tabManager.reorderTabs(from, to);
window.selectTab = (id) => tabManager.selectTab(id);
window.addEmptyTab = () => tabManager.addTab('empty');
window.setActiveTab = (id) => tabManager.setActiveTab(Number(id));
window.closeTab = (id, event) => { if(event) event.stopPropagation(); tabManager.closeTab(Number(id)); };

// --- 3. APP CREATION (Global Shortcuts / Landing Page) ---
window.createNewProject = () => tabManager.handlePerformAction({ mode: 'Project', query: '' });
window.createNewTerminalTab = () => tabManager.handlePerformAction({ mode: 'Terminal', query: '' });
window.createNewNote = () => tabManager.handlePerformAction({ mode: 'Note', query: 'Untitled Note' });
window.createNewKanban = () => tabManager.handlePerformAction({ mode: 'Tasks', query: '' });
window.createNewWhiteboard = () => tabManager.handlePerformAction({ mode: 'Whiteboard', query: '' });
window.createNewDocs = () => tabManager.handlePerformAction({ mode: 'Docs', query: '' });
window.openBrowser = () => tabManager.handlePerformAction({ mode: 'Search', query: 'https://www.google.com', engine: 'google' });


// --- 4. INSPECTOR & HISTORY BRIDGES ---
window.openInspector = (mode) => {
    const Inspector = require('./src/components/Inspector/index.js');
    if (Inspector.toggle) Inspector.toggle(mode); else Inspector.open(mode);
};
window.closeInspector = () => {
    const Inspector = require('./src/components/Inspector/index.js');
    if(Inspector.close) Inspector.close();
};

// History Navigation
window.openNoteFromHistory = (id) => { window.closeInspector(); tabManager.openExistingTab('note', Number(id)); };
window.openChatFromHistory = (id) => { window.closeInspector(); tabManager.openExistingTab('llmChat', Number(id)); };
window.openMindMapFromHistory = (id) => { window.closeInspector(); tabManager.openMindMapFromHistory(Number(id)); };
window.openTerminalFromHistory = (id) => { window.closeInspector(); tabManager.openTerminalFromHistory(Number(id)); };
window.openWhiteboardFromHistory = (id) => { window.closeInspector(); tabManager.openWhiteboardFromHistory(Number(id)); };
window.openDocsFromHistory = (id) => { window.closeInspector(); tabManager.openDocsFromHistory(Number(id)); };
window.openUrlFromHistory = (url) => { window.closeInspector(); tabManager.handlePerformAction({ mode: 'Search', query: url }); };

// Kanban Specifics
window.openKanbanBoard = (id) => { window.closeInspector(); tabManager.openKanbanBoard(id); };
window.deleteKanbanBoard = (id) => tabManager.deleteKanbanBoard(id);

// System Helpers
window.logHistoryItem = (url, title) => tabManager.logHistoryItem(url, title);
window.restoreClosedTab = (id) => { window.closeInspector(); tabManager.restoreClosedTab(Number(id)); };
window.showDashboardPage = () => tabManager.setEmptyTabMode('dashboard');
window.showLandingPage = () => tabManager.setEmptyTabMode('landing');
window.handleBookmarkClick = (url) => tabManager.handlePerformAction({ mode: 'Search', query: url, engine: 'google' });
window.toggleBookmark = (url, title) => tabManager.toggleBookmark(url, title);
window.reorderBookmarks = (from, to) => tabManager.reorderBookmarks(from, to);

// Data Controllers (Note/Chat bridges)
window.addNoteBlock = (id, t, c) => tabManager.addNoteBlock(id, t, c);
window.updateNoteBlock = (id, b, c) => tabManager.updateNoteBlock(id, b, c);
window.handleTodoToggle = (id, b, c) => tabManager.handleTodoToggle(id, b, c);
window.deleteNoteBlock = (id, b) => tabManager.deleteNoteBlock(id, b);
window.moveNoteBlock = (id, s, t, p) => tabManager.moveNoteBlock(id, s, t, p);
window.addNoteTag = (id, t) => tabManager.addNoteTag(id, t);
window.removeNoteTag = (id, t) => tabManager.removeNoteTag(id, t);
window.sendChatMessage = (id, c, m, f) => tabManager.sendChatMessage(id, c, m, f);
window.stopChatStream = () => tabManager.stopChatStream();


// --- 5. INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("[MainEntry] DOM Content Loaded");
    tabManager.renderView();
    if (window.lucide) window.lucide.createIcons();
    ipcRenderer.send('renderer-ready');
});

// CRITICAL FIX: Add this global listener for drag-and-drop from main.js
// This ensures that the file path, which the renderer cannot access directly during drop,
// can be received and passed to the active ImageTool instance via IPC.
ipcRenderer.on('dropped-whiteboard-file', (event, filePath, x, y) => {
    // This event is handled in the renderer's ImageTool.js via its own listener
    // that was set up in its constructor.
});