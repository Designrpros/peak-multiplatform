// src/components/ProjectView/sidebar.js
const IconModule = require('vscode-icons-js'); 
const path = require('path');
const { ipcRenderer } = require('electron');

const getIconFunction = (propName) => {
    const fn = IconModule[propName] || (IconModule.default && IconModule.default[propName]);
    return typeof fn === 'function' ? fn : () => null; 
};
const fileNameToIcon = getIconFunction('fileNameToIcon');
const color = getIconFunction('color');

const BASE_ASSET_PATH = 'assets/logos'; 
const LOGO_FILES = {
    'js': 'javascript.svg', 'ts': 'typescript.svg', 'css': 'css.svg',
    'html': 'html.svg', 'swift': 'swift.svg'
};

let currentFilePath = null; 
const expandedFolders = {}; 
const ASSET_CACHE = {}; 
let rootProjectPath = null; 
let draggedItemPath = null; 

async function initializeAssetCache() {
    for (const key in LOGO_FILES) {
        const file = LOGO_FILES[key];
        const relativePath = path.join(BASE_ASSET_PATH, file);
        const dataUrl = await ipcRenderer.invoke('project:read-asset-base64', relativePath);
        if (dataUrl) ASSET_CACHE[key] = dataUrl;
    }
}

// --- INLINE CREATION LOGIC ---
async function createNewFileSystemItem(isFolder, basePath, renderRefresh, rootContainer) {
    // rootContainer is the .file-tree-container div
    const container = rootContainer || document;
    
    // 1. Find the Root List
    let parentUl = container.querySelector('ul.file-tree'); 
    
    // Fix: If project is empty or error state, UL might be missing. Re-scaffold it.
    if (!parentUl) {
        // Check if container itself is the wrapper
        if (container.classList && container.classList.contains('file-tree-container')) {
             container.innerHTML = `<h3 class="file-tree-header">${path.basename(basePath)}</h3><ul class="file-tree"></ul>`;
             parentUl = container.querySelector('ul.file-tree');
        } else {
             // Fallback for global query
             const globalContainer = document.querySelector('.file-tree-container');
             if (globalContainer) {
                 globalContainer.innerHTML = `<h3 class="file-tree-header">${path.basename(basePath)}</h3><ul class="file-tree"></ul>`;
                 parentUl = globalContainer.querySelector('ul.file-tree');
             }
        }
    }

    if (!parentUl) {
        console.error("[ProjectView] Critical: Could not find or create parent list for file creation.");
        return;
    }

    let parentPath = basePath;
    let depth = 0;

    // 2. Determine Insertion Context based on Selection
    // Scope selection search to this container to avoid grabbing selection from other tabs
    const selectedItem = container.querySelector('.tree-item.selected');
    
    if (selectedItem) {
        const selectedPath = selectedItem.dataset.path;
        const isDirectory = selectedItem.dataset.isDirectory === 'true';

        if (isDirectory) {
            // Create INSIDE selected folder
            parentPath = selectedPath;
            
            // Ensure folder is open
            if (!expandedFolders[parentPath]) {
                await toggleFolderState(selectedItem, parentPath, () => '');
            }
            
            const safeId = parentPath.replace(/[^a-zA-Z0-9]/g, '_');
            // Look for the specific children container
            const childrenDiv = container.querySelector(`#children-${safeId}`) || document.getElementById(`children-${safeId}`);
            
            if (childrenDiv) {
                childrenDiv.style.display = 'block';
                let list = childrenDiv.querySelector('ul');
                
                if (!list) {
                    list = document.createElement('ul');
                    list.className = 'file-tree nested';
                    childrenDiv.innerHTML = ''; // Clear "Loading..." text if present
                    childrenDiv.appendChild(list);
                }
                parentUl = list;
                
                // Calculate depth for indentation
                const parentPadding = parseInt(selectedItem.style.paddingLeft || '8');
                depth = ((parentPadding - 8) / 12) + 1;
            }
        } else {
            // Create SIBLING of selected file
            parentPath = path.dirname(selectedPath);
            parentUl = selectedItem.closest('ul'); // Use the list the file is in
            const currentPadding = parseInt(selectedItem.style.paddingLeft || '8');
            depth = (currentPadding - 8) / 12;
        }
    }

    // 3. Create and Insert Input Element
    const tempLi = document.createElement('li');
    const indent = 8 + (depth * 12);
    
    tempLi.className = 'tree-item creation-mode'; 
    tempLi.style.paddingLeft = `${indent}px`;
    tempLi.style.display = 'flex';
    tempLi.style.alignItems = 'center';
    tempLi.style.gap = '6px';
    
    const iconName = isFolder ? 'folder' : 'file';
    
    tempLi.innerHTML = `
        <i data-lucide="${iconName}" style="width:14px; height:14px; color:var(--peak-secondary);"></i>
        <input type="text" class="inline-creation-input" placeholder="Name..." 
               style="flex:1; min-width:0; border: 1px solid var(--peak-accent); border-radius: 4px; padding: 2px 6px; font-size: 13px; outline: none; background: var(--control-background-color); color: var(--peak-primary);">
    `;
    
    // Insert logic: 
    // If we have a selection and it's a file, insert after it. 
    // If it's a folder (and we are inserting inside), insert at top.
    if (selectedItem && selectedItem.dataset.isDirectory !== 'true') {
         selectedItem.after(tempLi);
    } else {
         if (parentUl.firstChild) parentUl.insertBefore(tempLi, parentUl.firstChild);
         else parentUl.appendChild(tempLi);
    }
    
    if (window.lucide) window.lucide.createIcons();
    
    const input = tempLi.querySelector('input');
    tempLi.scrollIntoView({ behavior: 'auto', block: 'nearest' });
    
    // 4. Lifecycle Handlers
    let isFinalizing = false;

    const finalize = async (shouldCreate) => {
        if (isFinalizing) return;
        isFinalizing = true;

        const name = input.value.trim();
        tempLi.remove(); // Remove input from DOM

        if (shouldCreate && name) {
            const fullPath = path.join(parentPath, name);
            const handler = isFolder ? 'project:create-dir' : 'project:create-file';
            
            const result = await window.ipcRenderer.invoke(handler, fullPath);
            
            if (result.error) {
                alert(`Error: ${result.error}`);
            } else {
                // Watcher will likely trigger refresh, but we do it manually for responsiveness
                await renderRefresh();
                if (parentPath !== rootProjectPath) {
                    expandedFolders[parentPath] = true;
                }
            }
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finalize(true); } 
        else if (e.key === 'Escape') { e.preventDefault(); finalize(false); }
    });

    input.addEventListener('blur', () => {
        // Small delay to allow for button clicks to register if needed
        setTimeout(() => finalize(!!input.value.trim()), 150);
    });

    // Force focus
    setTimeout(() => input.focus(), 50);
}

