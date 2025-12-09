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
    'html': 'html.svg', 'swift': 'swift.svg',
    'peak': '../Peak-icon.png'
};

async function initializeAssetCache() {
    if (Object.keys(ASSET_CACHE).length > 0) return;
    for (const key in LOGO_FILES) {
        try {
            const relativePath = path.join(BASE_ASSET_PATH, LOGO_FILES[key]);
            const dataUrl = await ipcRenderer.invoke('project:read-asset-base64', relativePath);
            if (dataUrl) ASSET_CACHE[key] = dataUrl;
        } catch (e) { }
    }
}

// --- ICON THEME SUPPORT ---
let activeTheme = null;

function setIconTheme(theme) {
    activeTheme = theme;
}

function getThemeIcon(fileName, isFolder, isOpen) {
    if (!activeTheme) return null;

    const defs = activeTheme.iconDefinitions;
    let iconId = null;

    if (isFolder) {
        // Folder logic
        if (activeTheme.folderNames) {
            const folderName = fileName.toLowerCase();
            if (isOpen && activeTheme.folderNamesExpanded) {
                iconId = activeTheme.folderNamesExpanded[folderName];
            }
            if (!iconId) {
                iconId = activeTheme.folderNames[folderName];
            }
        }

        if (!iconId) {
            iconId = isOpen ? activeTheme.folderExpanded : activeTheme.folder;
        }
    } else {
        // File logic
        const name = fileName.toLowerCase();
        const ext = path.extname(name).replace('.', '');

        // 1. Check fileNames
        if (activeTheme.fileNames) {
            iconId = activeTheme.fileNames[name];
        }

        // 2. Check fileExtensions
        if (!iconId && activeTheme.fileExtensions) {
            iconId = activeTheme.fileExtensions[ext];
        }

        // 3. Check languageIds (simplified mapping for now)
        if (!iconId && activeTheme.languageIds) {
            // TODO: Map extension to language ID properly
            // For now, fallback to default file icon
        }

        // 4. Default file icon
        if (!iconId) {
            iconId = activeTheme.file;
        }
    }

    if (iconId && defs[iconId]) {
        const iconDef = defs[iconId];
        if (iconDef.iconPath) {
            return `<img src="${iconDef.iconPath}" class="main-icon" style="width:16px; height:16px; object-fit:contain;">`;
        }
    }

    return null;
}

