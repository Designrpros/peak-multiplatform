// src/components/ProjectView/sidebar.js v2.0 - DEBUG LINT HIGHLIGHTING
const path = require('path');
const { ipcRenderer } = require('electron');

const { initializeAssetCache, getFileIconHTML, getFolderIconHTML, setIconTheme } = require('./icons.js');

// --- ICON THEME STATE ---
let activeIconTheme = null;

// Initialize icon theme
(async () => {
    try {
        const theme = await ipcRenderer.invoke('extensions:get-icon-theme', 'material-icon-theme');
        if (theme) {
            console.log('[Sidebar] Loaded icon theme:', theme);
            activeIconTheme = theme;
            setIconTheme(theme);
        }
    } catch (err) {
        console.error('[Sidebar] Failed to load icon theme:', err);
    }
})();

ipcRenderer.on('extensions:ready', async () => {
    console.log('[Sidebar] Extensions ready, reloading icon theme...');
    try {
        const theme = await ipcRenderer.invoke('extensions:get-icon-theme', 'material-icon-theme');
        if (theme) {
            console.log('[Sidebar] Loaded icon theme:', theme);
            activeIconTheme = theme;
            setIconTheme(theme);
            // Force refresh if we have a current sidebar instance?
            // Since this is a module-level variable, we can't easily reach into specific instances.
            // But next render will use it.
        }
    } catch (err) {
        console.error('[Sidebar] Failed to load icon theme:', err);
    }
});

ipcRenderer.on('extensions:disabled', (event, extensionId) => {
    if (extensionId === 'PKief.material-icon-theme') {
        console.log('[Sidebar] Icon theme disabled, reverting to default.');
        activeIconTheme = null;
        setIconTheme(null);
        // Trigger re-render if needed (usually handled by parent or user interaction)
        // But we can dispatch an event or force update if we had access to the instance.
        // For now, next render will pick it up.
        // We can try to find the active sidebar and re-render if possible.
        const sidebar = document.querySelector('.project-sidebar-content');
        if (sidebar && sidebar.dataset.rootPath) {
            // We need to trigger a re-render. 
            // The parent component (ProjectView/index.js) manages this.
            // We can dispatch a custom event on window.
            window.dispatchEvent(new CustomEvent('peak-icon-theme-changed'));
        }
    }
});

// --- STATE ---
let currentFilePath = null;
let activeRootPath = null; // Store root path for error propagation logic
// We keep track of what the user manually opened so we can restore it when search is cleared
let manualExpandedFolders = new Set();
let draggedItemPath = null;

// This holds the "currently visible" expansions (either manual OR search results)
let activeExpandedFolders = new Set();

// Search mode: 'file' or 'content'
let searchMode = 'file';
let contentSearchResults = []; // Array of {filePath, matches: [{line, col, text}]}

async function renderSidebarHTML(sidebarContainer, projectData, filter = '') {
    setSidebarLoading(true);
    try {
        await initializeAssetCache();
        if (!projectData || !projectData.path) {
            sidebarContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--peak-secondary); font-size:13px;">No Project Open</div>`;
            return;
        }

        sidebarContainer.dataset.rootPath = projectData.path;
        activeRootPath = projectData.path;
        recalculateFolderErrors(); // Ensure folder errors are up to date

        // --- FILTER LOGIC ---
        const isFiltering = filter && filter.trim().length > 0;

        if (isFiltering) {
            if (searchMode === 'content') {
                // Content Search Mode
                activeExpandedFolders = new Set();
                try {
                    const result = await ipcRenderer.invoke('project:search-content', projectData.path, filter.trim());
                    contentSearchResults = result || [];

                    if (contentSearchResults.length === 0) {
                        sidebarContainer.innerHTML = `<div style="padding:12px; font-size:12px; color:var(--peak-secondary); text-align:center;">No matches found</div>`;
                        return;
                    }

                    // Render content search results
                    const resultsHTML = renderContentSearchResults(contentSearchResults, filter.trim());
                    sidebarContainer.innerHTML = resultsHTML;
                    if (window.lucide) window.lucide.createIcons();
                    return;
                } catch (err) {
                    console.error('[Sidebar] Content search error:', err);
                    sidebarContainer.innerHTML = `<div style="padding:12px; font-size:12px; color:var(--christmas-red);">Search error: ${err.message}</div>`;
                    return;
                }
            } else {
                // File Search Mode (existing logic)
                activeExpandedFolders = new Set();
                const result = await ipcRenderer.invoke('project:search', projectData.path, filter.trim());
                if (result && result.expanded) {
                    result.expanded.forEach(p => activeExpandedFolders.add(p));
                }
            }
        } else {
            // Normal Mode: Restore user's manual expansions
            activeExpandedFolders = new Set(manualExpandedFolders);
            contentSearchResults = [];
        }

        const files = await ipcRenderer.invoke('project:read-dir', projectData.path);

        // Inject Styles for Sidebar
        const styleId = 'sidebar-dynamic-styles';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.textContent = `
                .tree-item.has-error .item-name { color: var(--christmas-red, #ff4444) !important; }
                .tree-item.has-error .main-icon { color: var(--christmas-red, #ff4444) !important; }
                .error-dot {
                    height: 6px; width: 6px; 
                    background-color: var(--christmas-red); 
                    border-radius: 50%; 
                    display: inline-block;
                    margin-left: auto;
                }
                .content-search-result {
                    padding: 8px 12px;
                    border-bottom: 1px solid var(--border-color);
                    cursor: pointer;
                    transition: background 0.15s;
                }
                .content-search-result:hover {
                    background: var(--control-background-color);
                }
                .content-search-file {
                    font-weight: 600;
                    font-size: 12px;
                    color: var(--peak-primary);
                    margin-bottom: 4px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .content-search-match {
                    font-size: 11px;
                    color: var(--peak-secondary);
                    padding: 2px 0;
                    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
                }
                .content-search-line-num {
                    color: var(--peak-accent);
                    margin-right: 8px;
                }
                .content-search-highlight {
                    background: rgba(255, 215, 0, 0.3);
                    color: var(--peak-primary);
                    font-weight: 600;
                }
            `;
            document.head.appendChild(style);
        }

        if (files && !files.error) {
            // Pass 'isFiltering' to recursive render to enforcing strict hiding
            const treeHTML = renderTreeRecursive(files, 0, filter, isFiltering);
            sidebarContainer.innerHTML = treeHTML || (isFiltering ? `<div style="padding:12px; font-size:12px; color:var(--peak-secondary); text-align:center;">No matches found</div>` : `<ul class="file-tree" style="padding:0; margin:0;"></ul>`);

            // Recursive load for expanded items
            await loadExpandedFoldersRec(files, sidebarContainer, filter, isFiltering);

            if (window.lucide) window.lucide.createIcons();

            // Auto-lint visible files in the sidebar
            setTimeout(() => {
                autoLintVisibleFiles(sidebarContainer);
            }, 100);

            // START WATCHING
            ipcRenderer.send('project:watch', projectData.path);
        } else {
            sidebarContainer.innerHTML = `<p style="padding:12px; color:red;">Error reading directory.</p>`;
        }
    } catch (err) {
        sidebarContainer.innerHTML = `<p style="padding:12px; color:red;">${err.message}</p>`;
    } finally {
        setSidebarLoading(false);
    }
}


