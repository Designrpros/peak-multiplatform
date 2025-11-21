// src/components/ProjectView/index.js
const { 
    renderSidebarHTML, 
    toggleFolderState, 
    handleFileClick, 
    createNewFileSystemItem,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop 
} = require('./sidebar.js');
const { setupCodeMirror, disposeEditor } = require('./editor.js');
const TerminalView = require('../TerminalView/index.js'); 
const path = require('path'); 

// Ensure global map exists
window.projectTerminalMap = window.projectTerminalMap || {};

function renderProjectViewHTML(projectData, container) {
    const title = projectData.title || 'Project';
    
    container.innerHTML = `
        <div class="project-view-container">
            <div class="project-sidebar">
                <div class="project-sidebar-header">
                    <h3 class="file-tree-header">${title}</h3>
                    <div class="sidebar-actions">
                        <i data-lucide="file-plus-2" class="sidebar-action-icon action-create-file" title="New File"></i>
                        <i data-lucide="folder-plus" class="sidebar-action-icon action-create-folder" title="New Folder"></i>
                    </div>
                </div>
                <div class="file-tree-container file-tree-scroll-container">
                    <p style="font-size:12px;color:var(--peak-secondary);padding:10px;">Loading...</p>
                </div>
                <div class="project-sidebar-footer">
                    <input type="text" placeholder="Filter..." class="sidebar-filter-input">
                </div>
            </div>
            <div class="project-editor-area">
                <div class="editor-title-bar">
                    <span class="current-file-path" contenteditable="true">project://${title}</span>
                    
                    <div class="editor-actions">
                        <a href="#" class="editor-action-link link-toggle-terminal" title="Toggle Terminal">
                            <i data-lucide="terminal" class="editor-toolbar-icon"></i>
                        </a>
                        <a href="#" class="editor-action-link link-ai-chat" title="Open AI Assistant">
                            <i data-lucide="sparkles" class="editor-toolbar-icon"></i>
                        </a>
                        <a href="#" class="editor-action-link link-toggle-sidebar" title="Toggle Sidebar">
                            <i data-lucide="panel-left-close" class="editor-toolbar-icon toggle-icon"></i>
                        </a>
                    </div>
                </div>
                
                <div class="editor-pane-wrapper">
                    <div class="project-editor-pane">
                        <div class="project-editor-placeholder">Select a file from the sidebar</div>
                    </div>
                </div>

                <div class="terminal-panel" style="display:none;"></div>
            </div>
        </div>
    `;
}

