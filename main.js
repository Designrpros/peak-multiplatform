// src/main.js
const { app, BrowserWindow, Tray, globalShortcut, ipcMain, dialog, Menu, shell, clipboard, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { pathToFileURL } = require('url');
const { ESLint } = require('eslint');
const mime = require('mime-types');
const Store = require('electron-store');

dotenv.config();

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('ozone-platform-hint', 'auto');
    app.commandLine.appendSwitch('enable-features', 'WaylandWindowDecorations,GlobalShortcutsPortal,AppIndicatorSupport');
}

Store.initRenderer();
const settingsStore = new Store({
    name: 'userSettings',
    defaults: { hotkey: 'Control+Space', isDockVisible: false, isFloating: true, openrouterApiKey: null }
});

let pty;
try { pty = require('node-pty'); } catch (e) { console.error("[Main] Node-pty failed.", e); }
const ptyProcesses = {};

const openrouterService = require('./src/openrouter-service');

let tray, mainWindow, settingsWindow;
const WINDOW_WIDTH = 1024;
const WINDOW_HEIGHT = 768;
let ignoreBlur = false;
let activeProjectWatcher = null;

function hideWindow() {
    if (!mainWindow || !mainWindow.isVisible()) return;
    if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(false);
    mainWindow.hide();
}

function createWindow() {
    const isFloating = settingsStore.get('isFloating', true);
    mainWindow = new BrowserWindow({
        width: WINDOW_WIDTH, height: WINDOW_HEIGHT, show: false, frame: false, skipTaskbar: true,
        fullscreenable: false, center: true, transparent: true, backgroundColor: '#00000000',
        alwaysOnTop: isFloating, collectionBehavior: ['canJoinAllSpaces'], level: isFloating ? 'floating' : 'normal',
        allowsBackForwardNavigationGestures: true, resizable: true,
        webPreferences: { nodeIntegration: true, contextIsolation: false, webviewTag: true, scrollBounce: true, spellcheck: true }
    });

    mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.session.setSpellCheckerLanguages(['en-US', 'nb']);
        //console.log('[Main] Available Spellchecker Languages:', mainWindow.webContents.session.availableSpellCheckerLanguages);
        //console.log('[Main] Configured Spellchecker Languages:', mainWindow.webContents.session.getSpellCheckerLanguages());
    });

    // --- NEW: Intercept Window Creation from WebViews ---
    mainWindow.webContents.on('did-attach-webview', (event, webContents) => {
        webContents.setWindowOpenHandler((details) => {
            // Send the URL back to the renderer to open in a Peak tab
            mainWindow.webContents.send('open-new-tab', details.url);
            // Deny the native Electron window
            return { action: 'deny' };
        });
    });
    // ----------------------------------------------------

    // --- SPELLCHECK & STANDARD CONTEXT MENU ---
    mainWindow.webContents.on('context-menu', (event, params) => {
        const { misspelledWord, dictionarySuggestions, selectionText } = params;
        console.log('[Main] Context Menu:', { misspelledWord, dictionarySuggestions, selectionText }); // DEBUG

        const template = [];

        if (misspelledWord && dictionarySuggestions.length > 0) {
            template.push(
                ...dictionarySuggestions.map(suggestion => ({
                    label: suggestion,
                    click: () => mainWindow.webContents.replaceMisspelling(suggestion)
                })),
                { type: 'separator' },
                { label: 'Add to Dictionary', click: () => mainWindow.webContents.session.addWordToSpellCheckerDictionary(misspelledWord) },
                { type: 'separator' }
            );
        }

        template.push(
            { label: 'Cut', role: 'cut' },
            { label: 'Copy', role: 'copy', enabled: !!selectionText },
            { label: 'Paste', role: 'paste' },
            { type: 'separator' },
            { label: 'Select All', role: 'selectAll' }
        );

        if (params.linkURL) {
            template.push(
                { type: 'separator' },
                { label: 'Open Link', click: () => shell.openExternal(params.linkURL) }
            );
        }

        Menu.buildFromTemplate(template).popup({ window: mainWindow });
    });

    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.on('blur', () => { if (ignoreBlur) return; if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) hideWindow(); });
}