// --- FILE WATCHING & ERROR STATE ---
let fileErrors = new Map(); // path -> 'error' | 'warning'
let folderErrors = new Map(); // path -> 'error' | 'warning'

// Listen for file changes from Main Process
ipcRenderer.on('project:files-changed', async (event, { eventType, filename }) => {
    // We need to determine where this file is and update the UI accordingly.
    // Since we don't have the full path in the event (just filename relative to watch root usually, or absolute depending on OS),
    // we might need to be careful.
    // Actually, fs.watch often gives just the filename.
    // However, for a robust tree update, re-fetching the parent folder is safest and easiest for now.

    // NOTE: 'filename' from fs.watch is not always reliable or full path.
    // If we want true "instant" updates without full re-render, we'd need a better watcher (chokidar) in main.
    // But let's try to be smart. If we just reload the whole tree, it might be jarring.
    // Let's try to reload just the active folders.

    // For now, to ensure correctness, let's re-fetch the visible structure.
    // We can optimize this later if it's too heavy.
    const container = document.querySelector('.file-tree-container');
    if (container && container.dataset.rootPath) {
        // Debounce slightly to avoid flickering on mass updates
        if (window._sidebarUpdateTimeout) clearTimeout(window._sidebarUpdateTimeout);
        window._sidebarUpdateTimeout = setTimeout(() => {
            // Re-render but keep state
            const rootPath = container.dataset.rootPath;
            // We need to pass the current projectData. We can store it or re-construct it.
            // Ideally renderSidebarHTML should be idempotent-ish regarding state.
            // But calling it again might reset scroll.

            // Better approach: Just re-read the expanded folders.
            refreshVisibleFolders(container);
        }, 300);
    }
});

// Listen for Console/Terminal Errors
window.addEventListener('peak-console-error', (e) => {
    const { filePath } = e.detail;
    console.log('[Sidebar] peak-console-error event received:', e.detail);
    if (!filePath) return;

    // Resolve path if relative
    let fullPath = filePath;
    const container = document.querySelector('.file-tree-container');
    if (container && container.dataset.rootPath && !path.isAbsolute(filePath)) {
        fullPath = path.join(container.dataset.rootPath, filePath);
    }

    console.log(`[Sidebar] Processing console error for: ${fullPath}`);

    // Mark error
    fileErrors.set(fullPath, true);
    updateItemErrorState(fullPath, true);
});

// Listen for Lint Results (from Main Process)
ipcRenderer.on('project:lint-results', (event, { filePath, errors }) => {
    // console.log(`[Sidebar] Received lint results for: ${filePath}`, errors);

    // Log each error's severity
    if (errors && errors.length > 0) {
        errors.forEach((err, idx) => {
            // console.log(`[Sidebar] Error ${idx}: severity="${err.severity}", message="${err.message}"`);
        });
    }

    const hasError = errors && errors.length > 0 && errors.some(e => e.severity === 'error');
    // console.log(`[Sidebar] hasError calculated as: ${hasError}`);

    if (hasError) {
        fileErrors.set(filePath, true);
    } else {
        fileErrors.delete(filePath);
    }

    updateItemErrorState(filePath, hasError);
});

async function refreshVisibleFolders(container) {
    const rootPath = container.dataset.rootPath;
    if (!rootPath) return;

    setSidebarLoading(true);
    try {
        // 1. Refresh Root
        const files = await ipcRenderer.invoke('project:read-dir', rootPath);
        if (!files || files.error) return;

        const rootUl = container.querySelector('ul.file-tree');
        if (!rootUl) {
            // Fallback to full render if no root UL exists
            const scrollTop = container.scrollTop;
            await renderSidebarHTML(container, { path: rootPath }, '');
            container.scrollTop = scrollTop;
            return;
        }

        // 2. Reconcile the tree
        await reconcileFileTree(rootUl, files, 0, '');
    } finally {
        setSidebarLoading(false);
    }
}

