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
    handleDrop,
    setActiveFile
} = require('./sidebar.js');
const { setupCodeMirror, disposeEditor, setupDiffEditor, getDiffContent, disposeDiffEditor, scanFileForErrors } = require('./editor.js');
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
                        <div class="panel-tabs">
                            <button class="panel-tab-btn active" data-target="terminal">Terminal</button>
                            <button class="panel-tab-btn" data-target="problems">Problems <span class="problem-badge" style="display:none">0</span></button>
                        </div>
                        <div class="panel-actions">
                            <button id="term-add-header-btn" class="panel-action-btn" title="New Terminal"><i data-lucide="plus"></i></button>
                            <button id="term-list-toggle" class="panel-action-btn" title="Show Terminals"><i data-lucide="list"></i></button>
                        </div>
                    </div>
    <div class="panel-content-wrapper">
        <div id="view-terminal" class="panel-view active">
            <div class="terminal-content-area" style="flex:1; height:100%; overflow:hidden;"></div>
            
            <!-- Minimalistic Overlay List -->
            <div class="terminal-overlay-list" style="display:none; position:absolute; top:0; right:0; width:200px; height:100%; background:var(--window-background-color); border-left:1px solid var(--border-color); z-index:100; flex-direction:column;">
                <div class="term-list-container" style="flex:1; overflow-y:auto;"></div>
            </div>
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
    const tabId = container.id.replace('tab-content-', '');

    if (!window.projectTerminalsData[tabId]) window.projectTerminalsData[tabId] = { terminals: [], activeIndex: -1 };
    const terminalState = window.projectTerminalsData[tabId];

    const sidebar = container.querySelector('.project-sidebar');
    const sidebarHeader = container.querySelector('.project-sidebar-header');
    const fileTreeContainer = container.querySelector('.file-tree-container');
    const editorPane = container.querySelector('.project-editor-pane');
    const titleBar = container.querySelector('.current-file-path');
    const filterInput = container.querySelector('.sidebar-filter-input');
    const viewContainer = container.querySelector('.project-view-container');

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

    // --- CODE INSERTION LISTENER ---
    const onInsertCode = (e) => {
        if (editorView && e.detail) {
            // Insert at cursor position (or replace selection)
            const transaction = editorView.state.replaceSelection(e.detail);
            editorView.dispatch(transaction);
            editorView.focus();
        }
    };
    // --- DIFF VIEW LOGIC ---
    let isDiffMode = false;
    let currentDiffFilePath = null; // Track the file being diffed
    const diffContainer = document.createElement('div');
    diffContainer.className = 'diff-view-container';
    diffContainer.style.display = 'none';
    diffContainer.style.flex = '1';
    diffContainer.style.flexDirection = 'column';
    diffContainer.style.height = '100%';
    diffContainer.style.overflow = 'hidden';

    // Diff Toolbar
    const diffToolbar = document.createElement('div');
    diffToolbar.style.display = 'flex';
    diffToolbar.style.justifyContent = 'space-between';
    diffToolbar.style.alignItems = 'center';
    diffToolbar.style.padding = '8px 12px';
    diffToolbar.style.background = 'var(--header-background)';
    diffToolbar.style.borderBottom = '1px solid var(--border-color)';
    diffToolbar.innerHTML = `
        <div style="font-size: 12px; font-weight: 600;">Review Changes</div>
        <div style="display: flex; gap: 8px;">
            <button id="diff-reject-btn" style="padding: 4px 12px; background: var(--control-background-color); border: 1px solid var(--border-color); color: var(--peak-primary); border-radius: 4px; cursor: pointer; font-size: 11px;">Reject</button>
            <button id="diff-accept-btn" style="padding: 4px 12px; background: var(--peak-accent); border: none; color: white; border-radius: 4px; cursor: pointer; font-size: 11px;">Accept</button>
        </div>
    `;
    diffContainer.appendChild(diffToolbar);

    // Diff Editor Host
    const diffEditorHost = document.createElement('div');
    diffEditorHost.style.flex = '1';
    diffEditorHost.style.overflow = 'hidden';
    diffContainer.appendChild(diffEditorHost);

    // Insert Diff Container into DOM (sibling to editorPane)
    editorPane.parentNode.insertBefore(diffContainer, editorPane.nextSibling);

    const closeDiffView = () => {
        isDiffMode = false;
        diffContainer.style.display = 'none';
        editorPane.style.display = '';
        disposeDiffEditor();
    };

    diffContainer.querySelector('#diff-reject-btn').addEventListener('click', closeDiffView);
    diffContainer.querySelector('#diff-accept-btn').addEventListener('click', async () => {
        const newContent = getDiffContent();
        if (newContent !== null && editorView) {
            // Update editor
            const transaction = editorView.state.update({
                changes: { from: 0, to: editorView.state.doc.length, insert: newContent }
            });
            editorView.dispatch(transaction);

            // Save to disk
            if (currentDiffFilePath && window.ipcRenderer) {
                try {
                    await window.ipcRenderer.invoke('project:write-file', currentDiffFilePath, newContent);
                    currentFileContent = newContent; // Update tracked content
                    console.log('[ProjectView] File saved after diff acceptance:', currentDiffFilePath);
                } catch (err) {
                    console.error('[ProjectView] Failed to save file after diff acceptance:', err);
                    alert(`Failed to save file: ${err.message}`);
                    // Don't close diff on error so user can try again
                    return;
                }
            }
        }
        closeDiffView();
        editorView.focus();
    });

    const onApplyFile = (e) => {
        // e.detail can be just content string (legacy/inline) or { path, content } (tool)
        let content = e.detail;
        let targetPath = activeFilePath;

        if (typeof e.detail === 'object' && e.detail.content) {
            content = e.detail.content;
            if (e.detail.path) {
                if (window.currentProjectRoot) {
                    targetPath = path.join(window.currentProjectRoot, e.detail.path);
                } else {
                    targetPath = e.detail.path;
                }
            }
        }

        if (editorView && content) {
            // If target path is different from active, we should probably load it first?
            // For now, let's assume if it's different, we load it, THEN show diff.
            // But loading is async.
            // If we are already on the file, just show diff.

            if (targetPath && targetPath !== activeFilePath) {
                // Load file first
                loadFile(targetPath).then(() => {
                    // After load, show diff
                    isDiffMode = true;
                    editorPane.style.display = 'none';
                    diffContainer.style.display = 'flex';
                    const currentContent = editorView.state.doc.toString();
                    currentDiffFilePath = targetPath; // Store the file path for saving
                    setupDiffEditor(diffEditorHost, currentContent, content, targetPath);
                });
            } else {
                // Already on file or no path specified
                isDiffMode = true;
                editorPane.style.display = 'none';
                diffContainer.style.display = 'flex';
                const currentContent = editorView.state.doc.toString();
                currentDiffFilePath = activeFilePath; // Store the file path for saving
                setupDiffEditor(diffEditorHost, currentContent, content, activeFilePath);
            }
        }
    };

    // --- AGENTIC TOOL LISTENERS ---

    // Dedicated AI Terminal (hidden, for AI command execution only)
    let aiTerminalId = null;

    const ensureAITerminal = () => {
        if (aiTerminalId && terminalCleanups[aiTerminalId]) {
            return aiTerminalId; // Already exists
        }

        // Create a hidden AI terminal
        const termId = 'ai-term-' + Date.now();
        aiTerminalId = termId;

        // Create DOM element (hidden but with dimensions)
        const el = document.createElement('div');
        el.id = `term-instance-${termId}`;
        // Use off-screen positioning to ensure it has layout dimensions for xterm.js
        el.style.cssText = "position:absolute; left:-9999px; top:0; width:800px; height:600px; visibility:hidden; z-index:-1;";
        terminalContentArea.appendChild(el);

        // Initialize terminal
        const vTab = { id: termId, content: { type: 'terminal', data: { cwd: projectData.path, initialCommand: '' } } };
        TerminalView.renderTerminalHTML(vTab, el);
        const termObj = TerminalView.attachTerminalListeners(vTab, el);
        terminalCleanups[termId] = termObj;

        console.log('[AI Terminal] Created dedicated background terminal:', termId);
        return termId;
    };

    const onRunCommand = (e) => {
        const cmd = e.detail;
        if (!cmd) return;

        // Use dedicated AI terminal instead of user's active terminal
        const termId = ensureAITerminal();

        // Force resize to ensure good width for output capture
        const termInstance = window.terminalInstances ? window.terminalInstances[termId] : null;
        if (termInstance) {
            termInstance.resize(120, 40); // Ensure wide enough for most output
        }

        // Send command to AI Terminal in Main Process PTY
        window.ipcRenderer.send('terminal-write', termId, cmd + '\r');
        console.log('[AI Terminal] Executing command:', cmd);

        // TERMINAL AGENCY: Capture output feedback
        // Wait for command to likely finish or produce output (optimized to 800ms for responsiveness)
        setTimeout(() => {
            const termInstance = window.terminalInstances ? window.terminalInstances[termId] : null;

            if (termInstance && termInstance.buffer && termInstance.buffer.active) {
                const buffer = termInstance.buffer.active;
                const lines = [];
                // Capture last 20 lines
                const start = Math.max(0, buffer.baseY + buffer.cursorY - 20);
                const end = buffer.baseY + buffer.cursorY;
                for (let i = start; i <= end; i++) {
                    const line = buffer.getLine(i);
                    if (line) lines.push(line.translateToString(true));
                }
                const output = lines.join('\n');
                // Dispatch back to AI
                window.dispatchEvent(new CustomEvent('peak-terminal-response', { detail: { cmd, output } }));
            }
        }, 800); // Reduced from 2000ms for better responsiveness
    };

    const onCreateFile = async (e) => {
        console.log("[ProjectView] Received peak-create-file:", e.detail);
        const { path: relativePath, content } = e.detail;
        if (!window.currentProjectRoot) {
            console.error("[ProjectView] Cannot create file: No project root. Current:", window.currentProjectRoot);
            return;
        }
        const fullPath = path.join(window.currentProjectRoot, relativePath);
        try {
            await ipcRenderer.invoke('project:write-file', fullPath, content);
            await refreshSidebar(); // Immediate refresh
            console.log("File created successfully:", fullPath);
        } catch (err) {
            console.error("Failed to create file:", err);
        }
    };

    const onDeleteFile = async (e) => {
        const { path: relativePath } = e.detail;
        if (!window.currentProjectRoot) return;
        const fullPath = path.join(window.currentProjectRoot, relativePath);
        try {
            await ipcRenderer.invoke('project:delete-path', fullPath);
            await refreshSidebar(); // Immediate refresh
        } catch (err) {
            console.error("Failed to delete file:", err);
        }
    };

    const onOpenFile = (e) => {
        const { path: relativePath } = e.detail;
        if (!window.currentProjectRoot) return;
        const fullPath = path.join(window.currentProjectRoot, relativePath);
        loadFile(fullPath);
    };

    window.addEventListener('peak-create-file', onCreateFile);
    window.addEventListener('peak-delete-file', onDeleteFile);
    window.addEventListener('peak-insert-code', onInsertCode);
    window.addEventListener('peak-apply-file', onApplyFile);
    window.addEventListener('peak-run-command', onRunCommand);
    window.addEventListener('peak-open-file', onOpenFile);

    // NEW: Inline Chat Handler
    const onInlineChatSubmit = async (e) => {
        const { prompt, context } = e.detail;

        // Use the existing AI Assistant logic (via IPC) but with a specific instruction
        // We want to stream the response and then apply it as a diff.

        // Construct a focused prompt
        const systemInstruction = `
You are an expert coding assistant.
The user wants to edit the following file: "${context.filePath}".
${context.selection ? `They have selected this code:\n\`\`\`\n${context.selection}\n\`\`\`\n` : ''}