function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) { settingsWindow.focus(); return; }
    settingsWindow = new BrowserWindow({ width: 800, height: 600, title: 'Peak Settings', frame: true, resizable: false, show: false, webPreferences: { nodeIntegration: true, contextIsolation: false, webviewTag: true } });
    settingsWindow.setAlwaysOnTop(true, 'floating');
    settingsWindow.loadFile('index.html', { query: { settingsMode: 'true' } });
    settingsWindow.on('ready-to-show', () => settingsWindow.show());
    settingsWindow.on('closed', () => settingsWindow = null);
}

function createTray() {
    const iconFileName = (process.platform === 'linux' || process.platform === 'win32') ? 'Peak-icon1.png' : 'Peak-icon.png';
    const iconPath = path.join(__dirname, 'assets', iconFileName);
    let icon = nativeImage.createFromPath(iconPath).resize({ width: 25, height: 16 });
    if (process.platform === 'darwin') icon.setTemplateImage(true);

    tray = new Tray(icon);
    tray.setToolTip('Peak Browser');
    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show/Hide Peak', click: () => toggleWindow() },
        { label: 'Settings', click: () => createSettingsWindow() },
        { type: 'separator' },
        { label: 'Quit Peak', click: () => app.quit() }
    ]);
    tray.setContextMenu(contextMenu);
    tray.on('click', () => toggleWindow());
}

function toggleWindow() {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) { hideWindow(); } else {
        ignoreBlur = true;
        if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(true);
        mainWindow.show(); mainWindow.focus(); app.focus({ steal: true });
        setTimeout(() => { ignoreBlur = false; }, 150);
    }
}

function registerHotKey() {
    globalShortcut.unregisterAll();
    const currentHotkey = settingsStore.get('hotkey', 'Control+Space');
    globalShortcut.register(currentHotkey, () => toggleWindow());
}

async function recursiveSearch(dir, query, matchedFiles = [], expandedDirs = new Set()) {
    try {
        const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
        for (const dirent of dirents) {
            if (['.git', '.DS_Store', 'node_modules'].includes(dirent.name)) continue;
            const fullPath = path.join(dir, dirent.name);
            if (dirent.isDirectory()) {
                if (dirent.name.toLowerCase().includes(query)) expandedDirs.add(fullPath);
                const foundChild = await recursiveSearch(fullPath, query, matchedFiles, expandedDirs);
                if (foundChild) expandedDirs.add(fullPath);
            } else {
                if (dirent.name.toLowerCase().includes(query)) { matchedFiles.push(fullPath); expandedDirs.add(dir); }
            }
        }
        return expandedDirs.has(dir) || matchedFiles.some(f => f.startsWith(dir));
    } catch (e) { return false; }
}