// --- INLINE RENAME LOGIC ---
function renameFileSystemItem(targetPath, rootContainer) {
    const container = rootContainer || document;
    const item = container.querySelector(`.tree-item[data-path="${CSS.escape(targetPath)}"]`);
    
    if (!item) return;

    const span = item.querySelector('span');
    const originalName = span.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalName;
    input.className = 'inline-rename-input';
    input.style.flex = '1';
    input.style.minWidth = '0';
    input.style.border = '1px solid var(--peak-accent)';
    input.style.borderRadius = '4px';
    input.style.padding = '2px 6px';
    input.style.fontSize = '13px';
    input.style.outline = 'none';
    input.style.background = 'var(--control-background-color)';
    input.style.color = 'var(--peak-primary)';

    span.replaceWith(input);
    input.focus();
    input.select(); 

    let isFinalizing = false;

    const finalize = async (shouldRename) => {
        if (isFinalizing) return;
        isFinalizing = true;

        const newName = input.value.trim();

        if (shouldRename && newName && newName !== originalName) {
            const oldPath = targetPath;
            const newPath = path.join(path.dirname(oldPath), newName);
            
            const result = await window.ipcRenderer.invoke('project:move-file', oldPath, newPath);
            if (result.error) {
                alert(`Rename failed: ${result.error}`);
                input.replaceWith(span); 
            }
        } else {
            input.replaceWith(span);
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); finalize(true); }
        else if (e.key === 'Escape') { e.preventDefault(); finalize(false); }
    });

    input.addEventListener('blur', () => setTimeout(() => finalize(!!input.value.trim()), 100));
}