async function attachProjectViewListeners(projectData, container) {
    if (window.ipcRenderer) window.ipcRenderer.send('did-finish-content-swap');
    
    const tabId = container.id.replace('tab-content-', '');
    const terminalId = 'proj-term-' + Date.now(); 
    
    if (tabId) {
        window.projectTerminalMap[tabId] = terminalId;
    }

    const sidebar = container.querySelector('.project-sidebar');
    const fileTreeContainer = container.querySelector('.file-tree-container');
    const editorPane = container.querySelector('.project-editor-pane');
    const titleBar = container.querySelector('.current-file-path');
    const filterInput = container.querySelector('.sidebar-filter-input');
    const viewContainer = container.querySelector('.project-view-container');
    const toggleIcon = container.querySelector('.toggle-icon');
    const terminalPanel = container.querySelector('.terminal-panel');
    
    let editorView = null;
    let currentFileContent = '';
    let terminalCleanup = null;

    window.currentFilePath = null;

    // --- CRITICAL FIX: Expose File Context for AI Inspector ---
    window.getProjectFileContext = () => {
        return {
            currentFilePath: window.currentFilePath,
            currentFileContent: currentFileContent,
            currentFileContentError: null 
        };
    };
    // ----------------------------------------------------------

    window.ipcRenderer.send('project:watch', projectData.path);

    const refreshSidebar = async () => {
        await renderSidebarHTML(fileTreeContainer, projectData, filterInput ? filterInput.value : '');
    };

    let refreshTimeout;
    const onFilesChanged = () => {
        if (refreshTimeout) clearTimeout(refreshTimeout);
        refreshTimeout = setTimeout(refreshSidebar, 100);
    };
    window.ipcRenderer.on('project:files-changed', onFilesChanged);
    
    if (sidebar) {
        sidebar.addEventListener('dragstart', handleDragStart);
        sidebar.addEventListener('dragover', handleDragOver);
        sidebar.addEventListener('dragleave', handleDragLeave);
        sidebar.addEventListener('drop', (e) => handleDrop(e, refreshSidebar));
    }

    const toggleTerminal = () => {
        const isVisible = terminalPanel.style.display !== 'none';
        if (isVisible) {
            terminalPanel.style.display = 'none';
            if (terminalCleanup) { terminalCleanup(); terminalCleanup = null; }
        } else {
            terminalPanel.style.display = 'flex';
            terminalPanel.innerHTML = ''; 
            const virtualTab = {
                id: terminalId,
                content: {
                    type: 'terminal',
                    data: { cwd: projectData.path, initialCommand: '' }
                }
            };
            TerminalView.renderTerminalHTML(virtualTab, terminalPanel);
            terminalCleanup = TerminalView.attachTerminalListeners(virtualTab, terminalPanel);
        }
    };

    const btnTerminal = container.querySelector('.link-toggle-terminal');
    if (btnTerminal) btnTerminal.addEventListener('click', (e) => { e.preventDefault(); toggleTerminal(); });

    if (filterInput) filterInput.addEventListener('input', () => refreshSidebar());

    if (titleBar) {
        titleBar.addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault(); titleBar.blur();} });
        titleBar.addEventListener('blur', async () => {
            if (!window.currentFilePath) return;
            const newName = titleBar.textContent.trim();
            if (newName === path.basename(window.currentFilePath)) return;
            const newPath = path.join(path.dirname(window.currentFilePath), newName);
            await window.ipcRenderer.invoke('project:move-file', window.currentFilePath, newPath);
            window.currentFilePath = newPath;
            refreshSidebar();
        });
    }

    const btnToggle = container.querySelector('.link-toggle-sidebar');
    if (btnToggle) {
        btnToggle.addEventListener('click', (e) => {
            e.preventDefault();
            const collapsed = viewContainer.classList.toggle('sidebar-collapsed');
            toggleIcon.setAttribute('data-lucide', collapsed ? 'panel-left-open' : 'panel-left-close');
            if(window.lucide) window.lucide.createIcons();
        });
    }

    const btnAi = container.querySelector('.link-ai-chat');
    if (btnAi) btnAi.addEventListener('click', (e) => { e.preventDefault(); window.openInspector('ai-assist'); });

    const btnFile = container.querySelector('.action-create-file');
    const btnFolder = container.querySelector('.action-create-folder');
    
    if (btnFile) {
        btnFile.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            createNewFileSystemItem(false, projectData.path, refreshSidebar, fileTreeContainer);
        });
    }
    if (btnFolder) {
        btnFolder.addEventListener('click', (e) => {
            e.stopPropagation(); e.preventDefault();
            createNewFileSystemItem(true, projectData.path, refreshSidebar, fileTreeContainer);
        });
    }

    const onSidebarClick = async (e) => {
        if (e.target.tagName === 'INPUT') return;

        const item = e.target.closest('.tree-item');
        if (!item) return;
        const p = item.dataset.path;
        
        if (item.dataset.isDirectory === 'true') {
            e.stopPropagation();
            await toggleFolderState(item, p, () => filterInput ? filterInput.value : '');
        } else {
            disposeEditor(editorView);
            const res = await handleFileClick(item, p, editorPane, titleBar);
            if (res.content !== undefined) {
                currentFileContent = res.content;
                editorView = setupCodeMirror(editorPane, res.content, p);
                editorPane.classList.add('code-mirror-active');
            }
        }
    };
    
    if (sidebar) sidebar.addEventListener('click', onSidebarClick);

    await refreshSidebar();

    return () => {
        disposeEditor(editorView);
        if (terminalCleanup) terminalCleanup(); 
        window.ipcRenderer.removeListener('project:files-changed', onFilesChanged);
        
        // Cleanup Global
        delete window.getProjectFileContext;
        if (tabId) delete window.projectTerminalMap[tabId];

        if (sidebar) {
            sidebar.removeEventListener('click', onSidebarClick);
            sidebar.removeEventListener('dragstart', handleDragStart);
            sidebar.removeEventListener('dragover', handleDragOver);
            sidebar.removeEventListener('dragleave', handleDragLeave);
            sidebar.removeEventListener('drop', handleDrop);
        }
    };
}

module.exports = { renderProjectViewHTML, attachProjectViewListeners };