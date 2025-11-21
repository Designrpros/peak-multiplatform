// src/main.js
const { app, BrowserWindow, Tray, globalShortcut, screen, ipcMain, session, dialog, Menu, shell } = require('electron');
const { nativeImage, clipboard } = require('electron'); 
const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { pathToFileURL } = require('url'); 
const mime = require('mime-types'); 
dotenv.config();

const Store = require('electron-store');
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
        width: WINDOW_WIDTH, height: WINDOW_HEIGHT, show: false, frame: false, skipTaskbar: true, fullscreenable: false, type: 'panel',
        alwaysOnTop: isFloating, collectionBehavior: ['canJoinAllSpaces'], level: isFloating ? 'floating' : 'normal', 
        allowsBackForwardNavigationGestures: true, resizable: true, 
        webPreferences: { nodeIntegration: true, contextIsolation: false, webviewTag: true, scrollBounce: true }
    });
    mainWindow.loadFile('index.html');
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.on('blur', () => {
        if (ignoreBlur) return;
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) hideWindow();
    });
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
    const iconPath = path.join(__dirname, 'assets', 'Peak-icon.png'); 
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
    tray.on('click', (event, bounds) => {
        if (!mainWindow || mainWindow.isDestroyed()) createWindow(); 
        ignoreBlur = true;
        const { x, y } = getWindowPosition(bounds);
        if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(true);
        app.focus({ steal: true }); 
        mainWindow.setPosition(x, y);
        mainWindow.show();
        mainWindow.focus(); 
        setTimeout(() => { ignoreBlur = false; }, 250); 
    });
}