// --- DRAG & DROP HANDLERS ---

function handleDragStart(e) {
    const item = e.target.closest('.tree-item');
    if (!item) return;
    
    draggedItemPath = item.dataset.path;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedItemPath);
    item.style.opacity = '0.5';
}

function handleDragOver(e) {
    e.preventDefault(); 
    e.dataTransfer.dropEffect = 'move';
    
    const container = e.currentTarget; // The sidebar container that has the listener
    // Clear previous
    container.querySelectorAll('.tree-item.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));

    const targetItem = e.target.closest('.tree-item');
    if (!targetItem) return; // Hovering empty space -> Root drop (handled in drop)

    const targetPath = targetItem.dataset.path;
    const isDirectory = targetItem.dataset.isDirectory === 'true';
    
    if (targetPath === draggedItemPath) return;
    if (!isDirectory) return; // Can only drag into folders

    targetItem.classList.add('drag-over-folder');
}

function handleDragLeave(e) {
    const targetItem = e.target.closest('.tree-item');
    if (targetItem) targetItem.classList.remove('drag-over-folder');
}

async function handleDrop(e, renderRefresh) {
    e.preventDefault();
    const container = e.currentTarget;
    
    // Reset visuals
    container.querySelectorAll('.tree-item').forEach(el => el.style.opacity = '1');
    container.querySelectorAll('.tree-item.drag-over-folder').forEach(el => el.classList.remove('drag-over-folder'));
    
    const draggingPath = e.dataTransfer.getData('text/plain');
    if (!draggingPath) return;

    // Default Target: Root
    let targetFolderPath = rootProjectPath; 
    
    const targetItem = e.target.closest('.tree-item');
    // If we dropped ON a folder item, change target
    if (targetItem && targetItem.dataset.isDirectory === 'true') {
        targetFolderPath = targetItem.dataset.path;
    }

    const fileName = path.basename(draggingPath);
    const newPath = path.join(targetFolderPath, fileName);

    if (draggingPath === newPath) return;

    const result = await window.ipcRenderer.invoke('project:move-file', draggingPath, newPath);
    
    if (result.success) {
        if (targetFolderPath !== rootProjectPath) expandedFolders[targetFolderPath] = true;
        await renderRefresh();
    } else {
        alert(`Move failed: ${result.error}`);
    }
}

// ... (The rest of the file: handleFileClick, toggleFolderState, render functions - KEEP AS IS) ...
// (For brevity, assuming previous implementation of renderSidebarHTML, getVsCodeIcon, etc. follows here)

async function handleFileClick(clickedItem, filePath, editorPane, titleBar) {
    const container = clickedItem.closest('.file-tree-container') || document;
    container.querySelectorAll('.tree-item').forEach(item => item.classList.remove('selected'));
    clickedItem.classList.add('selected');
    currentFilePath = filePath;
    titleBar.textContent = clickedItem.querySelector('span').textContent; 

    editorPane.innerHTML = '<div class="project-editor-placeholder">Loading file...</div>';
    editorPane.classList.remove('code-mirror-active');

    let fileContent = await window.ipcRenderer.invoke('project:read-file', filePath);

    if (typeof fileContent === 'string') {
        const contentToLoad = fileContent.length === 0 ? '\n' : fileContent;
        return { content: contentToLoad };
    } else if (fileContent && fileContent.error) {
        editorPane.innerHTML = `<div class="project-editor-placeholder error">Error: ${fileContent.error}</div>`;
        return { error: true };
    } else {
        editorPane.innerHTML = `<div class="project-editor-placeholder error">Error: Failed to load file content.</div>`;
        return { error: true };
    }
}

async function toggleFolderState(clickedItem, filePath, getFilterValue) {
    const isExpanded = !!expandedFolders[filePath];
    const safeId = filePath.replace(/[^a-zA-Z0-9]/g, '_');
    // Use document querySelectorAll to find all instances (if multiple tabs open) or scope it
    // Scoping to clickedItem's container is safer
    const container = clickedItem.closest('.file-tree-container');
    const childrenContainer = container ? container.querySelector(`#children-${safeId}`) : document.getElementById(`children-${safeId}`);
    
    const chevron = clickedItem.querySelector('.chevron-icon');

    if (isExpanded) {
        delete expandedFolders[filePath];
        if (childrenContainer) {
            childrenContainer.style.display = 'none';
            childrenContainer.innerHTML = '';
        }
        if(chevron) chevron.setAttribute('data-lucide', 'chevron-right');
        clickedItem.classList.remove('expanded');
        clickedItem.classList.add('collapsed');
    } else {
        expandedFolders[filePath] = true;
        if (childrenContainer) {
             childrenContainer.style.display = 'block';
             childrenContainer.innerHTML = '<p class="loading-placeholder">Loading...</p>';
             
             const subFiles = await window.ipcRenderer.invoke('project:read-dir', filePath);
             const currentFilter = getFilterValue ? getFilterValue() : '';
             if (subFiles) {
                 childrenContainer.innerHTML = renderFileTreeHTML(subFiles, null, 1, currentFilter);
                 if(window.lucide) window.lucide.createIcons();
                 await renderExpandedChildrenRec(subFiles, currentFilter);
             } else {
                 childrenContainer.innerHTML = `<p class="error-placeholder">Error loading folder.</p>`;
             }
        }
        if(chevron) chevron.setAttribute('data-lucide', 'chevron-down');
        clickedItem.classList.remove('collapsed');
        clickedItem.classList.add('expanded');
        if(window.lucide) window.lucide.createIcons();
    }
}

async function renderExpandedChildrenRec(files, currentFilter) {
    for (const item of files) {
        if (item.isDirectory && expandedFolders[item.path]) {
            const safeId = item.path.replace(/[^a-zA-Z0-9]/g, '_');
            // We can't easily scope recursion without passing container context, 
            // so querySelectorAll covers all tabs which is acceptable syncing.
            const containers = document.querySelectorAll(`#children-${safeId}`);
            for (const container of containers) {
                const deepSubFiles = await window.ipcRenderer.invoke('project:read-dir', item.path);
                if (deepSubFiles) {
                    container.innerHTML = renderFileTreeHTML(deepSubFiles, null, 1, currentFilter);
                    if(window.lucide) window.lucide.createIcons();
                    await renderExpandedChildrenRec(deepSubFiles, currentFilter);
                }
            }
        }
    }
}

function getVsCodeIcon(item) {
    if (item.isDirectory) {
        const iconName = expandedFolders[item.path] ? 'folder-open' : 'folder';
        const iconColor = color(item.name) || 'var(--peak-secondary)'; 
        return { html: `<i data-lucide="${iconName}" class="main-icon" style="color: ${iconColor};"></i>` };
    }
    const iconKey = getLucideIconForFile(item.name);
    const iconColor = color(item.name) || 'var(--peak-secondary)';
    if (iconKey.startsWith('LOGO_')) {
        const logoType = iconKey.substring(5).toLowerCase(); 
        const dataUrl = ASSET_CACHE[logoType]; 
        if (dataUrl) return { html: `<img src="${dataUrl}" alt="${logoType}" class="main-icon file-logo">` };
    }
    return { html: `<i data-lucide="${iconKey}" class="main-icon" style="color: ${iconColor};"></i>` };
}

function getLucideIconForFile(fileName) {
    const name = fileName.toLowerCase();
    const parts = name.split('.');
    const ext = parts.length > 1 ? parts.pop() : name;
    if (typeof fileNameToIcon(fileName) !== 'string') {
        if (ext === 'txt' || ext === 'log' || ext === '') return 'file-text';
        return 'code';
    }
    if (name === 'package.json' || name === 'package-lock.json') return 'box';
    if (name.includes('.gitignore')) return 'git-branch';
    if (name.includes('readme')) return 'book-open';
    switch (ext) {
        case 'js': case 'jsx': case 'mjs': return 'LOGO_JS';
        case 'ts': case 'tsx': return 'LOGO_TS';
        case 'css': case 'less': case 'sass': return 'LOGO_CSS';
        case 'html': case 'htm': return 'LOGO_HTML';
        case 'swift': return 'LOGO_SWIFT';
        case 'json': return 'settings-2'; 
        case 'py': return 'flask-conical';
        case 'java': return 'coffee';
        case 'md': return 'book-open';
        default: return 'code';
    }
}

function renderListItems(items, depth, currentFilter = '') {
    const filter = currentFilter.toLowerCase();
    const filteredItems = items.filter(item => {
        if (!filter) return true; 
        const nameMatches = item.name.toLowerCase().includes(filter);
        const isExpandedFolder = item.isDirectory && expandedFolders[item.path];
        return nameMatches || isExpandedFolder;
    });

    return filteredItems.map(item => {
        const isDirectory = item.isDirectory;
        const state = isDirectory && expandedFolders[item.path] ? 'expanded' : 'collapsed';
        const itemIconData = getVsCodeIcon(item);
        const chevronIcon = isDirectory ? (state === 'expanded' ? 'chevron-down' : 'chevron-right') : '';
        const safeId = item.path.replace(/[^a-zA-Z0-9]/g, '_');

        let html = `
            <li class="tree-item ${isDirectory ? 'directory-item' : 'file-item'} ${state} ${item.path === currentFilePath ? 'selected' : ''}"
                data-path="${item.path}" 
                data-is-directory="${isDirectory}"
                draggable="true">
                ${isDirectory ? `<i data-lucide="${chevronIcon}" class="chevron-icon"></i>` : ''}
                ${itemIconData.html}
                <span>${item.name}</span>
            </li>
        `;
        if (isDirectory) {
            html += `<div id="children-${safeId}" class="children-container" style="display: ${state === 'expanded' ? 'block' : 'none'};"></div>`;
        }
        return html;
    }).join('');
}

function renderFileTreeHTML(items, projectTitle, depth = 0, currentFilter = '') {
    const listItems = renderListItems(items, depth, currentFilter); 
    const finalTitle = projectTitle; 
    if (depth === 0) {
        return `<h3 class="file-tree-header">${finalTitle}</h3><ul class="file-tree">${listItems}</ul>`;
    }
    return `<ul class="file-tree nested">${listItems}</ul>`;
}

async function findAndAutoExpand(parentPath, currentFiles, filter) {
    const lowerFilter = filter.toLowerCase();
    let foundMatch = false;
    for (const item of currentFiles) {
        const nameMatches = item.name.toLowerCase().includes(lowerFilter);
        if (item.isDirectory) {
            const subFiles = await window.ipcRenderer.invoke('project:read-dir', item.path);
            let childMatch = false;
            if (subFiles) {
                childMatch = await findAndAutoExpand(item.path, subFiles, filter);
            }
            if (nameMatches || childMatch) {
                expandedFolders[item.path] = true;
                foundMatch = true;
            } else {
                delete expandedFolders[item.path];
            }
        } else if (nameMatches) {
            foundMatch = true;
        }
    }
    return foundMatch;
}

async function renderSidebarHTML(sidebar, projectData, filter = '') {
    try {
        await initializeAssetCache();
        const files = await window.ipcRenderer.invoke('project:read-dir', projectData.path);
        rootProjectPath = projectData.path; 
        const projectTitle = projectData.title || rootProjectPath.split(/[\\/]/).pop();
        
        if (files) {
            if (filter) await findAndAutoExpand(projectData.path, files, filter);
            sidebar.innerHTML = renderFileTreeHTML(files, projectTitle, 0, filter); 
            if (window.lucide) window.lucide.createIcons();
        } else {
            sidebar.innerHTML = `<p>Error loading project files.</p>`;
        }
        await renderExpandedChildrenRec(files, filter);
    } catch (err) {
        console.error('[ProjectView]: Error re-loading file tree:', err);
        sidebar.innerHTML = `<p>Error loading project files.</p>`;
    }
}

module.exports = {
    renderSidebarHTML,
    renderListItems,
    expandedFolders,
    currentFilePath,
    toggleFolderState,
    handleFileClick,
    createNewFileSystemItem,
    renameFileSystemItem,
    initializeAssetCache,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDrop
};