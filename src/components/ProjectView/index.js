// src/components/ProjectView/index.js
const { 
    renderSidebarHTML, 
    toggleFolderState, 
    handleFileClick, 
    createNewFileSystemItem, 
    renameFileSystemItem, 
    handleDragStart, 
    handleDragOver, 
    handleDragLeave, 
    handleDrop 
} = require('./sidebar.js');
const { setupCodeMirror, disposeEditor } = require('./editor.js');
const TerminalView = require('../TerminalView/index.js'); 
const { getFileIconHTML } = require('./icons.js');
const path = require('path'); 
const { clipboard } = require('electron'); 

window.projectTerminalsData = window.projectTerminalsData || {};
const allDiagnostics = new Map();
let selectedProblem = null; 

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
                        <a href="#" class="editor-action-link link-toggle-sidebar" title="Toggle Sidebar"><i data-lucide="panel-left" class="editor-toolbar-icon"></i></a>
                        <a href="#" class="editor-action-link link-toggle-terminal" title="Toggle Terminal"><i data-lucide="panel-bottom" class="editor-toolbar-icon"></i></a>
                        <a href="#" class="editor-action-link link-ai-chat" title="AI Assistant"><i data-lucide="panel-right" class="editor-toolbar-icon"></i></a>
                    </div>
                </div>
                <div class="editor-pane-wrapper">
                    <div class="project-editor-pane">
                        <div class="project-editor-placeholder">Select a file from the sidebar</div>
                    </div>
                </div>
                
                <div class="terminal-panel" style="display:none;">
                    <div class="terminal-resize-handle"></div>
                    <div class="terminal-tabs-row">
                        <button class="panel-tab-btn active" data-target="terminal">Terminal</button>
                        <button class="panel-tab-btn" data-target="problems">Problems <span id="problems-badge"></span></button>
                    </div>
                    <div class="panel-content-wrapper">
                        <div id="view-terminal" class="panel-view active">
                            <div class="terminal-sidebar-list">
                                <div class="term-list-header"><span>Open</span><button class="term-add-btn"><i data-lucide="plus" style="width:12px;"></i></button></div>
                                <div class="term-list-container"></div>
                            </div>
                            <div class="terminal-content-area"></div>
                        </div>
                        <div id="view-problems" class="panel-view">
                            <div class="problems-view" tabindex="0"><div class="empty-problems">No problems detected.</div></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function attachProjectViewListeners(projectData, container) {
    if (window.ipcRenderer) window.ipcRenderer.send('did-finish-content-swap');
    
    // EXTRACT TAB ID FOR EVENT SCOPING
    const tabId = container.id.replace('tab-content-', '');
    
    if (!window.projectTerminalsData[tabId]) window.projectTerminalsData[tabId] = { terminals: [], activeIndex: -1 };
    const terminalState = window.projectTerminalsData[tabId];

    // DOM Elements
    const sidebar = container.querySelector('.project-sidebar');
    const sidebarHeader = container.querySelector('.project-sidebar-header'); 
    const fileTreeContainer = container.querySelector('.file-tree-container');
    const editorPane = container.querySelector('.project-editor-pane');
    const titleBar = container.querySelector('.current-file-path');
    const filterInput = container.querySelector('.sidebar-filter-input');
    const viewContainer = container.querySelector('.project-view-container');
    
    // Panel Elements
    const terminalPanel = container.querySelector('.terminal-panel');
    const terminalContentArea = container.querySelector('.terminal-content-area');
    const termListContainer = container.querySelector('.term-list-container');
    const termAddBtn = container.querySelector('.term-add-btn');
    const resizeHandle = container.querySelector('.terminal-resize-handle');
    const tabButtons = container.querySelectorAll('.panel-tab-btn');
    const views = container.querySelectorAll('.panel-view');
    const problemsView = container.querySelector('.problems-view');
    const problemsBadge = container.querySelector('#problems-badge');

    let editorView = null;
    let currentFileContent = '';
    let terminalCleanups = {}; 
    let activeFilePath = null; 
    window.currentFilePath = null;

    // --- REFRESH FUNCTION ---
    const refreshSidebar = async () => {
        await renderSidebarHTML(fileTreeContainer, projectData, filterInput ? filterInput.value : '');
    };

    // --- FILTERING LOGIC (INSTANT) ---
    if (filterInput) {
        filterInput.addEventListener('input', () => {
            refreshSidebar();
        });
    }

    // --- GLOBAL CONTEXT ---
    const updateGlobalContext = () => {
        window.getProjectFileContext = () => ({
            currentFilePath: activeFilePath,
            currentFileContent: currentFileContent,
            currentFileContentError: null 
        });
    };
    const onProjectShown = (e) => {
        if (e.detail.id.toString() === tabId.toString()) {
            updateGlobalContext();
            if (terminalPanel.style.display !== 'none' && terminalState.activeIndex >= 0) {
                window.dispatchEvent(new CustomEvent('terminal-tab-shown', { detail: { id: terminalState.terminals[terminalState.activeIndex].id } }));
            }
        }
    };
    window.addEventListener('project-tab-shown', onProjectShown);
    updateGlobalContext(); 

    // --- CONTEXT MENU HANDLERS (SCOPED) ---
    const onCtxReveal = (e, data) => {
        if (data.instanceId !== tabId) return;
        window.ipcRenderer.invoke('project:reveal-in-finder', data.targetPath);
    };

    const onCtxDelete = async (e, data) => { 
        if (data.instanceId !== tabId) return;
        
        if(confirm(`Delete ${path.basename(data.targetPath)}?`)) { 
            // OPTIMISTIC UI UPDATE: Remove instantly
            const safeId = 'tree-' + data.targetPath.replace(/[^a-zA-Z0-9]/g, '_');
            const el = fileTreeContainer.querySelector(`#${safeId}`);
            if (el) el.remove();

            const res = await window.ipcRenderer.invoke('project:delete-path', data.targetPath); 
            if(res.success) refreshSidebar(); 
        } 
    };

    const onCtxNewFile = (e, data) => {
        if (data.instanceId !== tabId) return;
        createNewFileSystemItem(false, data.targetPath || projectData.path, refreshSidebar, fileTreeContainer);
    };

    const onCtxNewFolder = (e, data) => {
        if (data.instanceId !== tabId) return;
        createNewFileSystemItem(true, data.targetPath || projectData.path, refreshSidebar, fileTreeContainer);
    };

    const onCtxRename = (e, data) => { 
        if (data.instanceId !== tabId) return;
        const safeId = 'tree-' + data.targetPath.replace(/[^a-zA-Z0-9]/g, '_'); 
        const li = fileTreeContainer.querySelector(`#${safeId}`); 
        if (li) { 
            const span = li.querySelector('.item-name'); 
            if (span) renameFileSystemItem(data.targetPath, span, refreshSidebar); 
        } 
    };

    window.ipcRenderer.on('project:ctx-reveal', onCtxReveal);
    window.ipcRenderer.on('project:ctx-delete', onCtxDelete);
    window.ipcRenderer.on('project:ctx-new-file', onCtxNewFile);
    window.ipcRenderer.on('project:ctx-new-folder', onCtxNewFolder);
    window.ipcRenderer.on('project:ctx-rename', onCtxRename);

    // --- ATTACH CONTEXT MENU UI TRIGGER (WITH SCOPE ID) ---
    if (sidebar) {
        sidebar.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            const item = e.target.closest('.tree-item');
            if (item) {
                if (!item.classList.contains('selected')) {
                    fileTreeContainer.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                }
                window.ipcRenderer.send('show-project-context-menu', { 
                    targetPath: item.dataset.path,
                    instanceId: tabId // Pass the unique tab ID
                });
            } else {
                window.ipcRenderer.send('show-project-context-menu', { 
                    targetPath: projectData.path,
                    instanceId: tabId
                });
            }
        });
    }

    if (sidebarHeader) {
        sidebarHeader.addEventListener('click', (e) => {
            const btn = e.target.closest('.sidebar-action-icon');
            if (!btn) return;
            e.stopPropagation(); e.preventDefault();
            const selected = fileTreeContainer.querySelector('.tree-item.selected');
            const target = selected ? selected.dataset.path : null;
            if (btn.classList.contains('action-create-file')) createNewFileSystemItem(false, target || projectData.path, refreshSidebar, fileTreeContainer);
            else if (btn.classList.contains('action-create-folder')) createNewFileSystemItem(true, target || projectData.path, refreshSidebar, fileTreeContainer);
        });
    }

    // --- PROBLEMS VIEW ---
    const renderProblemsView = () => { if (!problemsView) return; problemsView.innerHTML = ''; let totalCount = 0; if (allDiagnostics.size === 0) { problemsView.innerHTML = `<div class="empty-problems">No problems detected.</div>`; if (problemsBadge) problemsBadge.textContent = ''; return; } const sortedFiles = Array.from(allDiagnostics.keys()).sort(); sortedFiles.forEach(filePath => { const diags = allDiagnostics.get(filePath); if (!diags || diags.length === 0) return; totalCount += diags.length; const fileGroup = document.createElement('div'); fileGroup.className = 'problem-file-group'; const displayPath = path.relative(projectData.path, path.dirname(filePath)); const header = document.createElement('div'); header.className = 'problem-file-header'; header.innerHTML = `<div class="file-toggle"><i data-lucide="chevron-down"></i></div><div class="file-icon">${getFileIconHTML(path.basename(filePath))}</div><div class="file-info"><span class="file-name">${path.basename(filePath)}</span><span class="file-path">${displayPath ? displayPath : ''}</span></div><div class="file-badge">${diags.length}</div>`; header.onclick = () => { fileGroup.classList.toggle('collapsed'); const icon = header.querySelector('.file-toggle i'); icon.setAttribute('data-lucide', fileGroup.classList.contains('collapsed') ? 'chevron-right' : 'chevron-down'); if(window.lucide) window.lucide.createIcons(); }; const list = document.createElement('div'); list.className = 'problem-list'; diags.forEach(d => { const item = document.createElement('div'); item.className = 'problem-item'; if (selectedProblem && selectedProblem.diagnostic === d) item.classList.add('selected'); const severityIcon = d.severity === 'error' ? 'x-circle' : 'alert-triangle'; const severityClass = d.severity === 'error' ? 'error' : 'warning'; const lineText = (d.line !== undefined && d.col !== undefined) ? `[${d.line}, ${d.col}]` : `[Pos ${d.from}]`; item.innerHTML = `<div class="problem-gutter"></div><div class="problem-main"><i data-lucide="${severityIcon}" class="problem-icon ${severityClass}"></i><span class="problem-message" title="${d.message}">${d.message}</span><span class="problem-source">${d.source || ''}</span><span class="problem-pos">${lineText}</span></div>`; item.onclick = async (e) => { e.stopPropagation(); selectedProblem = { diagnostic: d, filePath: filePath }; problemsView.querySelectorAll('.problem-item').forEach(el => el.classList.remove('selected')); item.classList.add('selected'); problemsView.focus(); if (window.currentFilePath !== filePath) await loadFile(filePath); if (editorPane.jumpToLine) editorPane.jumpToLine(d.from); }; item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); selectedProblem = { diagnostic: d, filePath: filePath }; const copyText = `${d.message} (${path.basename(filePath)} ${lineText})`; window.ipcRenderer.send('show-problem-context-menu', copyText); }); list.appendChild(item); }); fileGroup.appendChild(header); fileGroup.appendChild(list); problemsView.appendChild(fileGroup); }); if (problemsBadge) { problemsBadge.textContent = totalCount > 0 ? ` ${totalCount}` : ''; problemsBadge.style.color = totalCount > 0 ? 'var(--peak-accent)' : 'inherit'; } if(window.lucide) window.lucide.createIcons(); };
    const onDiagnostics = (e) => { const { filePath, diagnostics } = e.detail; if (!filePath) return; if (!diagnostics || diagnostics.length === 0) allDiagnostics.delete(filePath); else allDiagnostics.set(filePath, diagnostics); renderProblemsView(); };
    window.addEventListener('peak-editor-diagnostics', onDiagnostics);
    problemsView.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedProblem) { const d = selectedProblem.diagnostic; const lineText = (d.line !== undefined) ? `[${d.line}:${d.col}]` : `[Pos ${d.from}]`; const text = `${d.message} (${path.basename(selectedProblem.filePath)} ${lineText})`; clipboard.writeText(text); e.preventDefault(); } });
    problemsView.addEventListener('click', (e) => { if (e.target === problemsView) { selectedProblem = null; problemsView.querySelectorAll('.problem-item').forEach(el => el.classList.remove('selected')); } });

    // ... (Terminal & Sidebar Logic) ...
    const renderTerminalList = () => { if (termListContainer) termListContainer.innerHTML = terminalState.terminals.map((t, i) => `<div class="term-list-item ${i === terminalState.activeIndex ? 'active' : ''}" data-idx="${i}"><span>${t.name || 'bash'}</span><div class="term-close-btn" data-id="${t.id}"><i data-lucide="x" style="width:10px; height:10px;"></i></div></div>`).join(''); if(window.lucide) window.lucide.createIcons(); };
    const showTerminal = (idx) => { Array.from(terminalContentArea.children).forEach(el=>el.style.display='none'); if(idx>=0 && idx<terminalState.terminals.length){ const t=terminalState.terminals[idx]; let el=document.getElementById(`term-instance-${t.id}`); if(!el){ el=document.createElement('div'); el.id=`term-instance-${t.id}`; el.style.cssText="width:100%;height:100%;"; terminalContentArea.appendChild(el); const vTab={id:t.id,content:{type:'terminal',data:{cwd:projectData.path,initialCommand:''}}}; TerminalView.renderTerminalHTML(vTab,el); terminalCleanups[t.id]=TerminalView.attachTerminalListeners(vTab,el); } el.style.display='block'; terminalState.activeIndex=idx; window.dispatchEvent(new CustomEvent('terminal-tab-shown',{detail:{id:t.id}})); } else { terminalState.activeIndex=-1; } renderTerminalList(); };
    const createTerm = () => { terminalState.terminals.push({id:'term-'+Date.now(), name:'Terminal'}); showTerminal(terminalState.terminals.length-1); };
    if(termAddBtn) termAddBtn.addEventListener('click', createTerm);
    if(termListContainer) termListContainer.addEventListener('click', e=>{ const cb=e.target.closest('.term-close-btn'); if(cb){ e.stopPropagation(); const id=cb.dataset.id; const idx=terminalState.terminals.findIndex(t=>t.id===id); if(idx>-1){ if(terminalCleanups[id]) terminalCleanups[id](); delete terminalCleanups[id]; document.getElementById(`term-instance-${id}`)?.remove(); terminalState.terminals.splice(idx,1); if(terminalState.terminals.length===0) terminalState.activeIndex=-1; else if(idx<=terminalState.activeIndex) terminalState.activeIndex=Math.max(0, terminalState.activeIndex-1); showTerminal(terminalState.activeIndex); } } else { const it=e.target.closest('.term-list-item'); if(it) showTerminal(parseInt(it.dataset.idx)); } });
    tabButtons.forEach(btn => btn.addEventListener('click', () => { const target = btn.dataset.target; tabButtons.forEach(b => b.classList.toggle('active', b.dataset.target === target)); views.forEach(v => v.classList.toggle('active', v.id === `view-${target}`)); if(target==='terminal' && terminalState.activeIndex >= 0) showTerminal(terminalState.activeIndex); }));
    const toggleTerminal = () => { const isVisible = terminalPanel.style.display !== 'none'; terminalPanel.style.display = isVisible ? 'none' : 'flex'; if(!isVisible && terminalState.terminals.length===0) createTerm(); };
    container.querySelector('.link-toggle-terminal')?.addEventListener('click', e=>{e.preventDefault(); toggleTerminal();});

    // RESTORED BUTTON LISTENERS
    const btnToggle = container.querySelector('.link-toggle-sidebar');
    if (btnToggle) btnToggle.addEventListener('click', (e) => { e.preventDefault(); viewContainer.classList.toggle('sidebar-collapsed'); });
    const btnAi = container.querySelector('.link-ai-chat');
    if (btnAi) btnAi.addEventListener('click', (e) => { e.preventDefault(); window.openInspector('ai-assist'); });

    if(resizeHandle) {
        let startY, startHeight;
        const onDrag = e => { terminalPanel.style.height = `${startHeight + (startY - e.clientY)}px`; };
        const onStop = () => { document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', onStop); resizeHandle.classList.remove('resizing'); };
        resizeHandle.addEventListener('mousedown', e => { startY=e.clientY; startHeight=terminalPanel.offsetHeight; resizeHandle.classList.add('resizing'); document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', onStop); e.preventDefault(); });
    }

    const loadFile = async (filePath) => {
        disposeEditor(editorView);
        renderProblemsView(); 
        if(titleBar) titleBar.textContent = path.basename(filePath);
        editorPane.innerHTML = '<div class="project-editor-placeholder">Loading...</div>';
        editorPane.classList.remove('code-mirror-active');
        try {
            const content = await window.ipcRenderer.invoke('project:read-file', filePath);
            if (typeof content === 'string') {
                currentFileContent = content;
                activeFilePath = filePath; window.currentFilePath = filePath; 
                editorView = setupCodeMirror(editorPane, content, filePath);
                if(editorView) {
                    editorPane.classList.add('code-mirror-active');
                    window.dispatchEvent(new CustomEvent('peak-project-file-selected', { detail: { filePath, content } }));
                }
                updateGlobalContext(); 
            } else { editorPane.innerHTML = '<div class="error">Error reading file</div>'; }
        } catch(e) { console.error(e); editorPane.innerHTML = `<div class="error">${e.message}</div>`; }
    };

    const onSidebarClick = async (e) => { if (e.target.tagName === 'INPUT') return; const item = e.target.closest('.tree-item'); if (!item) return; const p = item.dataset.path; if (item.dataset.isDirectory === 'true') { e.stopPropagation(); await toggleFolderState(item, p, () => filterInput ? filterInput.value : ''); } else { loadFile(p); } };
    if (sidebar) sidebar.addEventListener('click', onSidebarClick);
    if (sidebar) sidebar.addEventListener('dragstart', handleDragStart);
    if (sidebar) sidebar.addEventListener('dragover', handleDragOver);
    if (sidebar) sidebar.addEventListener('dragleave', handleDragLeave);
    if (sidebar) sidebar.addEventListener('drop', (e) => handleDrop(e, refreshSidebar));

    await refreshSidebar();
    if(terminalState.terminals.length>0) showTerminal(terminalState.activeIndex);

    return () => {
        disposeEditor(editorView);
        Object.values(terminalCleanups).forEach(c=>c());
        window.removeEventListener('peak-editor-diagnostics', onDiagnostics);
        // Cleanup specific listeners to prevent memory leaks and duplicate events
        window.ipcRenderer.removeListener('project:ctx-reveal', onCtxReveal);
        window.ipcRenderer.removeListener('project:ctx-delete', onCtxDelete);
        window.ipcRenderer.removeListener('project:ctx-new-file', onCtxNewFile);
        window.ipcRenderer.removeListener('project:ctx-new-folder', onCtxNewFolder);
        window.ipcRenderer.removeListener('project:ctx-rename', onCtxRename);
        window.removeEventListener('project-tab-shown', onProjectShown);
        if (sidebar) {
            sidebar.removeEventListener('click', onSidebarClick);
            sidebar.removeEventListener('contextmenu', null); 
        }
    };
}

module.exports = { renderProjectViewHTML, attachProjectViewListeners };