async function reconcileFileTree(ulElement, items, depth, filter) {
    if (!ulElement) return;

    // Filter items same as renderTreeRecursive
    const lowerFilter = filter ? filter.toLowerCase() : '';
    const isFiltering = filter && filter.length > 0;

    const visibleItems = items.filter(item => {
        if (!isFiltering) return true;
        if (item.name.toLowerCase().includes(lowerFilter)) return true;
        if (item.isDirectory && activeExpandedFolders.has(item.path)) return true;
        return false;
    });

    const currentChildren = Array.from(ulElement.children).filter(el => el.tagName === 'LI');

    // Map of current children by path for easy lookup (handling reorders/moves)
    const currentMap = new Map();
    currentChildren.forEach(el => currentMap.set(el.dataset.path, el));

    // We will build a new list of elements to append/insert
    // But modifying DOM in place is better to preserve state.

    // Strategy: Iterate through visibleItems and ensure the DOM at index i matches.

    let domIndex = 0;

    for (const item of visibleItems) {
        let existingEl = currentMap.get(item.path);

        if (existingEl) {
            // Item exists. 
            // 1. Check if it's at the right position.
            const currentElAtIndex = ulElement.children[domIndex];
            if (currentElAtIndex !== existingEl) {
                // Move it here
                ulElement.insertBefore(existingEl, currentElAtIndex);
            }

            // 2. Update its content/state
            updateItemDOM(existingEl, item, depth);

            // 3. Handle Children (if directory and expanded)
            if (item.isDirectory) {
                const safeId = 'tree-' + item.path.replace(/[^a-zA-Z0-9]/g, '_');
                let childrenDiv = ulElement.querySelector(`#children-${safeId}`);

                // Ensure children div exists if expanded
                if (activeExpandedFolders.has(item.path)) {
                    if (!childrenDiv) {
                        // Create it
                        childrenDiv = document.createElement('div');
                        childrenDiv.id = `children-${safeId}`;
                        childrenDiv.className = 'children-container';
                        childrenDiv.style.display = 'block';
                        // Insert after the LI
                        ulElement.insertBefore(childrenDiv, existingEl.nextSibling);
                    } else {
                        childrenDiv.style.display = 'block';
                        // Move it to after existingEl if needed (in case of reorder)
                        if (existingEl.nextSibling !== childrenDiv) {
                            ulElement.insertBefore(childrenDiv, existingEl.nextSibling);
                        }
                    }

                    // Recurse
                    const subFiles = await window.ipcRenderer.invoke('project:read-dir', item.path);
                    if (subFiles && !subFiles.error) {
                        let subUl = childrenDiv.querySelector('ul.file-tree');
                        if (!subUl) {
                            subUl = document.createElement('ul');
                            subUl.className = 'file-tree nested';
                            subUl.style.padding = '0';
                            subUl.style.margin = '0';
                            childrenDiv.appendChild(subUl);
                        }
                        await reconcileFileTree(subUl, subFiles, depth + 1, filter);
                    }
                } else {
                    // Not expanded
                    if (childrenDiv) childrenDiv.style.display = 'none';
                }
            }

            // Increment index. Note: If we have a childrenDiv, it's NOT a child of UL in the same way as LI?
            // Wait, in renderTreeRecursive, the structure is:
            // <ul>
            //   <li>...</li>
            //   <div id="children-...">...</div>  <-- This is WRONG in my mental model or the code?
            // Let's check renderItemHTML.
            // It returns `<li>...</li>` AND THEN `if (isDirectory) html += <div...>`
            // So the <div> IS a sibling of the <li>, and both are children of the <ul>?
            // Let's check renderTreeRecursive:
            // return `<ul...> ${visibleItems.map(...).join('')} </ul>`
            // renderItemHTML returns a string that contains BOTH the LI and the DIV.
            // So yes, they are siblings in the UL.

            domIndex++; // For the LI
            if (item.isDirectory) {
                // The children div is also a child of the UL
                domIndex++;
            }

        } else {
            // New Item
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = renderItemHTML(item, depth);

            // renderItemHTML returns LI + optional DIV.
            while (tempDiv.firstChild) {
                ulElement.insertBefore(tempDiv.firstChild, ulElement.children[domIndex]);
                domIndex++;
            }

            // If it's a directory and expanded, we need to load its content immediately
            if (item.isDirectory && activeExpandedFolders.has(item.path)) {
                // The div we just inserted is empty. We need to load content.
                // We can call loadFolderContent, but that uses innerHTML.
                // Better to recurse reconcile.
                const safeId = 'tree-' + item.path.replace(/[^a-zA-Z0-9]/g, '_');
                const childrenDiv = ulElement.querySelector(`#children-${safeId}`);
                if (childrenDiv) {
                    const subFiles = await window.ipcRenderer.invoke('project:read-dir', item.path);
                    if (subFiles && !subFiles.error) {
                        childrenDiv.innerHTML = renderTreeRecursive(subFiles, depth + 1, filter, isFiltering);
                        // We also need to recurse for ITS children
                        await loadExpandedFoldersRec(subFiles, ulElement.closest('.file-tree-container'), filter, isFiltering);
                    }
                }
            }
        }
    }

    // Remove excess children
    // Any child at domIndex or greater is extra (was not matched/inserted)
    while (ulElement.children.length > domIndex) {
        ulElement.removeChild(ulElement.lastChild);
    }

    if (window.lucide) window.lucide.createIcons();
}

function updateItemDOM(li, item, depth) {
    // Update basic attributes
    const isDirectory = item.isDirectory;
    const isExpanded = isDirectory && activeExpandedFolders.has(item.path);
    const isSelected = item.path === currentFilePath;
    const hasError = !isDirectory && fileErrors.has(item.path);
    const folderHasError = isDirectory && folderErrors.has(item.path);

    // Classes
    li.classList.toggle('selected', isSelected);
    li.classList.toggle('has-error', !!(hasError || folderHasError));
    li.classList.toggle('directory-item', isDirectory);
    li.classList.toggle('file-item', !isDirectory);

    // Icon
    const iconContainer = li.querySelector('.icon-container');
    if (iconContainer) {
        const newIconHTML = isDirectory ? getFolderIconHTML(isExpanded, item.name) : getFileIconHTML(item.name);
        // Only update if changed (simple string check might be enough, or just update)
        if (iconContainer.innerHTML !== newIconHTML) {
            iconContainer.innerHTML = newIconHTML;
        }
    }

    // Chevron
    if (isDirectory) {
        const chevron = li.querySelector('.chevron-icon');
        if (chevron) {
            const newChevron = isExpanded ? 'chevron-down' : 'chevron-right';
            if (chevron.getAttribute('data-lucide') !== newChevron) {
                chevron.setAttribute('data-lucide', newChevron);
            }
        }
    }

    // Name Color
    const nameSpan = li.querySelector('.item-name');
    if (nameSpan) {
        if (hasError || folderHasError) {
            nameSpan.style.setProperty('color', 'var(--christmas-red, #ff4444)', 'important');
        } else {
            nameSpan.style.color = '';
        }
    }
}