// --- Custom SVG Icons (Premium Look) ---
const SVGS = {
    // Web Frameworks
    'react': '<svg viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="2.5" fill="#61DAFB"/><ellipse cx="16" cy="16" rx="11" ry="4.5" stroke="#61DAFB" stroke-width="1.5" transform="rotate(30 16 16)"/><ellipse cx="16" cy="16" rx="11" ry="4.5" stroke="#61DAFB" stroke-width="1.5" transform="rotate(-30 16 16)"/><ellipse cx="16" cy="16" rx="11" ry="4.5" stroke="#61DAFB" stroke-width="1.5" transform="rotate(90 16 16)"/></svg>',
    'next': '<svg viewBox="0 0 32 32" fill="#000"><path d="M16 2C8.3 2 2 8.3 2 16s6.3 14 14 14 14-6.3 14-14S23.7 2 16 2zm0 26C9.4 28 4 22.6 4 16S9.4 4 16 4s12 5.4 12 12-5.4 12-12 12z"/><path d="M21.3 22.6l-6-9.2V21h-2V10h2l6 9.2V10h2v12.6h-2z" fill="#fff"/><path d="M10.7 10h2v12.6h-2z" fill="#fff"/></svg>',
    'vue': '<svg viewBox="0 0 32 32"><path fill="#41B883" d="M24.4 3.5h3.1L16 23.5 4.5 3.5h3.1L16 17.5z"/><path fill="#35495E" d="M24.4 3.5H20L16 10.5 12 3.5H7.6L16 17.5z"/></svg>',
    'svelte': '<svg viewBox="0 0 32 32"><path fill="#FF3E00" d="M16 3C8.8 3 3 8.8 3 16s5.8 13 13 13 13-5.8 13-13S23.2 3 16 3zm6.5 18.3c0 2.4-2.6 3.7-5.5 3.7-3.6 0-5.8-1.9-5.8-1.9l1.2-2.3s1.8 1.4 4.3 1.4c1.3 0 2.1-.5 2.1-1.3 0-2.3-7.7-1.8-7.7-6.6 0-2.3 2-3.9 5.3-3.9 3.1 0 5.1 1.6 5.1 1.6l-1.1 2.3s-1.8-1.2-3.8-1.2c-1.2 0-1.9.5-1.9 1.2 0 2.2 7.7 1.7 7.7 6.6 0 .2 0 .3.1.4z"/></svg>',
    'tailwind': '<svg viewBox="0 0 32 32"><path fill="#38BDF8" d="M9 13.7c-2.2 0-4-1.2-4-3 0-1.5 1.5-2.7 3.5-2.7 1.5 0 2.7.7 3.2 1.7l.3.6c.5 1.1 1.7 1.7 3 1.7 2.2 0 4-1.2 4-3 0-1.5-1.5-2.7-3.5-2.7-1.5 0-2.7.7-3.2 1.7L12 8.6c-.5-1.1-1.7-1.7-3-1.7C4.6 6.9 1 9.9 1 13.7c0 3.8 3.6 6.9 8 6.9 2.2 0 4-1.2 4-3 0-1.5-1.5-2.7-3.5-2.7-1.5 0-2.7.7-3.2 1.7l-.3.6c-.5 1.1-1.7 1.7-3 1.7-2.2 0-4-1.2-4-3 0-1.5 1.5-2.7 3.5-2.7 1.5 0 2.7.7 3.2 1.7l.3.6c.5 1.1 1.7 1.7 3 1.7 4.4 0 8-3.1 8-6.9zM23 25.7c-2.2 0-4-1.2-4-3 0-1.5 1.5-2.7 3.5-2.7 1.5 0 2.7.7 3.2 1.7l.3.6c.5 1.1 1.7 1.7 3 1.7 2.2 0 4-1.2 4-3 0-1.5-1.5-2.7-3.5-2.7-1.5 0-2.7.7-3.2 1.7l-.3.6c-.5-1.1-1.7-1.7-3-1.7-4.4 0-8 3.1-8 6.9 0 3.8 3.6 6.9 8 6.9 2.2 0 4-1.2 4-3 0-1.5-1.5-2.7-3.5-2.7 1.5 0 2.7.7 3.2 1.7l.3.6c.5 1.1 1.7 1.7 3 1.7 4.4 0 8-3.1 8-6.9z"/></svg>',

    // Languages
    'js': '<svg viewBox="0 0 32 32"><path fill="#F7DF1E" d="M0 0h32v32H0z"/><path fill="#000" d="M22.4 23.9c-.8.5-1.9.8-2.9.8-2.5 0-3.8-1.7-3.8-4.3v-5.6h-3v5.6c0 4.2 2.6 6.6 6.6 6.6 1.6 0 3-.5 4.1-1.3l-1-2.3zm-11.8 0c-.9.5-1.8.8-2.7.8-1.5 0-2.3-.7-2.3-1.8 0-1.4 1.1-2.1 3.3-2.9l1.6-.6v-1.7c0-1.2-.8-1.9-2.2-1.9-1.1 0-2 .4-2.8 1l-.9-2.2c1.2-1 2.6-1.5 4.1-1.5 3 0 4.8 1.8 4.8 4.7v7.8h-2.8v-1.3c-1 1-2.3 1.6-3.8 1.6h.1zm1.7-4.6l-1.3.5c-1.1.4-1.6.8-1.6 1.5 0 .6.4 1 1.2 1 .9 0 1.7-.5 1.7-1.4v-1.6z"/></svg>',
    'ts': '<svg viewBox="0 0 32 32"><path fill="#3178C6" d="M0 0h32v32H0z"/><path fill="#fff" d="M17.5 25h2.5v-9.6h3.4v-2.2h-9.3v2.2h3.4V25zm-6.2 0h2.5v-2.6c.7.9 1.8 1.4 3.1 1.4 2.8 0 4.3-1.7 4.3-4.3v-.5h-2.4v.4c0 1.4-.7 2.2-2 2.2-1.1 0-1.9-.7-1.9-2.1v-1.4c0-1.7 1-2.6 3.1-3.4l1.3-.5c1.4-.5 2-1.2 2-2.3 0-1.6-1.3-2.6-3.3-2.6-1.6 0-3 .6-4 1.5l1.4 1.6c.7-.6 1.6-1 2.5-1 .9 0 1.5.5 1.5 1.4 0 .9-.6 1.4-2.3 2l-1.5.6c-1.7.7-2.6 1.7-2.6 3.5v5.7z"/></svg>',
    'html': '<svg viewBox="0 0 32 32"><path fill="#E34F26" d="M5 2h22l-2 23-9 5-9-5z"/><path fill="#fff" d="M22.3 22.8l-6.3 3.5-6.3-3.5 1.3-14.8h10l1.3 14.8z"/><path fill="#EBEBEB" d="M16 24.6l4.6-2.5.9-10.1H16v12.6z"/><path fill="#fff" d="M16 12H9.7l-.3 3h6.6v3.2l-4.4 1.2-.2-2.4H9l.4 4.5 6.6 1.8V12z"/></svg>',
    'css': '<svg viewBox="0 0 32 32"><path fill="#1572B6" d="M5 2h22l-2 23-9 5-9-5z"/><path fill="#fff" d="M22.3 22.8l-6.3 3.5-6.3-3.5 1.3-14.8h10l1.3 14.8z"/><path fill="#EBEBEB" d="M16 24.6l4.6-2.5.9-10.1H16v12.6z"/><path fill="#fff" d="M16 12H9.7l-.3 3h6.6v3.2l-4.4 1.2-.2-2.4H9l.4 4.5 6.6 1.8V12z"/></svg>',
    'python': '<svg viewBox="0 0 32 32"><path fill="#3776AB" d="M16 2c-4 0-4.5 1.8-4.5 1.8V6h9V4.5C20.5 2.5 19 2 16 2zM9.5 6C5.5 6 4 8.5 4 8.5V14h4.5v-1.5c0-1.5 1-2.5 2.5-2.5H16V6H9.5z"/><path fill="#FFD43B" d="M22.5 26c4 0 5.5-2.5 5.5-2.5V18h-4.5v1.5c0 1.5-1 2.5-2.5 2.5H16v4h6.5zM16 30c4 0 4.5-1.8 4.5-1.8V26h-9v1.5c0 2 1.5 2.5 4.5 2.5z"/><circle cx="13.5" cy="9.5" r="1.5" fill="#fff"/><circle cx="18.5" cy="22.5" r="1.5" fill="#3776AB"/></svg>',
    'ruby': '<svg viewBox="0 0 32 32"><path fill="#CC342D" d="M16 4L4 14l12 14 12-14z"/><path fill="#fff" d="M16 6l-8 7 8 9 8-9z" opacity=".3"/></svg>',
    'php': '<svg viewBox="0 0 32 32"><ellipse cx="16" cy="16" rx="14" ry="8" fill="#777BB4"/><text x="16" y="20" font-family="Arial" font-weight="bold" font-size="10" text-anchor="middle" fill="#fff">PHP</text></svg>',
    'java': '<svg viewBox="0 0 32 32"><path fill="#5382A1" d="M16 4c0 0-4 4-2 9s6-2 6-2-2-7-4-7z"/><path fill="#F89820" d="M6 18c0 5 4 9 10 9s10-4 10-9H6z"/></svg>',
    'go': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#00ADD8"/><text x="16" y="22" font-family="Arial" font-weight="bold" font-size="14" text-anchor="middle" fill="#fff">GO</text></svg>',
    'c': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#555555"/><text x="16" y="22" font-family="Arial" font-weight="bold" font-size="18" text-anchor="middle" fill="#fff">C</text></svg>',
    'cpp': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#00599C"/><text x="16" y="22" font-family="Arial" font-weight="bold" font-size="12" text-anchor="middle" fill="#fff">C++</text></svg>',
    'csharp': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="#68217A"/><text x="16" y="22" font-family="Arial" font-weight="bold" font-size="12" text-anchor="middle" fill="#fff">C#</text></svg>',
    'rust': '<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="#000"/><path fill="#fff" d="M16 4l2 4h-4l2-4zm10 12l-4 2v-4l4 2zm-10 12l-2-4h4l-2 4zM6 16l4-2v4l-4-2z"/></svg>',
    'sql': '<svg viewBox="0 0 32 32"><path fill="#00758F" d="M16 4c-6 0-10 2-10 4v16c0 2 4 4 10 4s10-2 10-4V8c0-2-4-4-10-4zm0 6c4 0 8-1 8-2s-4-2-8-2-8 1-8 2 4 2 8 2z"/></svg>',

    // Tools / Config
    'git': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="var(--icon-bg-git)"/><path fill="#fff" d="M16 4L4 16l12 12 12-12L16 4zm0 6c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6z" opacity="0.9"/></svg>',
    'docker': '<svg viewBox="0 0 32 32" fill="#2496ED"><path d="M18.5 10.5h3v3h-3zm-4 0h3v3h-3zm-4 0h3v3h-3zm-4 0h3v3h-3zm12 4h3v3h-3zm-4 0h3v3h-3zm-4 0h3v3h-3zm-4 0h3v3h-3zm16 4h3v3h-3zm-4 0h3v3h-3zm-4 0h3v3h-3zm-4 0h3v3h-3zM2 19.5h28v5c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2v-5z"/></svg>',
    'npm': '<svg viewBox="0 0 32 32" fill="#CB3837"><path d="M0 0h32v32H0z"/><path d="M16 6h10v20H16V16h-4v10H6V6h10z" fill="#fff"/></svg>',
    'eslint': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="var(--icon-bg-eslint)"/><path fill="#fff" d="M16 6l10 6v10l-10 6-10-6V12l10-6z" opacity="0.3"/><path fill="#fff" d="M22 12l-6-3.5-6 3.5-2 3.5 2 3.5 6 3.5 6-3.5 2-3.5-2-3.5z"/></svg>',
    'terminal': '<svg viewBox="0 0 32 32" fill="#4D4D4D"><rect x="2" y="6" width="28" height="20" rx="2"/><path d="M6 12l6 4-6 4M14 22h8" stroke="#fff" stroke-width="2" fill="none"/></svg>',
    'lock': '<svg viewBox="0 0 32 32" fill="#EAB308"><path d="M16 2a7 7 0 00-7 7v5H7v14h18V14h-2V9a7 7 0 00-7-7zm0 4a3 3 0 013 3v5h-6V9a3 3 0 013-3z"/></svg>',
    'archive': '<svg viewBox="0 0 32 32" fill="#FFA000"><path d="M4 6h24v6H4zM4 14h24v12H4zM14 14v4h4v-4"/></svg>',
    'json': '<svg viewBox="0 0 32 32" fill="#F7DF1E"><path d="M0 0h32v32H0z" fill="#CBCB41"/><path d="M16 8c-1.1 0-2 .9-2 2v3c0 .6-.4 1-1 1s-1-.4-1-1v-1c0-1.1-.9-2-2-2s-2 .9-2 2v1c0 2.2 1.8 4 4 4v1c-2.2 0-4 1.8-4 4v1c0 1.1.9 2 2 2s2-.9 2-2v-1c0-.6.4-1 1-1s1 .4 1 1v3c0 1.1.9 2 2 2s2-.9 2-2v-3c0-2.2-1.8-4-4-4v-1c2.2 0 4-1.8 4-4v-3c0-1.1-.9-2-2-2z" fill="#000"/></svg>',

    // Docs
    'image': '<svg viewBox="0 0 32 32" fill="#B072D1"><rect x="2" y="4" width="28" height="24" rx="2" fill="#B072D1"/><circle cx="10" cy="12" r="3" fill="#fff"/><path d="M28 22l-7-9-6 6-4-4-9 9v2h26v-4z" fill="#fff"/></svg>',
    'markdown': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="var(--icon-bg-markdown)"/><path fill="#fff" d="M23 8H9c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 19H10v-6h2v6zm2 0h-2v-6h2v6zm2 0h-2v-6h2v6zm4 0h-2v-6h2v6z" opacity="0.9"/><text x="16" y="22" font-family="Arial" font-weight="bold" font-size="10" text-anchor="middle" fill="#fff">MD</text></svg>',
    'settings': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="var(--icon-bg-env)"/><text x="16" y="21" font-family="Arial" font-weight="bold" font-size="10" text-anchor="middle" fill="#fff">ENV</text></svg>',
    'info': '<svg viewBox="0 0 32 32" fill="#007ACC"><path d="M16 2C8.2 2 2 8.2 2 16s6.2 14 14 14 14-6.2 14-14S23.8 2 16 2zm0 24c-5.5 0-10-4.5-10-10S10.5 6 16 6s10 4.5 10 10-4.5 10-10 10zm-1-12h2v8h-2v-8zm0-4h2v2h-2v-2z" fill="#fff"/></svg>',
    'text': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="var(--icon-bg-license)"/><text x="16" y="21" font-family="Arial" font-weight="bold" font-size="10" text-anchor="middle" fill="#fff">TXT</text></svg>',
    'peak': '<svg viewBox="0 0 32 32"><rect width="32" height="32" rx="4" fill="var(--peak-accent)"/><path fill="#fff" d="M16 6L3 24h26L16 6zm0 4.5l8.5 11.5H7.5L16 10.5z"/></svg>'
};

