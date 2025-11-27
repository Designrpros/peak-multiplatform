// ... [Imports and renderFinderHTML remain the same] ...
// (Keep the top part of the file as is until attachFinderListeners)

async function attachFinderListeners(data, container) {
    const contentArea = container.querySelector('#finder-content-area');
    const quickLook = container.querySelector('#quick-look');
    
    // --- TERMINAL SETUP ---
    const termContainer = container.querySelector('#finder-xterm-container');
    const termWrapper = container.querySelector('#finder-terminal-wrapper');
    let term = null;
    let fitAddon = null;
    const termId = `finder-term-${Date.now()}`;
    let onTermContextAction = null;
    
    if (Terminal && termContainer) {
        term = new Terminal({
            cursorBlink: true,
            fontFamily: 'Menlo, monospace',
            fontSize: 12,
            theme: getCurrentTheme(),
            allowTransparency: true,
            rows: 8,
            rightClickSelectsWord: true
        });
        
        fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        if (ClipboardAddon) term.loadAddon(new ClipboardAddon());
        
        term.open(termContainer);
        
        // --- FIXED: Key Handlers (Copy/Paste) ---
        term.attachCustomKeyEventHandler((arg) => {
            if (arg.type !== 'keydown') return true;
            
            const key = arg.key.toLowerCase();
            const isMac = process.platform === 'darwin';
            
            const isCopy = isMac 
                ? (arg.metaKey && key === 'c') 
                : (arg.ctrlKey && arg.shiftKey && key === 'c');
                
            const isPaste = isMac 
                ? (arg.metaKey && key === 'v') 
                : (arg.ctrlKey && arg.shiftKey && key === 'v');

            if (isCopy) {
                const selection = term.getSelection();
                if (selection) { 
                    clipboard.writeText(selection); 
                    arg.preventDefault(); // Stop browser copy
                    return false; 
                }
                return true;
            }
            
            if (isPaste) {
                arg.preventDefault(); // <--- CRITICAL FIX: Stop double paste
                term.paste(clipboard.readText());
                return false;
            }
            return true;
        });

        // ... [Context Menu logic remains the same] ...
        termContainer.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.ipcRenderer.send('show-terminal-context-menu', { id: termId, hasSelection: term.hasSelection() });
        });

        onTermContextAction = (event, { action, id }) => {
            if (id !== termId) return;
            if (action === 'copy') { clipboard.writeText(term.getSelection()); term.clearSelection(); }
            else if (action === 'paste') term.paste(clipboard.readText());
            else if (action === 'clear') term.clear();
            else if (action === 'kill') { 
                container.querySelector('#btn-toggle-term').click();
            }
        };
        ipcRenderer.on('terminal-context-action', onTermContextAction);

        // ... [Rest of the function remains exactly the same] ...
        const initialPath = currentPath || data.path || await ipcRenderer.invoke('app:get-home-path');
        ipcRenderer.send('terminal-create', termId, initialPath);
        
        fitAddon.fit();
        
        term.onData(d => ipcRenderer.send('terminal-write', termId, d));
        const onTermData = (e, id, d) => { if(id === termId) term.write(d); };
        ipcRenderer.on('terminal-data', onTermData);
        
        const resizeObserver = new ResizeObserver(() => {
            if(isTerminalVisible && fitAddon) {
                fitAddon.fit();
                ipcRenderer.send('terminal-resize', termId, { cols: term.cols, rows: term.rows });
            }
        });
        resizeObserver.observe(termWrapper);
        
        container.termCleanup = () => {
            ipcRenderer.removeListener('terminal-data', onTermData);
            if (onTermContextAction) ipcRenderer.removeListener('terminal-context-action', onTermContextAction);
            ipcRenderer.send('terminal-kill', termId);
            resizeObserver.disconnect();
            term.dispose();
        };
    }

    // ... [Rest of Finder logic (renderSidebar, listeners, etc.) remains unchanged] ...
    if (!currentPath) {
        currentPath = await ipcRenderer.invoke('app:get-home-path');
        history = [currentPath];
        historyIndex = 0;
    }
    
    await loadDirectory(currentPath);
    renderSidebar();

    async function loadDirectory(dirPath) {
        // ... (Original loadDirectory logic) ...
        const files = await ipcRenderer.invoke('finder:read-dir', dirPath);
        if (!files || files.error) {
            contentArea.innerHTML = `<div style="text-align:center; padding:40px;">Access Denied</div>`;
            return;
        }
        currentPath = dirPath;
        filesCache = files;
        selectedPaths.clear();
        
        renderBreadcrumbs();
        renderFiles(files);
        updateNavButtons();
        
        if (term) {
            const safePath = dirPath.includes(' ') ? `"${dirPath}"` : dirPath;
            ipcRenderer.send('terminal-write', termId, `cd ${safePath}\r`);
        }
    }

    // ... (Rest of the helper functions: renderFiles, renderSelection, context menus, etc.) ...
    // (I am omitting the 300 lines of existing Finder logic for brevity, assume it stays the same)
    function renderFiles(files) {
        contentArea.innerHTML = '';
        if (files.length === 0) {
            contentArea.innerHTML = `<div style="text-align:center; color:var(--peak-secondary); margin-top:40px;">Empty Folder</div>`;
            return;
        }

        if (viewMode === 'grid') {
            contentArea.className = 'finder-content file-grid';
            contentArea.innerHTML = files.map(f => {
                const isDir = f.isDirectory;
                const iconName = isDir ? 'folder' : getFileIcon(f.name); 
                const iconClass = isDir ? 'folder' : 'file';
                return `
                    <div class="grid-item" data-path="${f.path}" data-name="${f.name}" data-isdir="${isDir}">
                        <div class="grid-icon ${iconClass}"><i data-lucide="${iconName}" style="width:100%; height:100%;"></i></div>
                        <div class="grid-name">${f.name}</div>
                    </div>
                `;
            }).join('');
        } else {
            contentArea.className = 'finder-content file-list';
            const header = `<div class="list-header"><span></span><span>Name</span><span>Date Modified</span><span>Size</span></div>`;
            const rows = files.map(f => {
                const iconName = f.isDirectory ? 'folder' : getFileIcon(f.name);
                return `
                    <div class="list-item" data-path="${f.path}" data-name="${f.name}" data-isdir="${f.isDirectory}">
                        <div class="list-icon"><i data-lucide="${iconName}"></i></div>
                        <div class="list-name">${f.name}</div>
                        <div class="list-meta">${new Date(f.mtime).toLocaleDateString()}</div>
                        <div class="list-meta">${f.isDirectory ? '--' : formatBytes(f.size)}</div>
                    </div>
                `;
            }).join('');
            contentArea.innerHTML = header + rows;
        }
        if(window.lucide) window.lucide.createIcons();
    }

    // ... (Rest of interactions) ...
    contentArea.addEventListener('click', (e) => {
        const item = e.target.closest('[data-path]');
        if (!item) { selectedPaths.clear(); renderSelection(); return; }
        if (e.metaKey || e.ctrlKey) {
            if (selectedPaths.has(item.dataset.path)) selectedPaths.delete(item.dataset.path);
            else selectedPaths.add(item.dataset.path);
        } else {
            selectedPaths.clear();
            selectedPaths.add(item.dataset.path);
        }
        renderSelection();
        e.stopPropagation();
    });

    contentArea.addEventListener('dblclick', async (e) => {
        const item = e.target.closest('[data-path]');
        if(!item) return;
        if (item.dataset.isdir === 'true') {
            history = history.slice(0, historyIndex + 1);
            history.push(item.dataset.path);
            historyIndex++;
            await loadDirectory(item.dataset.path);
        } else {
            ipcRenderer.invoke('app:open-path', item.dataset.path);
        }
    });

    function renderSelection() {
        const items = contentArea.querySelectorAll('[data-path]');
        items.forEach(el => {
            if (selectedPaths.has(el.dataset.path)) el.classList.add('selected');
            else el.classList.remove('selected');
        });
    }

    contentArea.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const item = e.target.closest('[data-path]');
        const fileData = item ? { path: item.dataset.path, isDir: item.dataset.isdir === 'true' } : null;
        ipcRenderer.send('show-finder-context-menu', fileData);
    });

    document.addEventListener('keydown', (e) => {
        if (!document.getElementById('finder-content-area')) return; 
        if (e.code === 'Space' && selectedPaths.size === 1 && !e.target.matches('input,textarea')) {
            e.preventDefault();
            toggleQuickLook();
        } else if (e.key === 'Escape') {
            quickLook.classList.remove('active');
        }
    });

    // --- QUICK LOOK ---
    async function toggleQuickLook() {
        if (quickLook.classList.contains('active')) { quickLook.classList.remove('active'); return; }
        const pathStr = Array.from(selectedPaths)[0];
        const file = filesCache.find(f => f.path === pathStr);
        if (!file || file.isDirectory) return;

        const previewEl = document.getElementById('ql-preview');
        document.getElementById('ql-title').textContent = file.name;
        previewEl.innerHTML = '<div style="color:#888">Loading...</div>';
        quickLook.classList.add('active');

        const ext = file.name.split('.').pop().toLowerCase();
        if (['jpg','png','svg','gif','webp'].includes(ext)) {
            previewEl.innerHTML = `<img src="file://${pathStr}">`;
        } else if (['txt','md','json','js','css','html'].includes(ext)) {
            const content = await ipcRenderer.invoke('project:read-file', pathStr);
            previewEl.innerHTML = `<pre>${content.substring(0, 2000)}</pre>`;
        } else {
            previewEl.innerHTML = `<div style="text-align:center"><i data-lucide="file" style="width:64px;height:64px;color:#888"></i><p>Preview not available</p></div>`;
            if(window.lucide) window.lucide.createIcons();
        }
        document.getElementById('ql-open-btn').onclick = () => {
            ipcRenderer.invoke('app:open-path', pathStr);
            quickLook.classList.remove('active');
        };
    }
    
    quickLook.addEventListener('click', (e) => { if (e.target === quickLook) quickLook.classList.remove('active'); });

    // --- IPC LISTENERS ---
    const onCtxOpen = (e, p) => {
        const file = filesCache.find(f => f.path === p);
        if (file && file.isDirectory) loadDirectory(p); else ipcRenderer.invoke('app:open-path', p);
    };
    const onCtxDelete = async (e, p) => {
        if (confirm('Move to Trash?')) { await ipcRenderer.invoke('finder:delete', p); loadDirectory(currentPath); }
    };
    const onCtxNewFolder = async () => {
        const name = prompt("Folder Name:", "Untitled Folder");
        if (name) { await ipcRenderer.invoke('finder:create-folder', path.join(currentPath, name)); loadDirectory(currentPath); }
    };
    const onCtxRename = async (e, p) => {
        const oldName = path.basename(p);
        const newName = prompt("Rename to:", oldName);
        if (newName && newName !== oldName) {
            await ipcRenderer.invoke('finder:rename', p, path.join(path.dirname(p), newName));
            loadDirectory(currentPath);
        }
    };

    ipcRenderer.on('finder:ctx-open', onCtxOpen);
    ipcRenderer.on('finder:ctx-delete', onCtxDelete);
    ipcRenderer.on('finder:ctx-new-folder', onCtxNewFolder);
    ipcRenderer.on('finder:ctx-rename', onCtxRename);

    // --- UI BINDINGS ---
    container.querySelector('#btn-up').onclick = () => {
        const parent = path.dirname(currentPath);
        if (parent !== currentPath) {
            history = history.slice(0, historyIndex + 1);
            history.push(parent);
            historyIndex++;
            loadDirectory(parent);
        }
    };
    container.querySelector('#btn-back').onclick = () => { if (historyIndex > 0) loadDirectory(history[--historyIndex]); };
    container.querySelector('#btn-fwd').onclick = () => { if (historyIndex < history.length - 1) loadDirectory(history[++historyIndex]); };
    
    const btnGrid = container.querySelector('#mode-grid');
    const btnList = container.querySelector('#mode-list');
    
    btnGrid.onclick = () => { 
        viewMode = 'grid'; 
        btnGrid.classList.add('active');
        btnList.classList.remove('active');
        loadDirectory(currentPath); 
    };
    btnList.onclick = () => { 
        viewMode = 'list'; 
        btnList.classList.add('active');
        btnGrid.classList.remove('active');
        loadDirectory(currentPath); 
    };

    container.querySelector('#nav-home').onclick = async () => loadDirectory(await ipcRenderer.invoke('app:get-home-path'));
    container.querySelector('#nav-root').onclick = () => loadDirectory('/');
    
    const termBtn = container.querySelector('#btn-toggle-term');
    const termCloseBtn = container.querySelector('#btn-term-close');
    const termClearBtn = container.querySelector('#btn-term-clear');
    
    const toggleTerm = () => {
        isTerminalVisible = !isTerminalVisible;
        termWrapper.style.display = isTerminalVisible ? 'flex' : 'none';
        termBtn.classList.toggle('active', isTerminalVisible);
        if (isTerminalVisible && fitAddon) {
            requestAnimationFrame(() => {
                fitAddon.fit();
                ipcRenderer.send('terminal-resize', termId, { cols: term.cols, rows: term.rows });
            });
        }
    };
    
    termBtn.onclick = toggleTerm;
    termCloseBtn.onclick = toggleTerm;
    termClearBtn.onclick = () => { if(term) term.clear(); };

    container.querySelector('#dot-landing-f').onclick = () => window.showLandingPage();
    container.querySelector('#dot-dashboard-f').onclick = () => window.showDashboardPage();

    function updateNavButtons() {
        container.querySelector('#btn-back').disabled = historyIndex <= 0;
        container.querySelector('#btn-fwd').disabled = historyIndex >= history.length - 1;
    }

    function renderBreadcrumbs() {
        const breadcrumbs = container.querySelector('#finder-breadcrumbs');
        const parts = currentPath.split(path.sep).filter(Boolean);
        const displayParts = parts.slice(-3);
        breadcrumbs.innerHTML = displayParts.map((p, i, arr) => 
            `<span class="path-segment ${i===arr.length-1?'current':''}">${p}</span>`
        ).join('<i data-lucide="chevron-right" class="path-arrow"></i>');
        if(window.lucide) window.lucide.createIcons();
    }

    async function renderSidebar() {
        const home = await ipcRenderer.invoke('app:get-home-path');
        const favs = [ { name: 'Desktop', icon: 'monitor' }, { name: 'Documents', icon: 'files' }, { name: 'Downloads', icon: 'download' }, { name: 'Pictures', icon: 'image' } ];
        container.querySelector('#finder-favorites').innerHTML = favs.map(f => `
            <div class="sidebar-item" data-link="${path.join(home, f.name)}">
                <i data-lucide="${f.icon}"></i> ${f.name}
            </div>
        `).join('');
        container.querySelectorAll('.sidebar-item').forEach(el => {
            if(el.dataset.link) el.onclick = () => loadDirectory(el.dataset.link);
        });
        if(window.lucide) window.lucide.createIcons();
    }

    return () => {
        ipcRenderer.removeListener('finder:ctx-open', onCtxOpen);
        ipcRenderer.removeListener('finder:ctx-delete', onCtxDelete);
        ipcRenderer.removeListener('finder:ctx-new-folder', onCtxNewFolder);
        ipcRenderer.removeListener('finder:ctx-rename', onCtxRename);
        if (container.termCleanup) container.termCleanup();
    };
}

// ... (Keep getFileIcon and formatBytes helpers unchanged) ...
function getFileIcon(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['jpg','png','gif','svg','webp'].includes(ext)) return 'image';
    if (['js','html','css','json','py','md'].includes(ext)) return 'code';
    return 'file';
}
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = { renderFinderHTML, attachFinderListeners };