function renderTreeRecursive(items, depth, filter, isFiltering) {
    if (!items || items.length === 0) return '';
    const lowerFilter = filter.toLowerCase();

    const visibleItems = items.filter(item => {
        if (!isFiltering) return true; // Show all in normal mode (hierarchy handled by expansion)

        // In Search Mode:
        // 1. Match Name
        if (item.name.toLowerCase().includes(lowerFilter)) return true;
        // 2. OR Is a directory that contains matches (indicated by activeExpandedFolders)
        if (item.isDirectory && activeExpandedFolders.has(item.path)) return true;

        return false;
    });

    if (visibleItems.length === 0) return '';

    return `<ul class="file-tree ${depth > 0 ? 'nested' : ''}" style="padding:0; margin:0;">
        ${visibleItems.map(item => renderItemHTML(item, depth)).join('')}
    </ul>`;
}

function renderItemHTML(item, depth) {
    const isDirectory = item.isDirectory;
    const isExpanded = isDirectory && activeExpandedFolders.has(item.path);
    const isSelected = item.path === currentFilePath;
    const hasError = !isDirectory && fileErrors.has(item.path); // Check error state
    const folderHasError = isDirectory && folderErrors.has(item.path); // Check folder error state

    if (hasError || folderHasError) {
        // console.log(`[Sidebar] Rendering item with error: ${item.path}, hasError: ${hasError}, folderHasError: ${folderHasError}`);
    }

    const safeId = 'tree-' + item.path.replace(/[^a-zA-Z0-9]/g, '_');
    // Indentation: 10px base + 12px per level
    const indent = 10 + (depth * 12);
    const iconHTML = isDirectory ? getFolderIconHTML(isExpanded, item.name) : getFileIconHTML(item.name);
    const chevron = isDirectory ? (isExpanded ? 'chevron-down' : 'chevron-right') : '';

    // Generate tree guide lines for parent hierarchy
    let guideLinesHTML = '';
    for (let i = 0; i < depth; i++) {
        const lineLeft = 10 + (i * 12) + 6; // Center of each indentation level
        guideLinesHTML += `<div class="tree-guide-line" style="position:absolute; left:${lineLeft}px; top:0; bottom:0; width:1px; background:rgba(128,128,128,0.2);"></div>`;
    }

    let html = `
        <li class="tree-item ${isDirectory ? 'directory-item' : 'file-item'} ${isSelected ? 'selected' : ''} ${hasError || folderHasError ? 'has-error' : ''}"
            id="${safeId}"
            data-path="${item.path}" 
            data-is-directory="${isDirectory}"
            data-depth="${depth}"
            draggable="true"
            style="padding-left: ${indent}px; position:relative;">
            ${guideLinesHTML}
            ${isDirectory ? `
            <div class="chevron-container" style="width:16px; display:flex; align-items:center; justify-content:center; margin-right:2px;">
                <i data-lucide="${chevron}" class="chevron-icon" style="width:12px; height:12px;"></i>
            </div>` : ''}
            <div class="icon-container" style="margin-right: 6px; display:flex; align-items:center;">
                ${iconHTML}
            </div>
            <span class="item-name" style="${hasError || folderHasError ? 'color:var(--christmas-red, #ff4444);' : ''}">${item.name}</span>
        </li>
    `;

    // Always render children div if directory, visibility controlled by style
    if (isDirectory) {
        const display = isExpanded ? 'block' : 'none';
        html += `<div id="children-${safeId}" class="children-container" style="display:${display};"></div>`;
    }
    return html;
}

async function loadExpandedFoldersRec(files, container, filter, isFiltering) {
    for (const item of files) {
        if (item.isDirectory && activeExpandedFolders.has(item.path)) {
            await loadFolderContent(item.path, container, filter, isFiltering);
        }
    }
}

async function loadFolderContent(folderPath, rootContainer, filter, isFiltering) {
    const safeId = 'tree-' + folderPath.replace(/[^a-zA-Z0-9]/g, '_');
    const childrenDiv = rootContainer.querySelector(`#children-${safeId}`);
    if (!childrenDiv) return;

    const subFiles = await window.ipcRenderer.invoke('project:read-dir', folderPath);
    if (subFiles && !subFiles.error) {
        const parentLi = rootContainer.querySelector(`#${safeId}`);
        let nextDepth = 0;
        if (parentLi && parentLi.dataset.depth) {
            nextDepth = parseInt(parentLi.dataset.depth) + 1;
        }

        childrenDiv.innerHTML = renderTreeRecursive(subFiles, nextDepth, filter, isFiltering);
        if (window.lucide) window.lucide.createIcons();
        await loadExpandedFoldersRec(subFiles, rootContainer, filter, isFiltering);
    }
}

// ... safeIpcInvoke, createNew, rename, handleFileClick ...
// (These are unchanged logic-wise, mostly UI helpers)