// EXTENSIVE EXTENSION MAP
const EXT_MAP = {
    // Web
    'js': 'js', 'jsx': 'react', 'ts': 'ts', 'tsx': 'react',
    'html': 'html', 'htm': 'html', 'css': 'css', 'scss': 'css', 'sass': 'css', 'less': 'css',
    'json': 'json', 'xml': 'html', 'yaml': 'json', 'yml': 'json',
    'md': 'markdown', 'markdown': 'markdown', 'mdx': 'markdown',
    'svg': 'image', 'png': 'image', 'jpg': 'image', 'jpeg': 'image', 'gif': 'image', 'webp': 'image', 'ico': 'image',
    'vue': 'vue', 'svelte': 'svelte',

    // Backend
    'py': 'python', 'pyc': 'python', 'pyd': 'python',
    'rb': 'ruby', 'erb': 'html',
    'php': 'php',
    'java': 'java', 'class': 'java', 'jar': 'archive',
    'go': 'go',
    'c': 'c', 'h': 'c',
    'cpp': 'cpp', 'hpp': 'cpp', 'cc': 'cpp',
    'cs': 'csharp',
    'rs': 'rust',
    'sql': 'sql', 'prisma': 'sql', 'db': 'sql', 'sqlite': 'sql',

    // Config / Tools
    'sh': 'terminal', 'bash': 'terminal', 'zsh': 'terminal',
    'env': 'settings',
    'gitignore': 'git',
    'dockerfile': 'docker',
    'lock': 'lock',
    'zip': 'archive', 'tar': 'archive', 'gz': 'archive', '7z': 'archive', 'rar': 'archive',

    // Docs
    'txt': 'text', 'pdf': 'text', 'doc': 'text', 'docx': 'text',
    'xls': 'text', 'xlsx': 'text', 'csv': 'text'
};

