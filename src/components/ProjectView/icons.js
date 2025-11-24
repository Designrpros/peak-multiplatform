// src/components/ProjectView/icons.js
const IconModule = require('vscode-icons-js');
const path = require('path');
const { ipcRenderer } = require('electron');

// --- VS Code Icons Setup ---
const getIconFunction = (propName) => {
    const fn = IconModule[propName] || (IconModule.default && IconModule.default[propName]);
    return typeof fn === 'function' ? fn : () => null; 
};
const fileNameToIcon = getIconFunction('fileNameToIcon');
const color = getIconFunction('color');

// Local Asset Cache
const BASE_ASSET_PATH = 'assets/logos'; 
const ASSET_CACHE = {}; 
const LOGO_FILES = {
    'js': 'javascript.svg', 'ts': 'typescript.svg', 'css': 'css.svg',
    'html': 'html.svg', 'swift': 'swift.svg'
};

async function initializeAssetCache() {
    if (Object.keys(ASSET_CACHE).length > 0) return;
    for (const key in LOGO_FILES) {
        try {
            const relativePath = path.join(BASE_ASSET_PATH, LOGO_FILES[key]);
            const dataUrl = await ipcRenderer.invoke('project:read-asset-base64', relativePath);
            if (dataUrl) ASSET_CACHE[key] = dataUrl;
        } catch (e) {}
    }
}

function getFileIconHTML(fileName) {
    const name = fileName.toLowerCase();
    const parts = name.split('.');
    const ext = parts.length > 1 ? parts.pop() : name;

    // 1. Check for cached high-res logos first
    if (ASSET_CACHE[ext]) {
        return `<img src="${ASSET_CACHE[ext]}" alt="${ext}" class="main-icon file-logo" style="width:16px; height:16px; object-fit:contain;">`;
    }

    // 2. Check VS Code Icons
    const iconKey = fileNameToIcon(fileName);
    if (iconKey && typeof iconKey === 'string') {
        // If it returns a specific icon name, we map it to a Lucide icon or Generic
        // Since we don't have the full SVG set of VSCode icons loaded, we fall back intelligently
        // Real implementation would load the SVG, but here we map common types to Lucide for consistency
    }

    // 3. Manual Map for common types (Lucide)
    let lucideIcon = 'file';
    let iconColor = color(fileName) || 'var(--peak-secondary)';

    if (name === 'package.json' || name === 'package-lock.json') lucideIcon = 'box';
    else if (name === '.gitignore' || name === '.env') lucideIcon = 'settings-2';
    else if (ext === 'md') lucideIcon = 'book-open';
    else if (ext === 'txt') lucideIcon = 'file-text';
    else if (ext === 'json') lucideIcon = 'braces';
    else if (['jpg', 'png', 'gif', 'svg', 'webp'].includes(ext)) lucideIcon = 'image';
    
    return `<i data-lucide="${lucideIcon}" class="main-icon" style="width:14px; height:14px; color: ${iconColor};"></i>`;
}

function getFolderIconHTML(isOpen) {
    const icon = isOpen ? 'folder-open' : 'folder';
    // Folders are always yellow/gold or secondary color
    const col = isOpen ? '#E5C07B' : 'var(--peak-secondary)'; 
    return `<i data-lucide="${icon}" class="main-icon" style="width:14px; height:14px; color: ${col};"></i>`;
}

module.exports = {
    initializeAssetCache,
    getFileIconHTML,
    getFolderIconHTML
};