async function safeIpcInvoke(action, ...args) {
    let result = await ipcRenderer.invoke(action, ...args, false);
    if (result && result.error === 'ERR_IS_DIRECTORY') {
        alert("Cannot overwrite a directory with a file.");
        return { cancelled: true };
    }
    if (result && result.error === 'ERR_IS_FILE') {
        alert("Cannot overwrite a file with a directory.");
        return { cancelled: true };
    }
    if (result && result.error === 'ERR_EXISTS') {
        const shouldOverwrite = confirm("An item with this name already exists. Do you want to overwrite it?");
        if (shouldOverwrite) { result = await ipcRenderer.invoke(action, ...args, true); }
        else { return { cancelled: true }; }
    }

    if (result && result.error) {
        if (result.error.includes('EISDIR')) return { cancelled: true };
        alert(`Operation failed: ${result.error}`);
        return { error: result.error };
    }
    return result;
}

// --- FILE CREATION ---
async function createNewFileSystemItem(isFolder, targetPath, refreshCallback, container) {
    const rootPath = container.dataset.rootPath;
    if (!rootPath) return;
    let parentPath = targetPath || rootPath;
    const targetItem = container.querySelector(`.tree-item[data-path="${CSS.escape(targetPath)}"]`);
    if (targetItem && targetItem.dataset.isDirectory !== 'true') parentPath = path.dirname(targetPath);

    let parentUl;
    let depth = 0;

    if (parentPath === rootPath) {
        parentUl = container.querySelector('ul.file-tree');
        if (!parentUl) { container.innerHTML = `<ul class="file-tree" style="padding:0;margin:0;"></ul>`; parentUl = container.querySelector('ul.file-tree'); }
    } else {
        if (!activeExpandedFolders.has(parentPath)) {
            // If we create inside a collapsed folder, expand it
            manualExpandedFolders.add(parentPath);
            activeExpandedFolders.add(parentPath);

            const safeId = 'tree-' + parentPath.replace(/[^a-zA-Z0-9]/g, '_');
            const li = container.querySelector(`#${safeId}`);
            if (li) { const chev = li.querySelector('.chevron-icon'); if (chev) chev.setAttribute('data-lucide', 'chevron-down'); }
        }
        await loadFolderContent(parentPath, container, '', false);

        const safeId = 'tree-' + parentPath.replace(/[^a-zA-Z0-9]/g, '_');
        const childrenDiv = container.querySelector(`#children-${safeId}`);
        if (childrenDiv) {
            childrenDiv.style.display = 'block';
            parentUl = childrenDiv.querySelector('ul');
            if (!parentUl) { parentUl = document.createElement('ul'); parentUl.className = 'file-tree nested'; parentUl.style.cssText = "padding:0; margin:0;"; childrenDiv.appendChild(parentUl); }
            const parentLi = container.querySelector(`#${safeId}`);
            if (parentLi) depth = parseInt(parentLi.dataset.depth) + 1;
        }
    }

    if (!parentUl) return;

    const li = document.createElement('li');
    li.className = 'tree-item creation-mode';
    li.style.paddingLeft = `${12 + (depth * 12)}px`;
    li.style.display = 'flex'; li.style.alignItems = 'center';
    li.innerHTML = `<div style="width:16px; margin-right:2px;"></div><div style="margin-right:6px; display:flex; align-items:center;"><i data-lucide="${isFolder ? 'folder' : 'file'}" style="width:14px; height:14px; color:var(--peak-secondary);"></i></div><input type="text" class="inline-creation-input" placeholder="Name..." style="flex:1; min-width:0; border:1px solid var(--peak-accent); border-radius:2px; padding:2px 4px; font-size:13px; outline:none; background:var(--control-background-color); color:var(--peak-primary);">`;
    if (parentUl.firstChild) parentUl.insertBefore(li, parentUl.firstChild); else parentUl.appendChild(li);
    if (window.lucide) window.lucide.createIcons();

    const input = li.querySelector('input');
    input.focus();
    li.scrollIntoView({ behavior: 'auto', block: 'nearest' });

    let isFinalizing = false;
    const finalize = async () => {
        if (isFinalizing) return;
        isFinalizing = true;
        const name = input.value.trim();
        li.remove();
        if (name) {
            const fullPath = path.join(parentPath, name);
            const action = isFolder ? 'project:create-dir' : 'project:create-file';
            const res = await safeIpcInvoke(action, fullPath);
            // if (res.success && typeof refreshCallback === 'function') refreshCallback(); 
            // NOTE: We don't need manual refreshCallback anymore if watcher works!
            // But let's keep it for safety or if watcher is slow.
            if (res.success && typeof refreshCallback === 'function') refreshCallback();
        }
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finalize(); if (e.key === 'Escape') { isFinalizing = true; li.remove(); } });
    input.addEventListener('blur', () => setTimeout(finalize, 150));
}

function renameFileSystemItem(targetPath, spanElement, refreshCallback) {
    const oldName = spanElement.textContent;
    const input = document.createElement('input');
    input.type = 'text'; input.value = oldName;
    input.style.cssText = "flex:1; min-width:0; border:1px solid var(--peak-accent); border-radius:2px; padding:2px 4px; font-size:13px; outline:none; background:var(--control-background-color); color:var(--peak-primary); margin-left:6px;";
    spanElement.replaceWith(input); input.select();

    let isDone = false;
    const commit = async () => {
        if (isDone) return; isDone = true;
        const newName = input.value.trim();
        if (newName && newName !== oldName) {
            const newPath = path.join(path.dirname(targetPath), newName);
            const result = await safeIpcInvoke('project:move-file', targetPath, newPath);
            if (result.success && typeof refreshCallback === 'function') refreshCallback(); else input.replaceWith(spanElement);
        } else input.replaceWith(spanElement);
    };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { isDone = true; input.replaceWith(spanElement); } });
    input.addEventListener('blur', () => setTimeout(commit, 100));
}