// SPECIAL FILENAMES
const FILE_MAP = {
    'package.json': 'npm',
    'package-lock.json': 'npm',
    'yarn.lock': 'npm',
    'dockerfile': 'docker',
    'docker-compose.yml': 'docker',
    'docker-compose.yaml': 'docker',
    '.gitignore': 'git',
    '.env': 'settings',
    '.env.local': 'settings',
    'readme.md': 'info',
    'license': 'text',
    'license.md': 'text',
    'license.txt': 'text',
    'next.config.js': 'next',
    'next.config.mjs': 'next',
    'tailwind.config.js': 'tailwind',
    'tailwind.config.ts': 'tailwind',
    'postcss.config.js': 'css',
    'eslint.config.mjs': 'eslint',
    '.eslintrc.json': 'eslint',
    '.eslintrc.js': 'eslint',
    '.eslintrc': 'eslint',
    'tsconfig.json': 'ts',
    'jsconfig.json': 'js',
    'implementation_plan.md': 'peak',
    'walkthrough.md': 'peak',
    'task.md': 'peak',
};

function getFileIconHTML(fileName) {
    // 0. Check Icon Theme
    const themeIcon = getThemeIcon(fileName, false);
    if (themeIcon) return themeIcon;

    const name = fileName.toLowerCase();
    const parts = name.split('.');
    const ext = parts.length > 1 ? parts.pop() : name;

    // Determine the Icon Key first
    let iconKey = null;
    if (FILE_MAP[name]) {
        iconKey = FILE_MAP[name];
    } else if (EXT_MAP[ext]) {
        iconKey = EXT_MAP[ext];
    }

    // 1. Check for cached high-res logos (Asset Cache)
    if (iconKey && ASSET_CACHE[iconKey]) {
        if (iconKey === 'peak') {
            return `<div class="main-icon file-logo" style="width:16px; height:16px; background-color:var(--peak-accent); -webkit-mask-image: url(${ASSET_CACHE[iconKey]}); -webkit-mask-size: contain; -webkit-mask-repeat: no-repeat; -webkit-mask-position: center;"></div>`;
        }
        return `<img src="${ASSET_CACHE[iconKey]}" alt="${iconKey}" class="main-icon file-logo" style="width:16px; height:16px; object-fit:contain;">`;
    }
    if (ASSET_CACHE[ext]) {
        return `<img src="${ASSET_CACHE[ext]}" alt="${ext}" class="main-icon file-logo" style="width:16px; height:16px; object-fit:contain;">`;
    }

    // 2. Check VS Code Icons
    const vscodeIconKey = fileNameToIcon(fileName);
    if (vscodeIconKey && typeof vscodeIconKey === 'string') {
        // If it returns a specific icon name, we map it to a Lucide icon or Generic
    }

    // 3. Custom SVG Icons (Premium Look)
    let svgContent = null;
    if (iconKey && SVGS[iconKey]) {
        svgContent = SVGS[iconKey];
    }

    if (svgContent) {
        return `<div class="main-icon" style="width:14px; height:14px; display:flex; align-items:center; justify-content:center;">${svgContent}</div>`;
    }

    // FALLBACK to Lucide
    let lucideIcon = 'file';
    let iconColor = color(fileName) || 'var(--peak-secondary)';

    if (name.includes('config')) lucideIcon = 'settings';
    else if (ext === 'md') lucideIcon = 'book-open';
    else if (ext === 'txt') lucideIcon = 'file-text';

    return `<i data-lucide="${lucideIcon}" class="main-icon" style="width:14px; height:14px; color: ${iconColor};"></i>`;
}

function getFolderIconHTML(isOpen, folderName = '') {
    // 0. Check Icon Theme
    const themeIcon = getThemeIcon(folderName, true, isOpen);
    if (themeIcon) return themeIcon;

    // Custom Folder Icons
    const folderColor = isOpen ? '#E5C07B' : '#DCB67A';
    const svg = `<svg viewBox="0 0 32 32" fill="${folderColor}"><path d="M28 8H16l-4-4H4C2.9 4 2 4.9 2 6v20c0 1.1.9 2 2 2h24c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z"/></svg>`;

    return `<div class="main-icon" style="width:14px; height:14px; display:flex; align-items:center; justify-content:center;">${svg}</div>`;
}

module.exports = {
    initializeAssetCache,
    getFileIconHTML,
    getFolderIconHTML,
    setIconTheme
};