function setupIpcHandlers() {
    ipcMain.handle('app:get-home-path', () => os.homedir());
    ipcMain.handle('app:open-path', async (event, targetPath) => shell.openPath(targetPath));
    ipcMain.handle('project:reveal-in-finder', async (event, targetPath) => { if (targetPath) shell.showItemInFolder(targetPath); });

    ipcMain.handle('project:search', async (e, rootPath, query) => {
        const matchedFiles = []; const expandedDirs = new Set();
        if (!query || !query.trim()) return { matches: [], expanded: [] };
        await recursiveSearch(rootPath, query.toLowerCase(), matchedFiles, expandedDirs);
        return { matches: matchedFiles, expanded: Array.from(expandedDirs) };
    });

    // --- FIXED FILE CREATION LOGIC ---
    ipcMain.handle('project:create-file', async (e, p, force = false) => {
        try {
            if (fs.existsSync(p)) {
                const stat = fs.statSync(p);
                if (stat.isFile() && !force) return { error: 'ERR_EXISTS' };
            }
            await fs.promises.writeFile(p, '', 'utf8');
            return { success: true };
        } catch (err) {
            if (err.code === 'EISDIR') return { error: 'ERR_IS_DIRECTORY' };
            return { error: err.message };
        }
    });

    ipcMain.handle('project:create-dir', async (e, p, force = false) => {
        try {
            if (fs.existsSync(p)) {
                const stat = fs.statSync(p);
                if (stat.isFile()) return { error: 'ERR_IS_FILE' };
            }
            await fs.promises.mkdir(p, { recursive: true });
            return { success: true };
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('project:move-file', async (e, o, n, force = false) => {
        try {
            if (fs.existsSync(n)) {
                const stat = fs.statSync(n);
                const sourceStat = fs.statSync(o);
                if (sourceStat.isDirectory() && stat.isFile()) return { error: 'ERR_IS_FILE' };
                if (sourceStat.isFile() && stat.isDirectory()) return { error: 'ERR_IS_DIRECTORY' };
                if (!force) return { error: 'ERR_EXISTS' };
            }
            await fs.promises.rename(o, n);
            return { success: true };
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('project:copy-file', async (e, o, n, force = false) => {
        try {
            if (fs.existsSync(n)) {
                const stat = fs.statSync(n);
                const sourceStat = fs.statSync(o);
                if (sourceStat.isDirectory() && stat.isFile()) return { error: 'ERR_IS_FILE' };
                if (sourceStat.isFile() && stat.isDirectory()) return { error: 'ERR_IS_DIRECTORY' };
                if (!force) return { error: 'ERR_EXISTS' };
            }

            const sourceStat = fs.statSync(o);
            if (sourceStat.isDirectory()) {
                await fs.promises.cp(o, n, { recursive: true });
            } else {
                await fs.promises.copyFile(o, n);
            }
            return { success: true };
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('finder:read-dir', async (event, dirPath) => { try { const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true }); return dirents.filter(d => !['.git', '.DS_Store', 'node_modules'].includes(d.name)).map(d => ({ name: d.name, isDirectory: d.isDirectory(), path: path.join(dirPath, d.name), mtime: fs.statSync(path.join(dirPath, d.name)).mtime })).sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1)); } catch (e) { return { error: e.message }; } });
    ipcMain.handle('finder:rename', async (e, o, n) => { try { await fs.promises.rename(o, n); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.handle('finder:delete', async (e, p) => { try { await shell.trashItem(p); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.handle('finder:create-folder', async (e, p) => { try { await fs.promises.mkdir(p); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.on('show-finder-context-menu', (event, fileData) => { const template = fileData ? [{ label: 'Open', click: () => event.sender.send('finder:ctx-open', fileData.path) }, { type: 'separator' }, { label: 'Reveal in Finder', click: () => shell.showItemInFolder(fileData.path) }, { type: 'separator' }, { label: 'Rename', click: () => event.sender.send('finder:ctx-rename', fileData.path) }, { label: 'Move to Trash', click: () => event.sender.send('finder:ctx-delete', fileData.path) }] : [{ label: 'New Folder', click: () => event.sender.send('finder:ctx-new-folder') }]; Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) }); });

    ipcMain.on('show-project-context-menu', (event, { targetPath, instanceId }) => {
        const template = [
            { label: 'New File...', click: () => event.sender.send('project:ctx-new-file', { targetPath, instanceId }) },
            { label: 'New Folder...', click: () => event.sender.send('project:ctx-new-folder', { targetPath, instanceId }) },
            { type: 'separator' },
            { label: 'Reveal in Finder', click: () => event.sender.send('project:ctx-reveal', { targetPath, instanceId }) },
            { type: 'separator' },
            { label: 'Rename', click: () => event.sender.send('project:ctx-rename', { targetPath, instanceId }) },
            { label: 'Delete', click: () => event.sender.send('project:ctx-delete', { targetPath, instanceId }) }
        ];
        Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });

    ipcMain.on('project:watch', (event, projectPath) => { if (activeProjectWatcher) { try { activeProjectWatcher.close(); } catch (e) { } activeProjectWatcher = null; } if (!projectPath || !fs.existsSync(projectPath)) return; try { activeProjectWatcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => { if (filename && !filename.includes('.git') && !filename.includes('.DS_Store')) { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('project:files-changed', { eventType, filename }); } }); } catch (e) { console.error("Failed to watch:", e); } });

    // NEW: Logging helper for Renderer -> Terminal
    ipcMain.on('log:info', (event, ...args) => {
        console.log('[Renderer]', ...args);
    });

    ipcMain.handle('log-to-debug-file', async (event, msg) => {
        console.log('[DEBUG]', msg);
        return true;
    });

    // NEW: ESLint Handler
    let eslintInstance = null;
    ipcMain.handle('project:lint-file', async (event, filePath, content) => {
        try {
            if (!eslintInstance) {
                // Initialize ESLint (v9 uses flat config by default)
                eslintInstance = new ESLint();
            }

            // Lint the text
            const results = await eslintInstance.lintText(content, { filePath });

            // Format results for the editor
            if (results && results[0]) {
                return results[0].messages.map(msg => ({
                    from: 0, // We'll map line/col to pos in renderer
                    to: 0,
                    line: msg.line,
                    col: msg.column,
                    endLine: msg.endLine,
                    endCol: msg.endColumn,
                    severity: msg.severity === 2 ? 'error' : 'warning',
                    message: msg.message,
                    source: 'ESLint'
                }));
            }
            return [];
        } catch (e) {
            console.error("Lint error:", e);
            return [];
        }
    });

    ipcMain.handle('project:delete-path', async (event, itemPath) => { try { await shell.trashItem(itemPath); return { success: true }; } catch (e) { return { error: e.message }; } });
    ipcMain.handle('read-file-as-data-url', async (event, filePath) => { try { const data = await fs.promises.readFile(filePath); let mimeType = mime.lookup(filePath) || 'application/octet-stream'; return { buffer: { type: 'Buffer', data: Array.from(data) }, mimeType }; } catch (e) { return { error: e.message }; } });
    ipcMain.handle('clipboard:write-image-dataurl', (e, d) => { try { clipboard.writeImage(nativeImage.createFromDataURL(d)); return { success: true }; } catch (e) { return { error: e.message }; } });

    // NEW: Clipboard File Handler
    ipcMain.handle('clipboard:write-files', (e, filePaths) => {
        try {
            if (!filePaths || filePaths.length === 0) return { error: 'No files' };

            // 1. Write plain text (fallback)
            clipboard.writeText(filePaths.join('\n'));

            // 2. Platform specific
            if (process.platform === 'darwin') {
                // macOS: NSFilenamesPboardType (Property List)
                const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
    ${filePaths.map(p => `<string>${p}</string>`).join('\n')}
</array>
</plist>`;
                clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist));
            } else if (process.platform === 'linux') {
                // Linux: text/uri-list
                const uriList = filePaths.map(p => `file://${p}`).join('\r\n');
                clipboard.writeBuffer('text/uri-list', Buffer.from(uriList));
            } else if (process.platform === 'win32') {
                // Windows: Not easily supported via Electron's clipboard API directly for files without native module
                // But writing file paths as text often works for some apps, or we rely on the text fallback.
            }

            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });

    ipcMain.handle('project:read-dir', async (e, p) => { try { return (await fs.promises.readdir(p, { withFileTypes: true })).filter(i => !['.git', '.DS_Store'].includes(i.name)).map(i => ({ name: i.name, isDirectory: i.isDirectory(), path: path.join(p, i.name) })).sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1)); } catch (e) { return null; } });
    ipcMain.handle('project:read-file', async (e, p) => { try { return await fs.promises.readFile(p, 'utf8'); } catch (err) { return { error: err.message }; } });
    ipcMain.handle('project:write-file', async (e, p, c) => {
        try {
            const dir = path.dirname(p);
            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(p, c, 'utf8');
            return { success: true };
        } catch (err) {
            return { error: err.message };
        }
    });
    ipcMain.handle('project:search-text', async (e, rootPath, query) => {
        try {
            const results = [];
            const searchRecursive = async (dir) => {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (['node_modules', '.git', 'dist', 'build', '.DS_Store'].includes(entry.name)) continue;
                        await searchRecursive(fullPath);
                    } else if (entry.isFile()) {
                        // Simple text search
                        try {
                            const content = await fs.promises.readFile(fullPath, 'utf8');
                            if (content.includes(query)) {
                                // Find line number and snippet
                                const lines = content.split('\n');
                                lines.forEach((line, index) => {
                                    if (line.includes(query)) {
                                        results.push({
                                            filePath: path.relative(rootPath, fullPath),
                                            line: index + 1,
                                            content: line.trim()
                                        });
                                    }
                                });
                            }
                        } catch (err) {
                            // Ignore binary or unreadable files
                        }
                    }
                }
            };
            await searchRecursive(rootPath);
            return results.slice(0, 50); // Limit results
        } catch (err) {
            return { error: err.message };
        }
    });

    // NEW: Run Command Handler
    ipcMain.handle('project:run-command', async (event, cmd, cwd) => {
        return new Promise((resolve) => {
            // Default to home dir if no cwd provided, but ideally should be project root
            // The renderer should pass the project root
            const options = { cwd: cwd || os.homedir(), maxBuffer: 1024 * 1024 * 10 }; // 10MB buffer

            exec(cmd, options, (error, stdout, stderr) => {
                resolve({
                    stdout: stdout || '',
                    stderr: stderr || '',
                    error: error ? error.message : null,
                    exitCode: error ? error.code : 0
                });
            });
        });
    });
    ipcMain.handle('project:read-asset-base64', async (e, r) => { try { const c = await fs.promises.readFile(path.join(__dirname, r)); return `data:image/svg+xml;base64,${c.toString('base64')}`; } catch (err) { return null; } });

    // --- LOGGING ---
    ipcMain.on('log', (event, ...args) => console.log('[Renderer]', ...args));

    // --- DIALOG HANDLERS ---
    ipcMain.handle('dialog:open-file', async (event, options) => {
        const { dialog } = require('electron');
        return await dialog.showOpenDialog(options);
    });

    ipcMain.handle('dialog:openFile', async (event) => {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
            properties: ['openFile', 'multiSelections']
        });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0]; // Return single path for now to match select-image behavior
    });

    // --- GIT CHECKPOINT HANDLERS ---
    const { exec } = require('child_process');

    ipcMain.handle('git:create-checkpoint', async (event, rootPath, messageId) => {
        return new Promise((resolve) => {
            if (!rootPath || !fs.existsSync(path.join(rootPath, '.git'))) {
                resolve({ error: 'Not a git repository' });
                return;
            }

            // 1. Add all changes
            exec('git add .', { cwd: rootPath }, (err) => {
                if (err) {
                    resolve({ error: `Git Add Failed: ${err.message}` });
                    return;
                }

                // 2. Commit
                const commitMsg = `Peak Checkpoint: ${messageId}`;
                exec(`git commit -m "${commitMsg}"`, { cwd: rootPath }, (err, stdout) => {
                    if (err) {
                        // If nothing to commit, that's fine, return current HEAD
                        if (stdout.includes('nothing to commit')) {
                            exec('git rev-parse HEAD', { cwd: rootPath }, (e, hash) => {
                                resolve({ hash: hash.trim() });
                            });
                            return;
                        }
                        resolve({ error: `Git Commit Failed: ${err.message}` });
                        return;
                    }

                    // 3. Get Hash
                    exec('git rev-parse HEAD', { cwd: rootPath }, (e, hash) => {
                        resolve({ hash: hash.trim() });
                    });
                });
            });
        });
    });

    ipcMain.handle('git:revert-to-checkpoint', async (event, rootPath, hash) => {
        return new Promise((resolve) => {
            if (!rootPath || !hash) {
                resolve({ error: 'Invalid parameters' });
                return;
            }

            // Hard Reset
            console.log(`[Main] Reverting to checkpoint: ${hash} in ${rootPath}`);
            exec(`git reset --hard ${hash}`, { cwd: rootPath }, (err, stdout, stderr) => {
                if (err) {
                    console.error(`[Main] Git Reset Failed: ${err.message}`);
                    resolve({ error: `Git Reset Failed: ${err.message}` });
                } else {
                    // Also clean untracked files to ensure full revert
                    exec('git clean -fd', { cwd: rootPath }, (cleanErr, cleanStdout, cleanStderr) => {
                        if (cleanErr) {
                            console.warn(`[Main] Git Clean Failed (non-fatal): ${cleanErr.message}`);
                        }
                        console.log(`[Main] Git Reset & Clean Success. Reset Output: ${stdout}, Clean Output: ${cleanStdout}`);
                        resolve({ success: true });
                    });
                }
            });
        });
    });
    // -------------------------------

    // --- PROJECT CONTEXT HANDLERS ---
    ipcMain.handle('get-project-files', async (event, rootPath) => {
        if (!rootPath) return [];
        const fileList = [];

        async function scan(dir) {
            try {
                const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const dirent of dirents) {
                    const res = path.resolve(dir, dirent.name);
                    if (dirent.isDirectory()) {
                        if (['node_modules', '.git', 'dist', 'build', '.DS_Store', '.idea', '.vscode'].includes(dirent.name)) continue;
                        await scan(res);
                    } else {
                        if (['.DS_Store', 'package-lock.json', 'yarn.lock'].includes(dirent.name)) continue;
                        // Calculate relative path for cleaner context
                        fileList.push(path.relative(rootPath, res));
                    }
                }
            } catch (e) {
                console.error(`[Main] Error scanning ${dir}:`, e);
            }
        }

        await scan(rootPath);
        return fileList;
    });
    // --------------------------------

    ipcMain.handle('project:get-file-tree', async (event, rootPath) => {
        if (!rootPath) return { error: 'No root path provided' };

        async function getDirectoryTree(dir) {
            const name = path.basename(dir);
            const item = { name, path: dir, type: 'directory', children: [] };

            try {
                const dirents = await fs.promises.readdir(dir, { withFileTypes: true });

                // Sort: Directories first, then files
                dirents.sort((a, b) => {
                    if (a.isDirectory() && !b.isDirectory()) return -1;
                    if (!a.isDirectory() && b.isDirectory()) return 1;
                    return a.name.localeCompare(b.name);
                });

                for (const dirent of dirents) {
                    const fullPath = path.join(dir, dirent.name);

                    // Ignore common patterns
                    if (['node_modules', '.git', 'dist', 'build', '.DS_Store', '.idea', '.vscode'].includes(dirent.name)) continue;

                    if (dirent.isDirectory()) {
                        const child = await getDirectoryTree(fullPath);
                        item.children.push(child);
                    } else {
                        item.children.push({
                            name: dirent.name,
                            path: fullPath,
                            type: 'file'
                        });
                    }
                }
            } catch (e) {
                console.error(`[Main] Error scanning ${dir}:`, e);
                item.error = e.message;
            }
            return item;
        }

        return await getDirectoryTree(rootPath);
    });

    ipcMain.on('llm-stream-request', async (event, sId, mId, msgs) => {
        const apiKey = settingsStore.get('openrouterApiKey');
        if (!apiKey) {
            event.sender.send('llm-stream-data', sId, { type: 'error', message: 'API Key missing' });
            return;
        }
        try {
            console.log(`[Main] Starting stream for model: ${mId}`);
            const stream = await openrouterService.streamChatCompletion(mId, msgs, apiKey, 'peak', 'Peak');

            stream.on('data', c => {
                const chunkStr = c.toString();
                // console.log('[Main] Raw Chunk:', chunkStr); // Uncomment for verbose debug

                const lines = chunkStr.split('\n').filter(l => l.trim() !== '');

                for (const line of lines) {
                    if (line.startsWith(':')) continue; // Ignore OpenRouter keep-alive/status messages
                    const msg = line.replace(/^data: /, '');
                    if (msg === '[DONE]') {
                        console.log('[Main] Stream received [DONE]');
                        event.sender.send('llm-stream-data', sId, { type: 'end' });
                        return;
                    }
                    try {
                        const p = JSON.parse(msg);
                        const content = p.choices[0]?.delta?.content || '';
                        if (content) {
                            // console.log('[Main] Content:', content);
                            event.sender.send('llm-stream-data', sId, { type: 'data', content: content });
                        }
                    } catch (e) {
                        console.error('[Main] JSON Parse Error:', e.message, 'Line:', line);
                    }
                }
            });

            stream.on('end', () => {
                console.log('[Main] Stream ended');
                event.sender.send('llm-stream-data', sId, { type: 'end' });
            });

            stream.on('error', e => {
                console.error('[Main] Stream error:', e);
                event.sender.send('llm-stream-data', sId, { type: 'error', message: e.message });
            });

        } catch (e) {
            console.error('[Main] Request setup error:', e);
            event.sender.send('llm-stream-data', sId, { type: 'error', message: e.message });
        }
    });
    ipcMain.on('save-whiteboard-data', (e, id, d, t) => { if (mainWindow) mainWindow.webContents.send('whiteboard-save-data', Number(id), d, t); });
    ipcMain.on('show-inspector-context-menu', (e, { type, id }) => { Menu.buildFromTemplate([{ label: 'Delete', click: () => e.sender.send('delete-inspector-item', { type, id }) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.on('show-whiteboard-context-menu', (e, d) => { Menu.buildFromTemplate([{ label: 'Delete', click: () => e.sender.send('whiteboard-action', { action: 'delete', ...d }) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.on('show-kanban-context-menu', (e, d) => { Menu.buildFromTemplate([{ label: 'Delete Task', click: () => e.sender.send('kanban-action', { action: 'delete', ...d }) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.on('show-problem-context-menu', (event, textToCopy) => { const template = [{ label: 'Copy', click: () => clipboard.writeText(textToCopy) }]; Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) }); });

    ipcMain.on('show-terminal-context-menu', (event, { id, hasSelection }) => {
        const template = [
            { label: 'Copy', enabled: hasSelection, click: () => event.sender.send('terminal-context-action', { action: 'copy', id }) },
            { label: 'Paste', click: () => event.sender.send('terminal-context-action', { action: 'paste', id }) },
            { type: 'separator' },
            { label: 'Clear', click: () => event.sender.send('terminal-context-action', { action: 'clear', id }) },
            { type: 'separator' },
            { label: 'Kill Terminal', click: () => event.sender.send('terminal-context-action', { action: 'kill', id }) }
        ];
        Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });

    ipcMain.on('show-webview-context-menu', (event, params) => {
        const { tabId, canGoBack, canGoForward, selectionText, mediaType, srcURL } = params;
        const template = [
            { label: 'Back', enabled: canGoBack, click: () => event.sender.send('webview-context-action', { action: 'back', tabId }) },
            { label: 'Forward', enabled: canGoForward, click: () => event.sender.send('webview-context-action', { action: 'forward', tabId }) },
            { label: 'Reload', click: () => event.sender.send('webview-context-action', { action: 'reload', tabId }) },
            { type: 'separator' },
            { label: 'Cut', role: 'cut' },
            { label: 'Copy', role: 'copy', enabled: !!selectionText },
            { label: 'Paste', role: 'paste' },
            { type: 'separator' },
            { label: 'Inspect Element', click: () => event.sender.send('webview-context-action', { action: 'inspect', tabId, x: params.x, y: params.y }) }
        ];

        if (mediaType === 'image' && srcURL) {
            template.splice(3, 0,
                { type: 'separator' },
                { label: 'Save Image As...', click: () => event.sender.send('webview-context-action', { action: 'save-image', tabId, url: srcURL }) }
            );
        }

        Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });
    ipcMain.on('will-swap-content', () => { ignoreBlur = true; });
    ipcMain.on('did-finish-content-swap', () => { setTimeout(() => { ignoreBlur = false; }, 300); });
    ipcMain.on('open-settings-window', () => createSettingsWindow());
    ipcMain.handle('get-all-settings', () => { const s = settingsStore.store; s.openrouterApiKey = s.openrouterApiKey ? '*****' : null; return s; });
    ipcMain.on('toggle-dock-visibility', (e, v) => { settingsStore.set('isDockVisible', v); if (process.platform === 'darwin') app.setActivationPolicy(v ? 'regular' : 'accessory'); });
    ipcMain.on('toggle-level', (e, f) => { settingsStore.set('isFloating', f); if (mainWindow) { mainWindow.setAlwaysOnTop(f, 'floating'); mainWindow.setLevel(f ? 'floating' : 'normal'); } });
    ipcMain.on('show-block-context-menu', (e, d) => { Menu.buildFromTemplate([{ label: 'Delete Block', click: () => e.sender.send('delete-block-command', d) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.handle('select-image', async () => { const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico'] }] }); return canceled ? null : filePaths; });
    ipcMain.on('terminal-create', (e, id, cwd) => { if (!pty) return; if (ptyProcesses[id]) try { ptyProcesses[id].kill(); } catch (e) { } try { const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash'); const proc = pty.spawn(shell, [], { name: 'xterm-256color', cols: 80, rows: 30, cwd: cwd || os.homedir(), env: process.env }); ptyProcesses[id] = proc; proc.on('data', d => { if (mainWindow) mainWindow.webContents.send('terminal-data', id, d); }); proc.on('exit', () => delete ptyProcesses[id]); } catch (err) { console.error(err); } });
    ipcMain.on('terminal-write', (e, id, d) => { if (ptyProcesses[id]) ptyProcesses[id].write(d); });
    ipcMain.on('terminal-resize', (e, id, s) => { if (ptyProcesses[id]) try { ptyProcesses[id].resize(s.cols, s.rows); } catch (e) { } });
    ipcMain.on('terminal-kill', (e, id) => { if (ptyProcesses[id]) try { ptyProcesses[id].kill(); } catch (e) { } delete ptyProcesses[id]; });
    ipcMain.on('save-api-key', (e, k) => { settingsStore.set('openrouterApiKey', k); process.env.OPENROUTER_API_KEY = k; });
    ipcMain.on('update-hotkey', (e, k) => { settingsStore.set('hotkey', k); registerHotKey(); });
    ipcMain.handle('project:show-save-dialog', async (e, d) => { const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: d }); return canceled ? null : filePath; });
    ipcMain.handle('project:open-dialog', async () => { const { filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return filePaths[0]; });
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') { const v = settingsStore.get('isDockVisible', false); app.setActivationPolicy(v ? 'regular' : 'accessory'); }
    createTray(); registerHotKey(); createWindow(); setupIpcHandlers();
});
app.on('will-quit', () => globalShortcut.unregisterAll());