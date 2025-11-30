// src/components/ProjectView/sidebar.js
const path = require('path');
const { ipcRenderer } = require('electron');
const { initializeAssetCache, getFileIconHTML, getFolderIconHTML } = require('./icons.js');

// --- STATE ---
let currentFilePath = null;
// We keep track of what the user manually opened so we can restore it when search is cleared
let manualExpandedFolders = new Set();
let draggedItemPath = null;

// This holds the "currently visible" expansions (either manual OR search results)
let activeExpandedFolders = new Set();

async function renderSidebarHTML(sidebarContainer, projectData, filter = '') {
    try {
        await initializeAssetCache();
        if (!projectData || !projectData.path) {
            sidebarContainer.innerHTML = `<div style="padding:20px; text-align:center; color:var(--peak-secondary); font-size:13px;">No Project Open</div>`;
            return;
        }

        sidebarContainer.dataset.rootPath = projectData.path;

        // --- FILTER LOGIC ---
        const isFiltering = filter && filter.trim().length > 0;

        if (isFiltering) {
            // Search Mode: Reset active expansion to ONLY search results
            activeExpandedFolders = new Set();
            const result = await ipcRenderer.invoke('project:search', projectData.path, filter.trim());
            if (result && result.expanded) {
                result.expanded.forEach(p => activeExpandedFolders.add(p));
            }
        } else {
            // Normal Mode: Restore user's manual expansions
            activeExpandedFolders = new Set(manualExpandedFolders);
        }

        const files = await ipcRenderer.invoke('project:read-dir', projectData.path);

        if (files && !files.error) {
            // Pass 'isFiltering' to recursive render to enforcing strict hiding
            const treeHTML = renderTreeRecursive(files, 0, filter, isFiltering);
            sidebarContainer.innerHTML = treeHTML || (isFiltering ? `<div style="padding:12px; font-size:12px; color:var(--peak-secondary); text-align:center;">No matches found</div>` : `<ul class="file-tree" style="padding:0; margin:0;"></ul>`);

            // Recursive load for expanded items
            await loadExpandedFoldersRec(files, sidebarContainer, filter, isFiltering);

            if (window.lucide) window.lucide.createIcons();
        } else {
            sidebarContainer.innerHTML = `<p style="padding:12px; color:red;">Error reading directory.</p>`;
        }
    } catch (err) {
        sidebarContainer.innerHTML = `<p style="padding:12px; color:red;">${err.message}</p>`;
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
    const safeId = 'tree-' + item.path.replace(/[^a-zA-Z0-9]/g, '_');
    const indent = 12 + (depth * 12);
    const iconHTML = isDirectory ? getFolderIconHTML(isExpanded) : getFileIconHTML(item.name);
    const chevron = isDirectory ? (isExpanded ? 'chevron-down' : 'chevron-right') : '';

    let html = `
        <li class="tree-item ${isDirectory ? 'directory-item' : 'file-item'} ${isSelected ? 'selected' : ''}"
            id="${safeId}"
            data-path="${item.path}" 
            data-is-directory="${isDirectory}"
            data-depth="${depth}"
            draggable="true"
            style="padding-left: ${indent}px;">
            <div class="chevron-container" style="width:16px; display:flex; align-items:center; justify-content:center; margin-right:2px;">
                ${isDirectory ? `<i data-lucide="${chevron}" class="chevron-icon" style="width:12px; height:12px;"></i>` : ''}
            </div>
            <div class="icon-container" style="margin-right: 6px; display:flex; align-items:center;">
                ${iconHTML}
            </div>
            <span class="item-name">${item.name}</span>
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
    return typeof content === 'string' ? { content } : { error: true };
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
            childrenDiv.innerHTML = `<div style="padding-left:20px; font-size:12px; color:var(--peak-secondary);">Loading...</div>`;
            const filter = getFilter ? getFilter() : '';
            await loadFolderContent(filePath, clickedItem.closest('.file-tree-container'), filter, !!filter);
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
    setActiveFile
};