function getTargetDisplay(pointOrBounds) {
    if (pointOrBounds) return screen.getDisplayMatching(pointOrBounds);
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function getWindowPosition(pointOrBounds) {
    if (!mainWindow) return { x: 0, y: 0 };
    const [w, h] = mainWindow.getSize();
    const currentDisplay = getTargetDisplay(pointOrBounds);
    const displayWorkArea = currentDisplay.workArea;
    let idealX = pointOrBounds ? Math.round(pointOrBounds.x + (pointOrBounds.width / 2) - (w / 2)) : Math.round(displayWorkArea.x + (displayWorkArea.width / 2) - (w / 2));
    let idealY = pointOrBounds ? Math.round(pointOrBounds.y + pointOrBounds.height + 4) : Math.round(displayWorkArea.y + (displayWorkArea.height / 2) - (h / 2));
    const finalX = Math.round(Math.min(displayWorkArea.x + displayWorkArea.width - w, Math.max(displayWorkArea.x, idealX)));
    const finalY = Math.round(Math.min(displayWorkArea.y + displayWorkArea.height - h, Math.max(displayWorkArea.y, idealY)));
    return { x: finalX, y: finalY };
}

function toggleWindow() {
    if (!mainWindow) return;
    if (mainWindow.isVisible() && mainWindow.isFocused()) { hideWindow(); } else {
        ignoreBlur = true; 
        if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(true);
        app.focus({ steal: true });
        mainWindow.show();
        mainWindow.focus(); 
        setTimeout(() => { ignoreBlur = false; }, 250); 
    }
}

function registerHotKey() {
    globalShortcut.unregisterAll(); 
    const currentHotkey = settingsStore.get('hotkey', 'Control+Space');
    globalShortcut.register(currentHotkey, () => toggleWindow());
}

function setupIpcHandlers() {
    // --- FINDER HANDLERS ---
    
    ipcMain.handle('app:get-home-path', () => os.homedir());

    ipcMain.handle('app:open-path', async (event, targetPath) => {
        return shell.openPath(targetPath);
    });

    ipcMain.handle('finder:read-dir', async (event, dirPath) => {
        try {
            const dirents = await fs.promises.readdir(dirPath, { withFileTypes: true });
            const files = await Promise.all(dirents.map(async (dirent) => {
                if (['.git', '.DS_Store', 'node_modules'].includes(dirent.name)) return null;
                const fullPath = path.join(dirPath, dirent.name);
                try {
                    const stats = await fs.promises.stat(fullPath);
                    return {
                        name: dirent.name,
                        isDirectory: dirent.isDirectory(),
                        path: fullPath,
                        size: stats.size,
                        mtime: stats.mtime,
                        birthtime: stats.birthtime
                    };
                } catch (e) { return null; }
            }));
            
            return files.filter(f => f).sort((a, b) => {
                if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
                return a.isDirectory ? -1 : 1;
            });
        } catch (e) { return { error: e.message }; }
    });

    // -- NEW FINDER OPERATIONS --
    ipcMain.handle('finder:rename', async (e, oldPath, newPath) => {
        try { await fs.promises.rename(oldPath, newPath); return { success: true }; } 
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('finder:delete', async (e, targetPath) => {
        try { await shell.trashItem(targetPath); return { success: true }; } 
        catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('finder:create-folder', async (e, folderPath) => {
        try { await fs.promises.mkdir(folderPath); return { success: true }; } 
        catch (err) { return { error: err.message }; }
    });

    ipcMain.on('show-finder-context-menu', (event, fileData) => {
        const template = [];
        if (fileData) {
            template.push(
                { label: 'Open', click: () => event.sender.send('finder:ctx-open', fileData.path) },
                { type: 'separator' },
                { label: 'Rename', click: () => event.sender.send('finder:ctx-rename', fileData.path) },
                { label: 'Move to Trash', click: () => event.sender.send('finder:ctx-delete', fileData.path) },
                { type: 'separator' },
                { label: 'Copy Path', click: () => { clipboard.writeText(fileData.path); } }
            );
        } else {
            template.push(
                { label: 'New Folder', click: () => event.sender.send('finder:ctx-new-folder') },
                { label: 'Get Info', click: () => {} } 
            );
        }
        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });
    // -----------------------------

    ipcMain.on('project:watch', (event, projectPath) => {
        if (activeProjectWatcher) {
            try { activeProjectWatcher.close(); } catch(e) {}
            activeProjectWatcher = null;
        }
        if (!projectPath || !fs.existsSync(projectPath)) return;
        try {
            activeProjectWatcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
                if (filename && !filename.includes('.git') && !filename.includes('.DS_Store')) {
                    if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('project:files-changed', { eventType, filename });
                    }
                }
            });
        } catch (e) { console.error("Failed to watch:", e); }
    });

    ipcMain.handle('project:delete-path', async (event, itemPath) => {
        try { await shell.trashItem(itemPath); return { success: true }; } catch (e) { return { error: e.message }; }
    });

    ipcMain.on('show-project-context-menu', (event, { targetPath, isDirectory }) => {
        const template = [];
        if (targetPath) {
            template.push(
                { label: 'New File...', click: () => event.sender.send('project:ctx-new-file', targetPath) },
                { label: 'New Folder...', click: () => event.sender.send('project:ctx-new-folder', targetPath) },
                { type: 'separator' },
                { label: 'Rename', click: () => event.sender.send('project:ctx-rename', targetPath) },
                { type: 'separator' },
                { label: 'Delete', click: () => event.sender.send('project:ctx-delete', targetPath) } 
            );
        } else {
            template.push(
                { label: 'New File', click: () => event.sender.send('project:ctx-new-file', null) },
                { label: 'New Folder', click: () => event.sender.send('project:ctx-new-folder', null) }
            );
        }
        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });

    ipcMain.handle('read-file-as-data-url', async (event, filePath) => {
        try {
            await new Promise(resolve => setTimeout(resolve, 150)); 
            const stats = await fs.promises.stat(filePath);
            if (stats.size === 0) return { error: `File size is 0 bytes.` };
            const data = await fs.promises.readFile(filePath);
            let mimeType = mime.lookup(filePath) || 'application/octet-stream';
            return { buffer: { type: 'Buffer', data: Array.from(data) }, mimeType: mimeType };
        } catch (e) { return { error: e.message }; }
    });
    ipcMain.handle('clipboard:write-image-dataurl', (e, d) => { try { clipboard.writeImage(nativeImage.createFromDataURL(d)); return { success: true }; } catch (e) { return { error: e.message }; } });
    ipcMain.handle('path-to-file-uri', async (e, p) => { try { return pathToFileURL(p).href; } catch { return null; } });
    ipcMain.on('llm-stream-request', async (event, sessionId, modelId, messages) => {
        const apiKey = settingsStore.get('openrouterApiKey');
        if (!apiKey) { event.sender.send('llm-stream-data', sessionId, { type: 'error', message: 'API Key missing.' }); return; }
        try {
            const stream = await openrouterService.streamChatCompletion(modelId, messages, apiKey, 'peak-browser', 'Peak Browser');
            stream.on('data', (chunk) => {
                const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
                for (const line of lines) {
                    const message = line.replace(/^data: /, '');
                    if (message === '[DONE]') { event.sender.send('llm-stream-data', sessionId, { type: 'end' }); return; }
                    try {
                        const parsed = JSON.parse(message);
                        const content = parsed.choices[0]?.delta?.content || '';
                        if (content) event.sender.send('llm-stream-data', sessionId, { type: 'data', content });
                    } catch (e) { }
                }
            });
            stream.on('end', () => event.sender.send('llm-stream-data', sessionId, { type: 'end' }));
            stream.on('error', (err) => event.sender.send('llm-stream-data', sessionId, { type: 'error', message: err.message }));
        } catch (error) { event.sender.send('llm-stream-data', sessionId, { type: 'error', message: error.message }); }
    });
    ipcMain.on('save-whiteboard-data', (event, boardId, data, title) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('whiteboard-save-data', Number(boardId), data, title); });
    ipcMain.on('show-inspector-context-menu', (event, { type, id }) => { const m = Menu.buildFromTemplate([{ label: 'Delete', click: () => event.sender.send('delete-inspector-item', { type, id }) }]); m.popup({ window: BrowserWindow.fromWebContents(event.sender) }); });
    ipcMain.on('show-whiteboard-context-menu', (event, data) => {
        const template = [{ label: 'Copy', click: () => event.sender.send('whiteboard-action', { action: 'copy', ...data }) }, { label: 'Paste', click: () => event.sender.send('whiteboard-action', { action: 'paste', ...data }) }, { type: 'separator' }, { label: 'Group', click: () => event.sender.send('whiteboard-action', { action: 'group', ...data }) }, { label: 'Ungroup', click: () => event.sender.send('whiteboard-action', { action: 'ungroup', ...data }) }, { type: 'separator' }, { label: 'Bring Forward', click: () => event.sender.send('whiteboard-action', { action: 'bringForward', ...data }) }, { label: 'Send Backward', click: () => event.sender.send('whiteboard-action', { action: 'sendBackwards', ...data }) }, { label: 'Bring to Front', click: () => event.sender.send('whiteboard-action', { action: 'bringToFront', ...data }) }, { label: 'Send to Back', click: () => event.sender.send('whiteboard-action', { action: 'sendToBack', ...data }) }, { type: 'separator' }, { label: 'Copy as PNG', click: () => event.sender.send('whiteboard-action', { action: 'copyPng', ...data }) }, { type: 'separator' }, { label: 'Delete', click: () => event.sender.send('whiteboard-action', { action: 'delete', ...data }) }];
        const menu = Menu.buildFromTemplate(template); menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });
    ipcMain.on('show-kanban-context-menu', (event, data) => { const m = Menu.buildFromTemplate([{ label: 'Delete Task', click: () => event.sender.send('kanban-action', { action: 'delete', ...data }) }, { type: 'separator' }, { label: 'Cycle Color Tag', click: () => event.sender.send('kanban-action', { action: 'cycle-color', ...data }) }]); m.popup({ window: BrowserWindow.fromWebContents(event.sender) }); });
    ipcMain.on('will-swap-content', () => { ignoreBlur = true; });
    ipcMain.on('did-finish-content-swap', () => { setTimeout(() => { ignoreBlur = false; }, 300); });
    ipcMain.on('open-settings-window', () => createSettingsWindow());
    ipcMain.handle('get-all-settings', () => { const s = settingsStore.store; s.openrouterApiKey = s.openrouterApiKey ? '*****' : null; return s; });
    ipcMain.on('toggle-dock-visibility', (e, v) => { settingsStore.set('isDockVisible', v); if (process.platform === 'darwin') app.setActivationPolicy(v ? 'regular' : 'accessory'); });
    ipcMain.on('toggle-level', (e, isFloating) => { settingsStore.set('isFloating', isFloating); if (mainWindow) { mainWindow.setAlwaysOnTop(isFloating, 'floating'); mainWindow.setLevel(isFloating ? 'floating' : 'normal'); } });
    ipcMain.on('show-block-context-menu', (event, { noteId, blockId }) => { const m = Menu.buildFromTemplate([{ label: 'Delete Block', click: () => event.sender.send('delete-block-command', { noteId, blockId }) }, { type: 'separator' }, { role: 'copy' }, { role: 'cut' }]); m.popup({ window: BrowserWindow.fromWebContents(event.sender) }); });
    ipcMain.handle('select-image', async () => { const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'png', 'gif', 'jpeg', 'webp', 'svg', 'bmp', 'ico', 'tif', 'tiff'] }] }); return canceled ? null : filePaths; });
    ipcMain.on('terminal-create', (event, id, cwd) => { if (!pty) return; const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash'); const targetCwd = cwd || os.homedir(); if (ptyProcesses[id]) { try { ptyProcesses[id].kill(); } catch(e) {} delete ptyProcesses[id]; } try { const ptyProcess = pty.spawn(shell, [], { name: 'xterm-256color', cols: 80, rows: 30, cwd: targetCwd, env: process.env }); ptyProcesses[id] = ptyProcess; ptyProcess.on('data', (data) => { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('terminal-data', id, data); }); ptyProcess.on('exit', () => { delete ptyProcesses[id]; }); } catch (e) { console.error("Terminal create failed:", e); } });
    ipcMain.on('terminal-write', (e, id, d) => { if (ptyProcesses[id]) ptyProcesses[id].write(d); });
    ipcMain.on('terminal-resize', (e, id, s) => { if (ptyProcesses[id]) { try { ptyProcesses[id].resize(s.cols, s.rows); } catch(e) {} } });
    ipcMain.on('terminal-kill', (e, id) => { if (ptyProcesses[id]) { try { ptyProcesses[id].kill(); } catch(e) {} delete ptyProcesses[id]; } });
    ipcMain.on('save-api-key', (e, k) => { settingsStore.set('openrouterApiKey', k); process.env.OPENROUTER_API_KEY = k; });
    ipcMain.on('update-hotkey', (e, k) => { settingsStore.set('hotkey', k); registerHotKey(); });
    ipcMain.handle('project:show-save-dialog', async (e, d, f) => { const w = BrowserWindow.fromWebContents(e.sender) || mainWindow; const { canceled, filePath } = await dialog.showSaveDialog(w, { defaultPath: d, properties: f ? ['createDirectory'] : [] }); return canceled ? null : filePath; });
    ipcMain.handle('project:open-dialog', async () => { const { filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return filePaths[0]; });
    ipcMain.handle('project:read-dir', async (e, p) => { try { return (await fs.promises.readdir(p, { withFileTypes: true })).filter(i => !['.git', '.DS_Store'].includes(i.name)).map(i => ({ name: i.name, isDirectory: i.isDirectory(), path: path.join(p, i.name) })).sort((a,b) => (a.isDirectory===b.isDirectory?0:a.isDirectory?-1:1)); } catch (e) { return null; } });
    ipcMain.handle('project:read-file', async (e, p) => { try { return await fs.promises.readFile(p, 'utf8'); } catch (err) { return { error: err.message }; } });
    ipcMain.handle('project:write-file', async (e, p, c, enc) => { try { await fs.promises.writeFile(p, c, enc || 'utf8'); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.handle('project:create-file', async (e, p) => { try { await fs.promises.writeFile(p, '', 'utf8'); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.handle('project:create-dir', async (e, p) => { try { await fs.promises.mkdir(p, { recursive: true }); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.handle('project:move-file', async (e, o, n) => { try { await fs.promises.rename(o, n); return { success: true }; } catch (err) { return { error: err.message }; } });
    ipcMain.handle('project:read-asset-base64', async (e, r) => { try { const c = await fs.promises.readFile(path.join(__dirname, r)); return `data:image/svg+xml;base64,${c.toString('base64')}`; } catch (err) { return null; } });
}

app.whenReady().then(() => { 
    if (process.platform === 'darwin') { const isDockVisible = settingsStore.get('isDockVisible', false); app.setActivationPolicy(isDockVisible ? 'regular' : 'accessory'); }
    createTray(); registerHotKey(); createWindow(); setupIpcHandlers();
    process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
});
app.on('will-quit', () => globalShortcut.unregisterAll());