USER PROMPT: ${prompt}

INSTRUCTIONS:
1. Output ONLY the new code for the file (or the replacement for the selection).
2. Do NOT use <thinking> tags.
3. Do NOT use markdown code blocks. Just raw code.
4. If the file is large, output the FULL file content with changes applied.
`;

        const inlineSessionId = 'inline-' + Date.now();
        console.log("Inline Chat Request:", prompt);

        // Send request
        window.ipcRenderer.send('llm-stream-request', inlineSessionId, 'openrouter/auto', [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: "Generate the code." }
        ]);

        let accumulatedCode = '';

        const onStreamData = (event, id, data) => {
            if (id !== inlineSessionId) return;

            if (data.type === 'data') {
                accumulatedCode += data.content;
            } else if (data.type === 'end') {
                window.ipcRenderer.removeListener('llm-stream-data', onStreamData);

                // Trigger Diff View with the result
                let cleanCode = accumulatedCode.trim();
                if (cleanCode.startsWith('```')) {
                    cleanCode = cleanCode.replace(/^```[a-z]*\n/, '').replace(/```$/, '');
                }

                window.dispatchEvent(new CustomEvent('peak-apply-file', {
                    detail: cleanCode
                }));
            } else if (data.type === 'error') {
                console.error("Inline Chat Error:", data.message);
                window.ipcRenderer.removeListener('llm-stream-data', onStreamData);
            }
        };

        window.ipcRenderer.on('llm-stream-data', onStreamData);
    };

    window.addEventListener('peak-inline-chat-submit', onInlineChatSubmit);

    // onCreateFile is deprecated/removed
    // window.addEventListener('peak-create-file', onCreateFile);
    // ------------------------------

    const refreshSidebar = async () => {
        await renderSidebarHTML(fileTreeContainer, projectData, filterInput ? filterInput.value : '');
    };

    if (filterInput) {
        filterInput.addEventListener('input', () => refreshSidebar());
    }

    const updateGlobalContext = () => {
        window.currentProjectRoot = projectData.path; // Expose project root for AI
        window.peakGetDiagnostics = () => {
            // Convert Map to a serializable format
            const result = [];
            allDiagnostics.forEach((diags, file) => {
                result.push({ file, diagnostics: diags });
            });
            return result;
        };
        window.getProjectFileContext = () => ({
            currentFilePath: activeFilePath,
            currentFileContent: currentFileContent,
            currentFileContentError: null,
            projectTitle: projectData.title || path.basename(projectData.path)
        });
        // Notify other components (like ChatView) that project root is available
        window.dispatchEvent(new CustomEvent('peak-project-root-updated', { detail: { root: window.currentProjectRoot } }));
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

    // Context Menu Handlers
    const onCtxReveal = (e, data) => { if (data.instanceId !== tabId) return; window.ipcRenderer.invoke('project:reveal-in-finder', data.targetPath); };
    const onCtxDelete = async (e, data) => { if (data.instanceId !== tabId) return; if (confirm(`Delete ${path.basename(data.targetPath)}?`)) { const safeId = 'tree-' + data.targetPath.replace(/[^a-zA-Z0-9]/g, '_'); const el = fileTreeContainer.querySelector(`#${safeId}`); if (el) el.remove(); const res = await window.ipcRenderer.invoke('project:delete-path', data.targetPath); if (res.success) refreshSidebar(); } };
    const onCtxNewFile = (e, data) => { if (data.instanceId !== tabId) return; createNewFileSystemItem(false, data.targetPath || projectData.path, refreshSidebar, fileTreeContainer); };
    const onCtxNewFolder = (e, data) => { if (data.instanceId !== tabId) return; createNewFileSystemItem(true, data.targetPath || projectData.path, refreshSidebar, fileTreeContainer); };
    const onCtxRename = (e, data) => { if (data.instanceId !== tabId) return; const safeId = 'tree-' + data.targetPath.replace(/[^a-zA-Z0-9]/g, '_'); const li = fileTreeContainer.querySelector(`#${safeId}`); if (li) { const span = li.querySelector('.item-name'); if (span) renameFileSystemItem(data.targetPath, span, refreshSidebar); } };

    window.ipcRenderer.on('project:ctx-reveal', onCtxReveal);
    window.ipcRenderer.on('project:ctx-delete', onCtxDelete);
    window.ipcRenderer.on('project:ctx-new-file', onCtxNewFile);
    window.ipcRenderer.on('project:ctx-new-folder', onCtxNewFolder);
    window.ipcRenderer.on('project:ctx-rename', onCtxRename);

    if (sidebar) {
        sidebar.addEventListener('contextmenu', (e) => {
            e.preventDefault(); e.stopPropagation();
            const item = e.target.closest('.tree-item');
            if (item) {
                if (!item.classList.contains('selected')) {
                    fileTreeContainer.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                }
                window.ipcRenderer.send('show-project-context-menu', { targetPath: item.dataset.path, instanceId: tabId });
            } else {
                window.ipcRenderer.send('show-project-context-menu', { targetPath: projectData.path, instanceId: tabId });
            }
        });
    }

    if (sidebarHeader) {
        sidebarHeader.addEventListener('click', async (e) => {
            const btn = e.target.closest('.sidebar-action-icon');
            if (!btn) return;
            e.stopPropagation(); e.preventDefault();
            const selected = fileTreeContainer.querySelector('.tree-item.selected');
            const target = selected ? selected.dataset.path : null;
            if (btn.classList.contains('action-create-file')) createNewFileSystemItem(false, target || projectData.path, refreshSidebar, fileTreeContainer);
            else if (btn.classList.contains('action-create-folder')) createNewFileSystemItem(true, target || projectData.path, refreshSidebar, fileTreeContainer);
        });
    }

    // Problems View
    const renderProblemsView = () => { if (!problemsView) return; problemsView.innerHTML = ''; let totalCount = 0; if (allDiagnostics.size === 0) { problemsView.innerHTML = `<div class="empty-problems">No problems detected.</div>`; if (problemsBadge) problemsBadge.textContent = ''; return; } const sortedFiles = Array.from(allDiagnostics.keys()).sort(); sortedFiles.forEach(filePath => { const diags = allDiagnostics.get(filePath); if (!diags || diags.length === 0) return; totalCount += diags.length; const fileGroup = document.createElement('div'); fileGroup.className = 'problem-file-group'; const displayPath = path.relative(projectData.path, path.dirname(filePath)); const header = document.createElement('div'); header.className = 'problem-file-header'; header.innerHTML = `<div class="file-toggle"><i data-lucide="chevron-down"></i></div><div class="file-icon">${getFileIconHTML(path.basename(filePath))}</div><div class="file-info"><span class="file-name">${path.basename(filePath)}</span><span class="file-path">${displayPath ? displayPath : ''}</span></div><div class="file-badge">${diags.length}</div>`; header.onclick = () => { fileGroup.classList.toggle('collapsed'); const icon = header.querySelector('.file-toggle i'); icon.setAttribute('data-lucide', fileGroup.classList.contains('collapsed') ? 'chevron-right' : 'chevron-down'); if (window.lucide) window.lucide.createIcons(); }; const list = document.createElement('div'); list.className = 'problem-list'; diags.forEach(d => { const item = document.createElement('div'); item.className = 'problem-item'; if (selectedProblem && selectedProblem.diagnostic === d) item.classList.add('selected'); const severityIcon = d.severity === 'error' ? 'x-circle' : 'alert-triangle'; const severityClass = d.severity === 'error' ? 'error' : 'warning'; const lineText = (d.line !== undefined && d.col !== undefined) ? `[${d.line}, ${d.col}]` : `[Pos ${d.from}]`; item.innerHTML = `<div class="problem-gutter"></div><div class="problem-main"><i data-lucide="${severityIcon}" class="problem-icon ${severityClass}"></i><span class="problem-message" title="${d.message}">${d.message}</span><span class="problem-source">${d.source || ''}</span><span class="problem-pos">${lineText}</span></div>`; item.onclick = async (e) => { e.stopPropagation(); selectedProblem = { diagnostic: d, filePath: filePath }; problemsView.querySelectorAll('.problem-item').forEach(el => el.classList.remove('selected')); item.classList.add('selected'); problemsView.focus(); if (window.currentFilePath !== filePath) await loadFile(filePath); if (editorPane.jumpToLine) editorPane.jumpToLine(d.from); }; item.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); selectedProblem = { diagnostic: d, filePath: filePath }; const copyText = `${d.message} (${path.basename(filePath)} ${lineText})`; window.ipcRenderer.send('show-problem-context-menu', copyText); }); list.appendChild(item); }); fileGroup.appendChild(header); fileGroup.appendChild(list); problemsView.appendChild(fileGroup); }); if (problemsBadge) { problemsBadge.textContent = totalCount > 0 ? ` ${totalCount}` : ''; problemsBadge.style.color = totalCount > 0 ? 'var(--peak-accent)' : 'inherit'; } if (window.lucide) window.lucide.createIcons(); };
    const onDiagnostics = (e) => { const { filePath, diagnostics } = e.detail; if (!filePath) return; if (!diagnostics || diagnostics.length === 0) allDiagnostics.delete(filePath); else allDiagnostics.set(filePath, diagnostics); renderProblemsView(); };
    window.addEventListener('peak-editor-diagnostics', onDiagnostics);
    problemsView.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'c' && selectedProblem) { const d = selectedProblem.diagnostic; const lineText = (d.line !== undefined) ? `[${d.line}:${d.col}]` : `[Pos ${d.from}]`; const text = `${d.message} (${path.basename(selectedProblem.filePath)} ${lineText})`; clipboard.writeText(text); e.preventDefault(); } });
    problemsView.addEventListener('click', (e) => { if (e.target === problemsView) { selectedProblem = null; problemsView.querySelectorAll('.problem-item').forEach(el => el.classList.remove('selected')); } });

    // Terminal Logic
    const renderTerminalList = () => { if (termListContainer) termListContainer.innerHTML = terminalState.terminals.map((t, i) => `<div class="term-list-item ${i === terminalState.activeIndex ? 'active' : ''}" data-idx="${i}"><span>${t.name || 'bash'}</span><div class="term-close-btn" data-id="${t.id}"><i data-lucide="x" style="width:10px; height:10px;"></i></div></div>`).join(''); if (window.lucide) window.lucide.createIcons(); };
    const showTerminal = (idx) => {
        Array.from(terminalContentArea.children).forEach(el => el.style.display = 'none');
        if (idx >= 0 && idx < terminalState.terminals.length) {
            const t = terminalState.terminals[idx];
            let el = document.getElementById(`term-instance-${t.id}`);
            if (!el) {
                el = document.createElement('div');
                el.id = `term-instance-${t.id}`;
                el.style.cssText = "width:100%;height:100%;";
                terminalContentArea.appendChild(el);
                const vTab = { id: t.id, content: { type: 'terminal', data: { cwd: projectData.path, initialCommand: '' } } };
                TerminalView.renderTerminalHTML(vTab, el);
                const termObj = TerminalView.attachTerminalListeners(vTab, el);
                terminalCleanups[t.id] = termObj; // Store the whole object
            }
            el.style.display = 'block';
            terminalState.activeIndex = idx;
            window.dispatchEvent(new CustomEvent('terminal-tab-shown', { detail: { id: t.id } }));

            // Force fit if visible
            if (terminalPanel.style.display !== 'none' && terminalCleanups[t.id] && terminalCleanups[t.id].fit) {
                setTimeout(() => terminalCleanups[t.id].fit(), 10);
            }
        } else {
            terminalState.activeIndex = -1;
        }
        renderTerminalList();
    };

    const createTerm = () => { terminalState.terminals.push({ id: 'term-' + Date.now(), name: 'Terminal' }); showTerminal(terminalState.terminals.length - 1); };

    if (termAddBtn) termAddBtn.addEventListener('click', createTerm);

    if (termListContainer) termListContainer.addEventListener('click', e => {
        const cb = e.target.closest('.term-close-btn');
        if (cb) {
            e.stopPropagation();
            const id = cb.dataset.id;
            const idx = terminalState.terminals.findIndex(t => t.id === id);
            if (idx > -1) {
                if (terminalCleanups[id] && terminalCleanups[id].cleanup) terminalCleanups[id].cleanup();
                else if (typeof terminalCleanups[id] === 'function') terminalCleanups[id](); // Handle legacy function return

                delete terminalCleanups[id];
                document.getElementById(`term-instance-${id}`)?.remove();
                terminalState.terminals.splice(idx, 1);
                if (terminalState.terminals.length === 0) terminalState.activeIndex = -1;
                else if (idx <= terminalState.activeIndex) terminalState.activeIndex = Math.max(0, terminalState.activeIndex - 1);
                showTerminal(terminalState.activeIndex);
            }
        } else {
            const it = e.target.closest('.term-list-item');
            if (it) showTerminal(parseInt(it.dataset.idx));
        }
    });

    tabButtons.forEach(btn => btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        tabButtons.forEach(b => b.classList.toggle('active', b.dataset.target === target));
        views.forEach(v => v.classList.toggle('active', v.id === `view-${target}`));
        if (target === 'terminal' && terminalState.activeIndex >= 0) showTerminal(terminalState.activeIndex);
    }));

    const toggleTerminal = () => {
        const isVisible = terminalPanel.style.display !== 'none';
        terminalPanel.style.display = isVisible ? 'none' : 'flex';

        if (!isVisible) {
            // We just opened it
            if (terminalState.terminals.length === 0) {
                createTerm();
            } else if (terminalState.activeIndex >= 0) {
                // Refit current terminal
                const t = terminalState.terminals[terminalState.activeIndex];
                if (t && terminalCleanups[t.id] && terminalCleanups[t.id].fit) {
                    setTimeout(() => terminalCleanups[t.id].fit(), 10);
                }
            }
        }
    };
    container.querySelector('.link-toggle-terminal')?.addEventListener('click', e => { e.preventDefault(); toggleTerminal(); });

    const btnToggle = container.querySelector('.link-toggle-sidebar');
    if (btnToggle) btnToggle.addEventListener('click', (e) => { e.preventDefault(); viewContainer.classList.toggle('sidebar-collapsed'); });
    // --- TERMINAL UI HANDLERS ---
    const termListToggle = container.querySelector('#term-list-toggle');
    const termAddHeaderBtn = container.querySelector('#term-add-header-btn');
    const termOverlayList = container.querySelector('.terminal-overlay-list');
    const termOverlayClose = container.querySelector('#term-overlay-close');

    const toggleTermList = (show) => {
        if (termOverlayList) {
            termOverlayList.style.display = show ? 'flex' : 'none';
        }
    };

    if (termListToggle) {
        termListToggle.addEventListener('click', () => {
            const isHidden = termOverlayList.style.display === 'none';
            toggleTermList(isHidden);
        });
    }

    if (termOverlayClose) {
        termOverlayClose.addEventListener('click', () => toggleTermList(false));
    }

    if (termAddHeaderBtn) {
        termAddHeaderBtn.addEventListener('click', () => {
            createTerm();
            toggleTermList(true); // Show list when adding so user sees it
        });
    }

    // Update createTerm to not rely on old sidebar button
    // (createTerm function needs to be updated if it references old elements)
    const btnAi = container.querySelector('.link-ai-chat');
    if (btnAi) btnAi.addEventListener('click', (e) => { e.preventDefault(); window.openInspector('ai-assist'); });

    if (resizeHandle) {
        let startY, startHeight;
        const onDrag = e => { terminalPanel.style.height = `${startHeight + (startY - e.clientY)}px`; };
        const onStop = () => { document.removeEventListener('mousemove', onDrag); document.removeEventListener('mouseup', onStop); resizeHandle.classList.remove('resizing'); };
        resizeHandle.addEventListener('mousedown', e => { startY = e.clientY; startHeight = terminalPanel.offsetHeight; resizeHandle.classList.add('resizing'); document.addEventListener('mousemove', onDrag); document.addEventListener('mouseup', onStop); e.preventDefault(); });
    }

    const loadFile = async (filePath) => {
        if (titleBar) {
            titleBar.textContent = path.basename(filePath);
        }

        editorPane.innerHTML = '<div class="project-editor-placeholder">Loading...</div>';
        editorPane.classList.remove('code-mirror-active');
        try {
            // Move disposal inside try-catch to handle errors gracefully
            try { disposeEditor(editorView); } catch (e) {
                console.error("Error disposing editor:", e);
            }
            // Don't clear all diagnostics here, just re-render.
            // The editor will update its own diagnostics when loaded.
            renderProblemsView();

            // Check for Image
            const ext = path.extname(filePath).toLowerCase();
            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp'];
            const videoExts = ['.mp4', '.webm', '.ogg', '.mov'];

            if (imageExts.includes(ext)) {
                activeFilePath = filePath; window.currentFilePath = filePath;
                // Render Image
                editorPane.innerHTML = `
                    <div style="display:flex; justify-content:center; align-items:center; height:100%; overflow:auto; padding:20px;">
                        <img src="file://${filePath}" style="max-width:100%; max-height:100%; object-fit:contain; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 4px;">
                    </div>
                `;
                updateGlobalContext();
                return;
            }

            if (videoExts.includes(ext)) {
                activeFilePath = filePath; window.currentFilePath = filePath;
                // Render Video
                editorPane.innerHTML = `
                    <div style="display:flex; justify-content:center; align-items:center; height:100%; overflow:auto; padding:20px;">
                        <video src="file://${filePath}" controls style="max-width:100%; max-height:100%; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-radius: 4px;"></video>
                    </div>
                `;
                updateGlobalContext();
                return;
            }

            const content = await window.ipcRenderer.invoke('project:read-file', filePath);

            if (typeof content === 'string') {
                currentFileContent = content;
                activeFilePath = filePath; window.currentFilePath = filePath;
                editorView = setupCodeMirror(editorPane, content, filePath);

                if (editorView) {
                    editorPane.classList.add('code-mirror-active');
                    window.dispatchEvent(new CustomEvent('peak-project-file-selected', { detail: { filePath, content } }));
                }
                updateGlobalContext();

                // SYNC SIDEBAR
                if (fileTreeContainer) {
                    setActiveFile(fileTreeContainer, filePath);
                }
            } else {
                editorPane.innerHTML = '<div class="error">Error reading file</div>';
            }
        } catch (e) {
            console.error(e);
            editorPane.innerHTML = `<div class="error">${e.message}</div>`;
        }
    };

    // NEW: Project-Wide Error Scanner
    const scanProjectForErrors = async () => {
        if (!window.currentProjectRoot) return;

        // Show loading state in problems view if empty
        if (allDiagnostics.size === 0 && problemsView) {
            problemsView.innerHTML = '<div class="empty-problems">Scanning project for errors...</div>';
        }

        try {
            // Get all files
            const files = await window.ipcRenderer.invoke('get-project-files', window.currentProjectRoot);
            if (!files || !Array.isArray(files)) return;

            // Filter for supported extensions to avoid reading unnecessary files
            // Filter for supported extensions to avoid reading unnecessary files
            const supportedExts = ['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.cpp', '.c', '.h', '.hpp', '.rs', '.go', '.php', '.sql', '.yaml', '.yml', '.json'];

            // Filter out build artifacts and node_modules
            const ignoredPatterns = ['.next', 'node_modules', '.git', 'dist', 'build', 'out', 'coverage'];

            const filesToScan = files.filter(f => {
                const lower = f.toLowerCase();
                // Check extension
                if (!supportedExts.some(ext => lower.endsWith(ext))) return false;
                // Check ignored patterns
                if (ignoredPatterns.some(p => lower.includes(p) || lower.includes(`/${p}/`) || lower.includes(`\\${p}\\`))) return false;
                return true;
            });

            let errorCount = 0;

            // Process in chunks to avoid freezing UI
            const chunkSize = 10;
            for (let i = 0; i < filesToScan.length; i += chunkSize) {
                const chunk = filesToScan.slice(i, i + chunkSize);
                await Promise.all(chunk.map(async (relPath) => {
                    const fullPath = path.join(window.currentProjectRoot, relPath);

                    // Skip if currently open in editor (let the live linter handle it)
                    if (activeFilePath === fullPath && editorView) return;

                    try {
                        const content = await window.ipcRenderer.invoke('project:read-file', fullPath);
                        if (typeof content === 'string') {
                            const diags = scanFileForErrors(content, fullPath);
                            if (diags && diags.length > 0) {
                                allDiagnostics.set(fullPath, diags);
                                errorCount += diags.length;
                            } else {
                                allDiagnostics.delete(fullPath);
                            }
                        }
                    } catch (e) { /* ignore read errors */ }
                }));

                // Yield to UI thread occasionally
                if (i % 50 === 0) await new Promise(r => setTimeout(r, 10));
            }

            renderProblemsView();

        } catch (e) {
            console.error("Project scan failed:", e);
        }
    };

    let lastSelectedPath = null;

    const onSidebarClick = async (e) => {
        if (e.target.tagName === 'INPUT') return;
        const item = e.target.closest('.tree-item');
        if (!item) return;

        const p = item.dataset.path;

        // --- MULTI-SELECTION LOGIC ---
        if (e.metaKey || e.ctrlKey) {
            // Toggle
            if (item.classList.contains('selected')) {
                item.classList.remove('selected');
            } else {
                item.classList.add('selected');
                lastSelectedPath = p;
            }
        } else if (e.shiftKey && lastSelectedPath) {
            // Range
            const allItems = Array.from(fileTreeContainer.querySelectorAll('.tree-item'));
            const lastIdx = allItems.findIndex(el => el.dataset.path === lastSelectedPath);
            const currIdx = allItems.indexOf(item);

            if (lastIdx !== -1 && currIdx !== -1) {
                const start = Math.min(lastIdx, currIdx);
                const end = Math.max(lastIdx, currIdx);
                // Clear others if needed? Usually Shift extends selection. 
                // Standard behavior: Shift+Click selects range from anchor. 
                // Often it clears previous selection unless Cmd was also held, but let's keep it simple:
                // We'll just add the range to the selection.
                for (let i = start; i <= end; i++) {
                    allItems[i].classList.add('selected');
                }
            }
        } else {
            // Single Select
            fileTreeContainer.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
            item.classList.add('selected');
            lastSelectedPath = p;
        }
        // -----------------------------

        if (item.dataset.isDirectory === 'true') {
            e.stopPropagation();
            // Only toggle folder if it was the primary click (no modifiers or just simple click)
            // Actually, standard behavior is double click to expand, single to select.
            // But here we have single click expand.
            // If modifiers are used, we probably just want to select, NOT expand/collapse.
            if (!e.metaKey && !e.ctrlKey && !e.shiftKey) {
                await toggleFolderState(item, p, () => filterInput ? filterInput.value : '');
            }
        } else {
            // Only load file if single selection and no modifiers (or maybe just load the clicked one?)
            // If we are selecting multiple, we probably don't want to change the editor view every time.
            // Let's only load if it's a single selection.
            const selectedCount = fileTreeContainer.querySelectorAll('.tree-item.selected').length;
            if (selectedCount === 1 && item.classList.contains('selected')) {
                loadFile(p);
            }
        }
    };
    if (sidebar) sidebar.addEventListener('click', onSidebarClick);
    if (sidebar) sidebar.addEventListener('dragstart', handleDragStart);
    if (sidebar) sidebar.addEventListener('dragover', handleDragOver);
    if (sidebar) sidebar.addEventListener('dragleave', handleDragLeave);
    if (sidebar) sidebar.addEventListener('drop', (e) => handleDrop(e, refreshSidebar));

    // --- COPY / PASTE HANDLERS ---
    const handleCopy = (e) => {
        // Only handle if sidebar or body is focused (not input)
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        const selectedItems = fileTreeContainer.querySelectorAll('.tree-item.selected');
        if (selectedItems.length > 0) {
            const paths = Array.from(selectedItems).map(el => el.dataset.path);
            // Use Main Process IPC for correct OS clipboard format
            window.ipcRenderer.invoke('clipboard:write-files', paths);
            console.log("Copied to clipboard:", paths);
        }
    };

    const handlePaste = async (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        // Determine Target
        let targetPath = projectData.path;
        const selected = fileTreeContainer.querySelector('.tree-item.selected');
        if (selected) {
            if (selected.dataset.isDirectory === 'true') targetPath = selected.dataset.path;
            else targetPath = path.dirname(selected.dataset.path);
        }

        // Check Clipboard
        // 1. Files (OS Paste)
        // Electron clipboard.read('NSFilenamesPboardType') returns raw plist on Mac, 
        // but let's try reading text first as a simple path check

        // Actually, let's use a simpler approach:
        // If text looks like a path and exists, copy it.
        const text = clipboard.readText();
        if (text && text.startsWith('/')) {
            // Check if it exists
            // We need an IPC to check existence? Or just try copy.
            // Let's assume it's a path.
            const fileName = path.basename(text);
            const newPath = path.join(targetPath, fileName);

            // If source == destination (copy/paste in same folder), append " copy"
            let finalPath = newPath;
            if (text === newPath) {
                const ext = path.extname(fileName);
                const base = path.basename(fileName, ext);
                finalPath = path.join(targetPath, `${base} copy${ext}`);
            }

            const res = await window.ipcRenderer.invoke('project:copy-file', text, finalPath);
            if (res.success) {
                await refreshSidebar();
                return;
            }
        }
    };

    const onKeyDown = (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'c') handleCopy(e);
        if ((e.metaKey || e.ctrlKey) && e.key === 'v') handlePaste(e);
    };
    window.addEventListener('keydown', onKeyDown);

    await refreshSidebar();
    await refreshSidebar();

    // Trigger initial scan
    setTimeout(() => scanProjectForErrors(), 1000);
    if (terminalState.terminals.length === 0) {
        createTerm();
        // Hide panel initially if auto-created (it defaults to visible in createTerm via showTerminal)
        // But showTerminal sets display:block on the instance.
        // The panel itself (terminalPanel) is display:none by default in HTML.
        // So createTerm() will create the instance in the DOM, but the user won't see it until they toggle the panel.
        // Perfect for "background" init.
    } else {
        showTerminal(terminalState.activeIndex);
    }

    return () => {
        disposeEditor(editorView);
        Object.values(terminalCleanups).forEach(c => c());
        window.removeEventListener('peak-editor-diagnostics', onDiagnostics);
        window.removeEventListener('peak-insert-code', onInsertCode);
        window.removeEventListener('peak-apply-file', onApplyFile);
        window.removeEventListener('peak-run-command', onRunCommand);
        window.removeEventListener('peak-create-file', onCreateFile);
        window.removeEventListener('peak-delete-file', onDeleteFile);
        window.removeEventListener('peak-open-file', onOpenFile);
        window.removeEventListener('peak-inline-chat-submit', onInlineChatSubmit); // We need to name this too if we want to remove it
        window.removeEventListener('keydown', onKeyDown);

        window.ipcRenderer.removeListener('project:ctx-reveal', onCtxReveal);
        window.ipcRenderer.removeListener('project:ctx-delete', onCtxDelete);
        window.ipcRenderer.removeListener('project:ctx-new-file', onCtxNewFile);
        window.ipcRenderer.removeListener('project:ctx-new-folder', onCtxNewFolder);
        window.ipcRenderer.removeListener('project:ctx-rename', onCtxRename);
        window.removeEventListener('project-tab-shown', onProjectShown);
        if (sidebar) {
            sidebar.removeEventListener('click', onSidebarClick);
            sidebar.removeEventListener('contextmenu', null);
            sidebar.removeEventListener('dragstart', handleDragStart);
            sidebar.removeEventListener('dragover', handleDragOver);
            sidebar.removeEventListener('dragleave', handleDragLeave);
            sidebar.removeEventListener('drop', handleDrop);
        }
    };
}

module.exports = { renderProjectViewHTML, attachProjectViewListeners };