async function handleFileClick(clickedItem, filePath, editorPane, titleBar) {
    const container = clickedItem.closest('.file-tree-container');
    container.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
    clickedItem.classList.add('selected');
    currentFilePath = filePath;
    if (titleBar) titleBar.textContent = clickedItem.querySelector('.item-name').textContent;
    editorPane.innerHTML = '<div class="project-editor-placeholder">Loading...</div>';
    editorPane.classList.remove('code-mirror-active');
    const content = await window.ipcRenderer.invoke('project:read-file', filePath);

    // Check for errors when opening
    checkFileForErrors(filePath, content);

    // Re-apply error styling if file has error (preserve after selection)
    const severity = fileErrors.get(filePath);
    if (severity) {
        const nameSpan = clickedItem.querySelector('.item-name');
        if (nameSpan) {
            if (severity === 'error') {
                nameSpan.style.setProperty('color', 'var(--christmas-red, #ff4444)', 'important');
            } else if (severity === 'warning') {
                nameSpan.style.setProperty('color', 'var(--warning-yellow, #ffa500)', 'important');
            }
        }
    }

    return typeof content === 'string' ? { content } : { error: true };
}

// Auto-lint all files recursively (including in collapsed folders)
async function autoLintVisibleFiles(container) {
    if (!container) return;

    const rootPath = container.dataset.rootPath;
    if (!rootPath) return;

    // console.log(`[Sidebar] Starting recursive auto-lint from: ${rootPath}`);

    // Recursively scan all files
    await recursiveLintFiles(rootPath);

    // console.log(`[Sidebar] Recursive auto-lint complete`);
}

async function recursiveLintFiles(dirPath, lintedCount = { value: 0 }) {
    const maxFiles = 100; // Limit total files to avoid performance issues

    if (lintedCount.value >= maxFiles) return;

    try {
        const items = await ipcRenderer.invoke('project:read-dir', dirPath);
        if (!items || items.error) return;

        for (const item of items) {
            if (lintedCount.value >= maxFiles) break;

            if (item.isDirectory) {
                // Skip build/generated directories - check if path contains these anywhere
                const excludedDirs = ['.next', 'node_modules', 'dist', 'build', '.git', 'coverage'];
                const shouldSkip = excludedDirs.some(dir => item.path.includes(`/${dir}/`) || item.path.endsWith(`/${dir}`));
                if (shouldSkip) {
                    // console.log(`[Sidebar] Skipping excluded directory: ${item.path}`);
                    continue;
                }
                // Recurse into subdirectories
                await recursiveLintFiles(item.path, lintedCount);
            } else {
                // Lint files - include TypeScript (parsing errors will be shown)
                const filePath = item.path;
                if (!/\.(js|jsx|ts|tsx)$/.test(filePath)) continue;

                try {
                    const content = await ipcRenderer.invoke('project:read-file', filePath);
                    if (typeof content === 'string') {
                        await checkFileForErrors(filePath, content);
                        lintedCount.value++;
                    }
                } catch (err) {
                    console.error(`[Sidebar] Failed to auto-lint ${filePath}:`, err);
                }
            }
        }
    } catch (err) {
        console.error(`[Sidebar] Failed to read directory ${dirPath}:`, err);
    }
}

// Check for errors (Linting)
async function checkFileForErrors(filePath, content) {
    if (!filePath || !content) return;
    // Check JS/JSX and TS/TSX files (TypeScript will show parsing errors)
    if (!/\.(js|jsx|ts|tsx)$/.test(filePath)) return;

    // console.log(`[Sidebar] Checking for errors: ${filePath}`);
    const errors = await ipcRenderer.invoke('project:lint-file', filePath, content);
    // console.log(`[Sidebar] Errors received:`, errors);

    const hasError = errors && errors.length > 0 && errors.some(e => e.severity === 'error');
    const hasWarning = errors && errors.length > 0 && errors.some(e => e.severity === 'warning');
    // console.log(`[Sidebar] Has error: ${hasError}, has warning: ${hasWarning}`);

    if (hasError) {
        fileErrors.set(filePath, 'error');
    } else if (hasWarning) {
        fileErrors.set(filePath, 'warning');
    } else {
        fileErrors.delete(filePath);
    }
    updateItemErrorState(filePath, hasError ? 'error' : hasWarning ? 'warning' : null);
}

function updateItemErrorState(filePath, severity) {
    const safeId = 'tree-' + filePath.replace(/[^a-zA-Z0-9]/g, '_');
    const item = document.querySelector(`#${safeId}`);
    // console.log(`[Sidebar] updateItemErrorState: ${filePath}, severity: ${severity}, found DOM item: ${!!item}`);

    if (item) {
        // Remove existing states
        item.classList.remove('has-error', 'has-warning');
        const nameSpan = item.querySelector('.item-name');

        if (severity === 'error') {
            item.classList.add('has-error');
            if (nameSpan) {
                nameSpan.style.setProperty('color', 'var(--christmas-red, #ff4444)', 'important');
            }
        } else if (severity === 'warning') {
            item.classList.add('has-warning');
            if (nameSpan) {
                nameSpan.style.setProperty('color', 'var(--warning-yellow, #ffa500)', 'important');
            }
        } else {
            if (nameSpan) nameSpan.style.color = '';
        }
    }

    // Propagate to parent folders
    updateFolderErrorState(filePath, severity);
}

