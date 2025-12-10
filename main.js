const { app, BrowserWindow, Tray, globalShortcut, ipcMain, dialog, Menu, shell, clipboard, nativeImage, protocol } = require('electron');

// Register custom protocol privileges
protocol.registerSchemesAsPrivileged([
    { scheme: 'vscode-resource', privileges: { secure: true, standard: true, supportFetchAPI: true, corsEnabled: true } }
]);
const path = require('path');
const os = require('os');
const fs = require('fs');
const dotenv = require('dotenv');
const { pathToFileURL } = require('url');
const { ESLint } = require('eslint');
const mime = require('mime-types');
const Store = require('electron-store');
const { exec } = require('child_process');
const { killProcessTree } = require('./src/utils/process-utils');

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
const mcpHost = require('./src/services/MCPHost');
const ExtensionHost = require('./src/services/ExtensionHost');
const ExtensionLoader = require('./src/services/ExtensionLoader');

const { setupIpcHandlers } = require('./src/main/ipc');

// Initialize extension system
const state = {
    extensionHost: null,
    extensionLoader: null,
    ptyProcesses: {},
    activeProjectWatcher: null,
    ignoreBlur: false,
    activeExecProcesses: new Set(), // Track active exec processes for cleanup
    currentProject: null // Track current project root for AI tools
};

let tray, mainWindow, settingsWindow;
const WINDOW_WIDTH = 1024;
const WINDOW_HEIGHT = 768;

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

    // --- NEW: Cleanup on Reload/Navigation ---
    // --- NEW: Cleanup on Reload/Navigation ---
    mainWindow.webContents.on('did-start-navigation', (event) => {
        if (!event.isMainFrame || event.isSameDocument) return;

        console.log('[Main] Main window navigating, cleaning up processes...');

        // Kill PTYs
        Object.keys(state.ptyProcesses).forEach(id => {
            const proc = state.ptyProcesses[id];
            if (proc) {
                try {
                    console.log(`[Main] Killing PTY process ${id} (PID: ${proc.pid})`);
                    killProcessTree(proc.pid);
                } catch (e) { console.error(`[Main] Failed to kill PTY ${id}:`, e); }
            }
        });
        state.ptyProcesses = {}; // Clear state

        // Kill Exec Processes
        state.activeExecProcesses.forEach(proc => {
            try {
                if (proc && proc.pid) {
                    console.log(`[Main] Killing exec process (PID: ${proc.pid})`);
                    killProcessTree(proc.pid);
                }
            } catch (e) { console.error('[Main] Failed to kill exec process:', e); }
        });
        state.activeExecProcesses.clear();
    });
    // -----------------------------------------

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
    mainWindow.on('blur', () => { if (state.ignoreBlur) return; if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) hideWindow(); });
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
    if (mainWindow.isVisible() && mainWindow.isFocused()) {
        hideWindow();
    } else {
        state.ignoreBlur = true;
        if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(true);
        mainWindow.show();
        mainWindow.focus();
        app.focus({ steal: true });
        setTimeout(() => { state.ignoreBlur = false; }, 150);
    }
}

function registerHotKey() {
    globalShortcut.unregisterAll();
    const currentHotkey = settingsStore.get('hotkey', 'Control+Space');
    globalShortcut.register(currentHotkey, () => toggleWindow());
}

app.whenReady().then(() => {
    if (process.platform === 'darwin') {
        const v = settingsStore.get('isDockVisible', false);
        app.setActivationPolicy(v ? 'regular' : 'accessory');
    }

    // Register vscode-resource protocol
    protocol.registerFileProtocol('vscode-resource', (request, callback) => {
        // Handle vscode-resource:// and vscode-resource: (some environments strip slashes)
        const url = request.url.replace(/^vscode-resource:(\/\/)?/, '');
        const decodedUrl = decodeURIComponent(url);
        console.log('[Main] vscode-resource request:', request.url, '->', decodedUrl);
        try {
            return callback(decodedUrl);
        } catch (error) {
            console.error('[Main] Failed to handle vscode-resource request:', error);
        }
    });

    createTray();
    registerHotKey();
    createWindow();
    setupIpcHandlers({
        settingsStore,
        pty,
        openrouterService,
        mcpHost,
        ExtensionHost,
        ExtensionLoader,
        getMainWindow: () => mainWindow,
        createSettingsWindow,
        registerHotKey,
        state
    });

    // Listen for project root updates from renderer
    ipcMain.on('update-project-root', (event, projectRoot) => {
        console.log('[Main] Project root updated:', projectRoot);
        state.currentProject = projectRoot;
    });

    // Initialize Extensions on Startup
    if (!state.extensionHost) {
        state.extensionHost = new ExtensionHost();
        state.extensionLoader = new ExtensionLoader();
        global.mainWindow = mainWindow;

        state.extensionHost.loadAllExtensions().then(() => {
            console.log('[Main] Extensions ready');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('extensions:ready');
            }
        }).catch(err => console.error('[Main] Failed to load extensions:', err));
    }
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();

    // Kill all PTY processes to prevent orphaned processes (like localhost servers)
    console.log('[Main] Cleaning up PTY processes...');
    Object.keys(state.ptyProcesses).forEach(id => {
        const proc = state.ptyProcesses[id];
        if (proc) {
            try {
                console.log(`[Main] Killing PTY process ${id} (PID: ${proc.pid})`);
                killProcessTree(proc.pid);
            } catch (e) {
                console.error(`[Main] Failed to kill PTY process ${id}:`, e);
            }
        }
    });

    // Kill all active Exec processes
    console.log('[Main] Cleaning up Exec processes...');
    state.activeExecProcesses.forEach(proc => {
        try {
            if (proc && proc.pid) {
                console.log(`[Main] Killing exec process (PID: ${proc.pid})`);
                killProcessTree(proc.pid);
            }
        } catch (e) { console.error('[Main] Failed to kill exec process:', e); }
    });

    // Terminate Extension Host (and LSP servers)
    if (state.extensionHost) {
        try {
            console.log('[Main] Terminating Extension Host...');
            state.extensionHost.terminate();
        } catch (e) {
            console.error('[Main] Failed to terminate ExtensionHost:', e);
        }
    }

    // Terminate MCP Host
    if (mcpHost) {
        try {
            console.log('[Main] Terminating MCP Host...');
            mcpHost.terminate();
        } catch (e) {
            console.error('[Main] Failed to terminate MCPHost:', e);
        }
    }
});