function updateFolderErrorState(filePath, severity) {
    // Use activeRootPath if available, otherwise try to get from DOM
    let rootPath = activeRootPath;
    if (!rootPath) {
        const container = document.querySelector('.file-tree-container');
        if (container && container.dataset.rootPath) {
            rootPath = container.dataset.rootPath;
        }
    }

    // console.log(`[Sidebar] updateFolderErrorState: ${filePath}, severity: ${severity}, rootPath: ${rootPath}`);

    if (!rootPath) return;

    let currentDir = path.dirname(filePath);

    // Walk up the directory tree
    while (currentDir && currentDir !== rootPath && currentDir.length >= rootPath.length) {
        // Check if any files in this folder or subfolders have errors or warnings
        let folderSeverity = null;

        // Check all tracked file errors to see if any are in this folder
        for (const [errorFilePath, sev] of fileErrors.entries()) {
            if (sev && errorFilePath.startsWith(currentDir + path.sep)) {
                // Errors take precedence over warnings
                if (sev === 'error') {
                    folderSeverity = 'error';
                    break;
                } else if (sev === 'warning' && !folderSeverity) {
                    folderSeverity = 'warning';
                }
            }
        }

        // console.log(`[Sidebar] Checking folder: ${currentDir}, severity: ${folderSeverity}`);

        // Update folder error state
        const prevState = folderErrors.get(currentDir);
        if (folderSeverity) {
            folderErrors.set(currentDir, folderSeverity);
        } else {
            folderErrors.delete(currentDir);
        }

        // Update UI if state changed
        if (prevState !== folderSeverity) {
            // console.log(`[Sidebar] Folder error state changed for: ${currentDir}, new state: ${folderSeverity}`);
            const safeId = 'tree-' + currentDir.replace(/[^a-zA-Z0-9]/g, '_');
            const folderItem = document.querySelector(`#${safeId}`);
            if (folderItem) {
                // Remove existing states
                folderItem.classList.remove('has-error', 'has-warning');
                const nameSpan = folderItem.querySelector('.item-name');

                if (folderSeverity === 'error') {
                    folderItem.classList.add('has-error');
                    if (nameSpan) {
                        nameSpan.style.setProperty('color', 'var(--christmas-red, #ff4444)', 'important');
                    }
                } else if (folderSeverity === 'warning') {
                    folderItem.classList.add('has-warning');
                    if (nameSpan) {
                        nameSpan.style.setProperty('color', 'var(--warning-yellow, #ffa500)', 'important');
                    }
                } else {
                    if (nameSpan) nameSpan.style.color = '';
                }
            }
        }

        // Move up one level
        currentDir = path.dirname(currentDir);
    }
}

function recalculateFolderErrors() {
    folderErrors.clear();
    if (!activeRootPath) return;

    // Iterate all files with errors and mark their parents
    for (const [errorFilePath, hasErr] of fileErrors.entries()) {
        if (!hasErr) continue;

        let currentDir = path.dirname(errorFilePath);
        while (currentDir && currentDir !== activeRootPath && currentDir.length >= activeRootPath.length) {
            folderErrors.set(currentDir, true);
            currentDir = path.dirname(currentDir);
        }
    }
}

async function toggleFolderState(clickedItem, filePath, getFilter) {
    // NOTE: Toggling only affects manual state
    const isExpanded = manualExpandedFolders.has(filePath);
    if (isExpanded) manualExpandedFolders.delete(filePath);
    else manualExpandedFolders.add(filePath);

    // Update visual state immediately
    activeExpandedFolders = new Set(manualExpandedFolders);

    const safeId = 'tree-' + filePath.replace(/[^a-zA-Z0-9]/g, '_');
    const childrenDiv = clickedItem.closest('.file-tree-container').querySelector(`#children-${safeId}`);
    const chevron = clickedItem.querySelector('.chevron-icon');

    if (!isExpanded) {
        if (chevron) chevron.setAttribute('data-lucide', 'chevron-down');
        if (childrenDiv) {
            childrenDiv.style.display = 'block';
            // childrenDiv.innerHTML = `<div style="padding-left:20px; font-size:12px; color:var(--peak-secondary);">Loading...</div>`;
            setSidebarLoading(true);
            try {
                const filter = getFilter ? getFilter() : '';
                await loadFolderContent(filePath, clickedItem.closest('.file-tree-container'), filter, !!filter);

                // Auto-lint newly visible files
                setTimeout(() => {
                    const container = clickedItem.closest('.file-tree-container');
                    if (container) {
                        autoLintVisibleFiles(container);
                    }
                }, 100);
            } finally {
                setSidebarLoading(false);
            }
        }
    } else {
        if (chevron) chevron.setAttribute('data-lucide', 'chevron-right');
        if (childrenDiv) childrenDiv.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
}

function handleDragStart(e) {
    const item = e.target.closest('.tree-item');
    if (!item) return;

    const container = item.closest('.file-tree-container');
    let selectedItems = Array.from(container.querySelectorAll('.tree-item.selected'));

    // If dragging an item that is NOT selected, it becomes the only selection
    if (!item.classList.contains('selected')) {
        selectedItems.forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        selectedItems = [item];
    }

    const paths = selectedItems.map(el => el.dataset.path);
    draggedItemPath = item.dataset.path; // Primary drag item

    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItemPath); // Fallback
    e.dataTransfer.setData('peak/file-list', JSON.stringify(paths));

    selectedItems.forEach(el => el.style.opacity = '0.5');
}

function handleDragOver(e) { e.preventDefault(); const container = e.currentTarget; container.querySelectorAll('.tree-item.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder')); const targetItem = e.target.closest('.tree-item'); if (targetItem) { const isDirectory = targetItem.dataset.isDirectory === 'true'; if (isDirectory && targetItem.dataset.path !== draggedItemPath) targetItem.classList.add('drag-over-folder'); } }
function handleDragLeave(e) { const item = e.target.closest('.tree-item'); if (item) item.classList.remove('drag-over-folder'); }

async function handleDrop(e, refreshCallback) {
    e.preventDefault();
    const sidebarContainer = e.currentTarget;
    sidebarContainer.querySelectorAll('.tree-item').forEach(el => { el.style.opacity = '1'; el.classList.remove('drag-over-folder'); });

    const fileTree = sidebarContainer.querySelector('.file-tree-container');
    let targetFolderPath = fileTree ? fileTree.dataset.rootPath : null;
    const targetItem = e.target.closest('.tree-item');
    if (targetItem && targetItem.dataset.isDirectory === 'true') targetFolderPath = targetItem.dataset.path;

    if (!targetFolderPath) return;

    let hasChanges = false;

    // 1. Check for External Files (OS Drop)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];
            const sourcePath = file.path;
            if (!sourcePath) continue;

            const fileName = path.basename(sourcePath);
            const newPath = path.join(targetFolderPath, fileName);

            if (sourcePath !== newPath) {
                const res = await safeIpcInvoke('project:copy-file', sourcePath, newPath);
                if (res.success) hasChanges = true;
            }
        }
    }
    // 2. Check for Internal Multi-File Drag
    else {
        const fileListJson = e.dataTransfer.getData('peak/file-list');
        let pathsToMove = [];

        if (fileListJson) {
            try { pathsToMove = JSON.parse(fileListJson); } catch (e) { }
        }

        if (pathsToMove.length === 0) {
            const singlePath = e.dataTransfer.getData('text/plain');
            if (singlePath) pathsToMove.push(singlePath);
        }

        for (const sourcePath of pathsToMove) {
            if (sourcePath === targetFolderPath) continue; // Can't move folder into itself (simple check)

            const fileName = path.basename(sourcePath);
            const newPath = path.join(targetFolderPath, fileName);

            if (sourcePath !== newPath) {
                const res = await safeIpcInvoke('project:move-file', sourcePath, newPath);
                if (res.success) hasChanges = true;
            }
        }
    }

    if (hasChanges && typeof refreshCallback === 'function') refreshCallback();
}

async function setActiveFile(container, filePath) {
    if (!container || !filePath) return;
    currentFilePath = filePath;

    // 1. Try to find the item directly
    let safeId = 'tree-' + filePath.replace(/[^a-zA-Z0-9]/g, '_');
    let item = container.querySelector(`#${safeId}`);

    // 2. If not found, it might be in a collapsed folder. Ensure parents are expanded.
    if (!item) {
        let currentDir = path.dirname(filePath);
        const rootPath = container.dataset.rootPath;
        const dirsToExpand = [];

        // Walk up until we find a visible parent or hit root
        while (currentDir && currentDir !== rootPath && currentDir.length > rootPath.length) {
            if (!activeExpandedFolders.has(currentDir)) {
                dirsToExpand.unshift(currentDir); // Add to front (top-down)
            }
            currentDir = path.dirname(currentDir);
        }

        // Expand them one by one
        for (const dir of dirsToExpand) {
            manualExpandedFolders.add(dir);
            activeExpandedFolders.add(dir);

            // Update UI for this folder (chevron, children container)
            const dirSafeId = 'tree-' + dir.replace(/[^a-zA-Z0-9]/g, '_');
            const dirItem = container.querySelector(`#${dirSafeId}`);
            if (dirItem) {
                const chevron = dirItem.querySelector('.chevron-icon');
                if (chevron) chevron.setAttribute('data-lucide', 'chevron-down');

                // Load content if needed
                await loadFolderContent(dir, container, '', false);
            }
        }

        // Try finding item again after expansion
        item = container.querySelector(`#${safeId}`);
    }

    // 3. Update Selection State
    container.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));

    if (item) {
        item.classList.add('selected');
        // Scroll into view (center it)
        item.scrollIntoView({ behavior: 'auto', block: 'center' });
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderContentSearchResults(results, query) {
    if (!results || results.length === 0) {
        return `<div style="padding:12px; font-size:12px; color:var(--peak-secondary); text-align:center;">No matches found</div>`;
    }

    const container = document.querySelector('.file-tree-container');
    const rootPath = container ? container.dataset.rootPath : '';

    let html = `<div class="content-search-results" style="padding:4px 0;">`;
    html += `<div style="padding:8px 12px; font-size:11px; color:var(--peak-secondary); border-bottom:1px solid var(--border-color);">${results.length} file${results.length !== 1 ? 's' : ''} with matches</div>`;

    results.forEach(result => {
        const relativePath = rootPath ? path.relative(rootPath, result.filePath) : result.filePath;
        const fileName = path.basename(result.filePath);
        const dirPath = path.dirname(relativePath);

        html += `<div class="content-search-result" data-file-path="${result.filePath}">`;
        html += `<div class="content-search-file">`;
        html += `<i data-lucide="file-text" style="width:14px; height:14px;"></i>`;
        html += `<span>${fileName}</span>`;
        if (dirPath && dirPath !== '.') {
            html += `<span style="color:var(--peak-secondary); font-weight:400; font-size:11px;">${dirPath}</span>`;
        }
        html += `<span style="margin-left:auto; color:var(--peak-secondary); font-size:11px;">${result.matches.length}</span>`;
        html += `</div>`;

        // Show first 3 matches
        const matchesToShow = result.matches.slice(0, 3);
        matchesToShow.forEach(match => {
            const highlightedText = highlightMatch(match.text, query);
            html += `<div class="content-search-match" data-line="${match.line}">`;
            html += `<span class="content-search-line-num">${match.line}:</span>`;
            html += `<span>${highlightedText}</span>`;
            html += `</div>`;
        });

        if (result.matches.length > 3) {
            html += `<div style="padding:4px 0 4px 40px; font-size:10px; color:var(--peak-secondary);">+${result.matches.length - 3} more...</div>`;
        }

        html += `</div>`;
    });

    html += `</div>`;
    return html;
}

function highlightMatch(text, query) {
    // Escape HTML
    text = text.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Simple case-insensitive highlighting
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    return text.replace(regex, '<span class="content-search-highlight">$1</span>');
}

function setSearchMode(mode) {
    searchMode = mode;
}

function getSearchMode() {
    return searchMode;
}

function setSidebarLoading(isLoading) {
    const loader = document.querySelector('.sidebar-progress-container');
    if (loader) {
        if (isLoading) loader.classList.add('active');
        else loader.classList.remove('active');
    }
}

module.exports = {
    renderSidebarHTML,
    handleFileClick,
    toggleFolderState,
    createNewFileSystemItem,
    renameFileSystemItem,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    setActiveFile,
    setSearchMode,
    getSearchMode,
    setSidebarLoading
};