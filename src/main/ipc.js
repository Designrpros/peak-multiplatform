const { ipcMain, dialog, Menu, shell, clipboard, nativeImage, BrowserWindow, app } = require('electron');
const { killProcessTree } = require('../utils/process-utils');
const path = require('path');
const os = require('os');
const fs = require('fs');
const mime = require('mime-types');
const { exec } = require('child_process');
const { ESLint } = require('eslint');

function setupIpcHandlers(context) {
    const {
        settingsStore,
        pty,
        openrouterService,
        mcpHost,
        ExtensionHost,
        ExtensionLoader,
        getMainWindow,
        createSettingsWindow,
        registerHotKey,
        state // { extensionHost, extensionLoader, ptyProcesses, activeProjectWatcher, ignoreBlur }
    } = context;

    // Helper to get mainWindow safely
    const mainWindow = getMainWindow();

    // --- SETTINGS HANDLERS ---
    ipcMain.handle('get-settings', () => settingsStore.store);
    ipcMain.handle('update-settings', (event, newSettings) => {
        settingsStore.set(newSettings);
        if (newSettings.hotkey) registerHotKey();

        // Notify windows of settings change
        const mw = getMainWindow();
        if (mw && !mw.isDestroyed()) mw.webContents.send('settings-updated', settingsStore.store);

        return true;
    });

    // --- MCP HANDLERS ---
    ipcMain.handle('mcp:connect-dynamic', async (event, config) => {
        try {
            const results = {};
            // Fix path to mcp-catalog relative to this file
            const catalog = require('../components/AIAssistant/data/mcp-catalog');
            console.log('[Main] MCP Catalog:', JSON.stringify(catalog.map(s => s.id)));

            for (const server of catalog) {
                const serverConfig = config[server.id];
                const isEnabled = serverConfig ? serverConfig.enabled : (server.id === 'filesystem');

                if (isEnabled) {
                    try {
                        const env = { ...process.env };
                        if (server.requiresKey && serverConfig.key) {
                            env[server.keyName] = serverConfig.key;
                        }

                        let args = [];
                        if (server.binary) {
                            args = ['-y', '--package', server.npm, server.binary];
                        } else {
                            args = ['-y', server.npm];
                        }
                        if (server.args) {
                            server.args.forEach(arg => {
                                if (arg === '[homedir]') args.push(os.homedir());
                                else args.push(arg);
                            });
                        }

                        await mcpHost.connectToServer(server.id, 'npx', args, env);
                        results[server.id] = true;
                    } catch (e) {
                        console.error(`Failed to connect to ${server.id}:`, e);
                        results[server.id] = e.message;
                    }
                }
            }

            return { success: true, results };
        } catch (e) {
            console.error("MCP Dynamic Connect Error:", e);
            return { error: e.message };
        }
    });

    ipcMain.handle('mcp:get-server-status', () => {
        return mcpHost.getServerStatus();
    });

    ipcMain.handle('mcp:get-tools', async () => {
        return await mcpHost.getAllTools();
    });

    ipcMain.handle('mcp:execute-tool', async (e, serverId, toolName, args) => {
        // Auto-connect filesystem if missing (Robustness Fix)
        if (serverId === 'filesystem' && !mcpHost.connections.has('filesystem')) {
            console.log('[Main] Filesystem server not connected. Auto-connecting...');
            try {
                const catalog = require('../components/AIAssistant/data/mcp-catalog');
                const fsServer = catalog.find(s => s.id === 'filesystem');
                if (fsServer) {
                    const env = { ...process.env };
                    let cmdArgs = ['-y', fsServer.npm];
                    if (fsServer.args) {
                        fsServer.args.forEach(arg => {
                            if (arg === '[homedir]') cmdArgs.push(os.homedir());
                            else cmdArgs.push(arg);
                        });
                    }
                    await mcpHost.connectToServer('filesystem', 'npx', cmdArgs, env);
                }
            } catch (err) {
                console.error('[Main] Failed to auto-connect filesystem:', err);
            }
        }

        const result = await mcpHost.callTool(serverId, toolName, args);
        return result;
    });

    //  --- EXTENSION SYSTEM HANDLERS ---
    ipcMain.handle('extensions:init', async () => {
        try {
            if (!state.extensionHost) {
                state.extensionHost = new ExtensionHost();
                state.extensionLoader = new ExtensionLoader();

                // Make mainWindow globally accessible for VSCode API
                global.mainWindow = getMainWindow();

                // Load all installed extensions
                const extensions = await state.extensionHost.loadAllExtensions();

                console.log('[Main] Extension system initialized');
                return { success: true, extensions: extensions.length };
            }
            return { success: true, already: true };
        } catch (err) {
            console.error('[Main] Failed to initialize extensions:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:list', async () => {
        try {
            if (!state.extensionHost) {
                return [];
            }

            const extensions = state.extensionHost.getExtensions();
            return extensions.map(ext => ({
                id: ext.id,
                name: ext.manifest.displayName || ext.manifest.name,
                publisher: ext.manifest.publisher,
                displayPublisher: ext.manifest.displayPublisher,
                version: ext.manifest.version,
                description: ext.manifest.description,
                isActive: ext.isActive,
                isBundled: ext.isBundled,
                icon: ext.manifest.icon ? `file://${path.join(ext.extensionPath, ext.manifest.icon)}` : null,
                categories: ext.manifest.categories || [],
                activationEvents: ext.manifest.activationEvents || [],
                isDisabled: !!ext.isDisabled
            }));
        } catch (err) {
            console.error('[Main] Failed to list extensions:', err);
            return [];
        }
    });

    ipcMain.handle('extensions:get-bundled-registry', async () => {
        try {
            if (!state.extensionHost) return [];
            return state.extensionHost.getBundledRegistry();
        } catch (err) {
            console.error('[Main] Failed to get bundled registry:', err);
            return [];
        }
    });

    ipcMain.handle('extensions:install-bundled', async (event, extensionId) => {
        try {
            if (!state.extensionHost) return { error: 'Extension host not initialized' };
            await state.extensionHost.installBundledExtension(extensionId);
            // Reload extensions to pick up the new one
            await state.extensionHost.loadAllExtensions();
            return { success: true };
        } catch (err) {
            console.error('[Main] Failed to install bundled extension:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:install-vsix', async (event, vsixPath) => {
        try {
            console.log('[Main] Installing extension from:', vsixPath);

            if (!state.extensionLoader) {
                state.extensionLoader = new ExtensionLoader();
            }

            const { id, path: extPath, manifest } = await state.extensionLoader.installFromVSIX(vsixPath);

            if (state.extensionHost) {
                await state.extensionHost.loadExtension(extPath);
            }

            return {
                success: true,
                extensionId: id,
                name: manifest.displayName || manifest.name
            };
        } catch (err) {
            console.error('[Main] Extension installation failed:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:install-url', async (event, downloadUrl) => {
        try {
            console.log('[Main] Installing extension from URL:', downloadUrl);

            if (!state.extensionLoader) {
                state.extensionLoader = new ExtensionLoader();
            }

            const { id, path: extPath, manifest } = await state.extensionLoader.installFromURL(downloadUrl);

            if (state.extensionHost) {
                await state.extensionHost.loadExtension(extPath);
            }

            return {
                success: true,
                extensionId: id,
                name: manifest.displayName || manifest.name
            };
        } catch (err) {
            console.error('[Main] Extension installation from URL failed:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:uninstall', async (event, extensionId) => {
        try {
            console.log('[Main] Uninstalling extension:', extensionId);

            if (state.extensionHost) {
                await state.extensionHost.deactivateExtension(extensionId);
                state.extensionHost.extensions.delete(extensionId);
            }

            if (state.extensionLoader) {
                await state.extensionLoader.uninstallExtension(extensionId);
            }

            return { success: true };
        } catch (err) {
            console.error('[Main] Extension uninstall failed:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:enable', async (event, extensionId) => {
        try {
            if (!state.extensionHost) {
                return { error: 'Extension host not initialized' };
            }

            await state.extensionHost.enableExtension(extensionId);
            return { success: true };
        } catch (err) {
            console.error('[Main] Extension activation failed:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:get-icon-theme', async (event, themeId) => {
        try {
            if (!state.extensionHost) {
                return null;
            }
            return await state.extensionHost.getIconTheme(themeId);
        } catch (err) {
            console.error('[Main] Failed to get icon theme:', err);
            return null;
        }
    });

    ipcMain.handle('extensions:disable', async (event, extensionId) => {
        try {
            if (!state.extensionHost) {
                return { error: 'Extension host not initialized' };
            }

            await state.extensionHost.disableExtension(extensionId);

            // Notify renderer
            const mw = getMainWindow();
            if (mw && !mw.isDestroyed()) {
                mw.webContents.send('extensions:disabled', extensionId);
            }

            return { success: true };
        } catch (err) {
            console.error('[Main] Extension deactivation failed:', err);
            return { error: err.message };
        }
    });

    ipcMain.handle('extensions:get-readme', async (event, extensionId) => {
        try {
            const descriptor = state.extensionHost.extensions.get(extensionId);
            if (!descriptor) return { error: 'Extension not found' };

            const readmePath = path.join(descriptor.extensionPath, 'README.md');
            if (fs.existsSync(readmePath)) {
                return await fs.promises.readFile(readmePath, 'utf8');
            }
            const readmePathLower = path.join(descriptor.extensionPath, 'readme.md');
            if (fs.existsSync(readmePathLower)) {
                return await fs.promises.readFile(readmePathLower, 'utf8');
            }
            return null;
        } catch (err) {
            return { error: err.message };
        }
    });

    // ===== LSP IPC Handlers =====

    // Helper to execute VSCodeAPI providers
    async function executeVSCodeProviders(method, uri, position, ...args) {
        console.log(`[Main] executeVSCodeProviders called: method=${method}, uri=${uri}, position=${JSON.stringify(position)}`);

        if (!state.extensionHost || !state.extensionHost.api) {
            console.log('[Main] No extensionHost or API');
            return [];
        }

        const api = state.extensionHost.api;
        const vscode = api.getAPI();
        const languageId = api.getLanguageId(uri);

        console.log(`[Main] Language ID for ${uri}: ${languageId}`);

        if (!languageId) return [];

        const providerType = method === 'provideCompletionItems' ? 'completion' :
            method === 'provideHover' ? 'hover' :
                method === 'provideDefinition' ? 'definition' : null;

        if (!providerType) return [];

        const providers = api.getProvidersForLanguage(providerType, languageId);
        console.log(`[Main] Found ${providers ? providers.length : 0} ${providerType} providers for ${languageId}`);

        if (!providers || providers.length === 0) return [];

        // Reconstruct document and position
        const docUri = vscode.Uri.parse(uri);
        const docInfo = api._documents.get(uri.toString());

        // If doc not found in API, try to create a dummy one if we have content? 
        // For now, require it to be tracked.
        if (!docInfo) {
            console.warn(`[Main] Document not found in VSCodeAPI: ${uri}`);
            console.warn(`[Main] Available documents: ${Array.from(api._documents.keys()).join(', ')}`);
            return [];
        }

        const document = new vscode.TextDocument(docUri, docInfo.languageId, docInfo.version, () => docInfo.text);
        const pos = new vscode.Position(position.line, position.character);
        const token = new vscode.CancellationTokenSource().token;

        const results = [];
        for (const registration of providers) {
            try {
                console.log(`[Main] Executing ${providerType} provider from ${registration.extensionId}`);
                const result = await registration.provider[method](document, pos, token, ...args);
                if (result) {
                    if (method === 'provideCompletionItems' && result.items) {
                        results.push(...result.items);
                    } else if (Array.isArray(result)) {
                        results.push(...result);
                    } else {
                        results.push(result);
                    }
                }
            } catch (e) {
                console.error(`[Main] Provider ${registration.extensionId} failed:`, e);
            }
        }
        return results;
    }
    ipcMain.handle('lsp:completion', async (event, uri, position) => {
        try {
            const results = [];

            // 1. Get LSPClient Results
            if (state.extensionHost && state.extensionHost.lspClient) {
                const lspResults = await state.extensionHost.lspClient.getCompletions(uri, position);
                if (lspResults) results.push(...(Array.isArray(lspResults) ? lspResults : lspResults.items || []));
            }

            // 2. Get VSCodeAPI Results
            const apiResults = await executeVSCodeProviders('provideCompletionItems', uri, position);
            if (apiResults) results.push(...apiResults);

            return results;
        } catch (err) {
            console.error('[Main] LSP completion failed:', err);
            return [];
        }
    });

    ipcMain.handle('lsp:hover', async (event, uri, position) => {
        try {
            // 1. Get LSPClient Results
            if (state.extensionHost && state.extensionHost.lspClient) {
                const hover = await state.extensionHost.lspClient.getHover(uri, position);
                if (hover) return hover; // Return first valid hover for now
            }

            // 2. Get VSCodeAPI Results
            const apiResults = await executeVSCodeProviders('provideHover', uri, position);
            if (apiResults && apiResults.length > 0) return apiResults[0];

            return null;
        } catch (err) {
            console.error('[Main] LSP hover failed:', err);
            return null;
        }
    });

    ipcMain.handle('lsp:definition', async (event, uri, position) => {
        try {
            const results = [];

            // 1. Get LSPClient Results
            if (state.extensionHost && state.extensionHost.lspClient) {
                const definition = await state.extensionHost.lspClient.getDefinition(uri, position);
                if (definition) {
                    if (Array.isArray(definition)) results.push(...definition);
                    else results.push(definition);
                }
            }

            // 2. Get VSCodeAPI Results
            const apiResults = await executeVSCodeProviders('provideDefinition', uri, position);
            if (apiResults) results.push(...apiResults);

            return results.length > 0 ? results : null;
        } catch (err) {
            console.error('[Main] LSP definition failed:', err);
            return null;
        }
    });

    ipcMain.handle('lsp:format', async (event, uri) => {
        try {
            if (!state.extensionHost || !state.extensionHost.lspClient) {
                return null;
            }
            const edits = await state.extensionHost.lspClient.formatDocument(uri);
            return edits;
        } catch (err) {
            console.error('[Main] LSP formatting failed:', err);
            return null;
        }
    });

    ipcMain.handle('lsp:didOpen', async (event, uri, languageId, text, version) => {
        console.log('[Main] lsp:didOpen received for:', uri);
        if (state.extensionHost) {
            if (uri.startsWith('file://')) {
                try {
                    const filePath = uri.replace('file://', '');
                    let currentDir = path.dirname(filePath);
                    let foundRoot = null;

                    // Find package.json
                    let searchDir = currentDir;
                    while (searchDir !== path.dirname(searchDir)) {
                        if (fs.existsSync(path.join(searchDir, 'package.json'))) {
                            foundRoot = searchDir;
                            break;
                        }
                        searchDir = path.dirname(searchDir);
                    }

                    if (foundRoot) {
                        // Update workspace root if different
                        if (state.extensionHost.workspaceRoot !== foundRoot) {
                            console.log(`[Main] Switching workspace root: ${state.extensionHost.workspaceRoot} -> ${foundRoot}`);
                            state.extensionHost.setWorkspaceRoot(foundRoot);
                        }
                    } else if (!state.extensionHost.workspaceRoot) {
                        // Fallback if no root set yet
                        state.extensionHost.setWorkspaceRoot(currentDir);
                    }
                } catch (err) {
                    console.error('[Main] Failed to auto-detect workspace root:', err);
                }
            }

            await state.extensionHost.activateByEvent(`onLanguage:${languageId}`);

            if (state.extensionHost.lspClient) {
                state.extensionHost.lspClient.didOpenDocument(uri, languageId, text, version);
            }

            // Notify extensions
            state.extensionHost.onDidOpenDocument(uri, languageId, text, version);
        }
    });

    ipcMain.on('lsp:didChange', (event, uri, changes, newText) => {
        if (state.extensionHost) {
            if (state.extensionHost.lspClient) {
                state.extensionHost.lspClient.didChangeDocument(uri, changes, newText);
            }
            // Notify extensions
            if (state.extensionHost.onDidChangeDocument) {
                state.extensionHost.onDidChangeDocument(uri, changes, newText);
            }
        }
    });

    ipcMain.on('lsp:didClose', (event, uri) => {
        if (state.extensionHost && state.extensionHost.lspClient) {
            state.extensionHost.lspClient.didCloseDocument(uri);
            // Notify extensions
            state.extensionHost.onDidCloseDocument(uri);
        }
    });

    if (state.extensionHost) {
        state.extensionHost.on('diagnostics', (data) => {
            const mw = getMainWindow();
            if (mw) {
                mw.webContents.send('lsp:diagnostics', data);
            }
        });
    }

    ipcMain.handle('app:get-home-path', () => os.homedir());
    ipcMain.handle('app:open-path', async (event, targetPath) => shell.openPath(targetPath));
    ipcMain.handle('project:reveal-in-finder', async (event, targetPath) => { if (targetPath) shell.showItemInFolder(targetPath); });

    ipcMain.handle('project:search', async (e, rootPath, query) => {
        const matchedFiles = []; const expandedDirs = new Set();
        if (!query || !query.trim()) return { matches: [], expanded: [] };
        await recursiveSearch(rootPath, query.toLowerCase(), matchedFiles, expandedDirs);
        return { matches: matchedFiles, expanded: Array.from(expandedDirs) };
    });

    ipcMain.handle('project:search-content', async (e, rootPath, query) => {
        if (!query || !query.trim()) return [];

        const maxResults = 50;
        try {
            return await new Promise((resolve) => {
                const { spawn } = require('child_process');
                const rg = spawn('rg', [
                    '--line-number', '--column', '--no-heading', '--smart-case', '--max-count=10',
                    '--type-add', 'code:*.{js,jsx,ts,tsx,html,css,json,md,txt,py,rb,php,java,go,rs,c,cpp,h,hpp}',
                    '--type=code', query, rootPath
                ], { timeout: 5000 });

                let output = '';
                let hasOutput = false;

                rg.stdout.on('data', (data) => { hasOutput = true; output += data.toString(); });
                rg.stderr.on('data', (data) => {
                    const error = data.toString();
                    if (error.includes('command not found') || error.includes('not recognized')) rg.kill();
                });

                rg.on('close', async (code) => {
                    if (hasOutput) {
                        const lines = output.split('\n').filter(l => l.trim());
                        const fileMap = new Map();
                        lines.forEach(line => {
                            const match = line.match(/^([^:]+):(\d+):(\d+):(.+)$/);
                            if (match) {
                                const [, filePath, lineNum, colNum, text] = match;
                                if (!fileMap.has(filePath)) fileMap.set(filePath, []);
                                fileMap.get(filePath).push({ line: parseInt(lineNum), col: parseInt(colNum), text: text.trim() });
                            }
                        });
                        const results = Array.from(fileMap.entries()).map(([filePath, matches]) => ({
                            filePath: path.isAbsolute(filePath) ? filePath : path.join(rootPath, filePath),
                            matches: matches.slice(0, 10)
                        })).slice(0, maxResults);
                        resolve(results);
                    } else {
                        resolve(await nativeContentSearch(rootPath, query, maxResults));
                    }
                });
                rg.on('error', async () => resolve(await nativeContentSearch(rootPath, query, maxResults)));
            });
        } catch (err) {
            console.error('[Main] Content search error:', err);
            return await nativeContentSearch(rootPath, query, maxResults);
        }
    });

    async function nativeContentSearch(rootPath, query, maxResults) {
        const fileMap = new Map();
        const searchRecursive = async (dir) => {
            if (fileMap.size >= maxResults) return;
            try {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                for (const entry of entries) {
                    if (fileMap.size >= maxResults) break;
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (['node_modules', '.git', 'dist', 'build', '.DS_Store', '.next', 'coverage'].includes(entry.name)) continue;
                        await searchRecursive(fullPath);
                    } else if (entry.isFile()) {
                        const ext = path.extname(entry.name).toLowerCase();
                        if (!['.js', '.jsx', '.ts', '.tsx', '.html', '.css', '.json', '.md', '.txt', '.py', '.rb', '.php', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp'].includes(ext)) continue;
                        try {
                            const content = await fs.promises.readFile(fullPath, 'utf8');
                            const lines = content.split('\n');
                            const matches = [];
                            lines.forEach((line, index) => {
                                if (line.toLowerCase().includes(query.toLowerCase()) && matches.length < 10) {
                                    matches.push({ line: index + 1, col: line.toLowerCase().indexOf(query.toLowerCase()), text: line.trim() });
                                }
                            });
                            if (matches.length > 0) fileMap.set(fullPath, matches);
                        } catch (err) { }
                    }
                }
            } catch (err) { }
        };
        await searchRecursive(rootPath);
        return Array.from(fileMap.entries()).map(([filePath, matches]) => ({ filePath, matches }));
    }

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

    ipcMain.on('project:watch', (event, projectPath) => {
        if (state.activeProjectWatcher) {
            try { state.activeProjectWatcher.close(); } catch (e) { }
            state.activeProjectWatcher = null;
        }
        if (!projectPath || !fs.existsSync(projectPath)) return;

        if (state.extensionHost) {
            state.extensionHost.setWorkspaceRoot(projectPath);
        }

        try {
            state.activeProjectWatcher = fs.watch(projectPath, { recursive: true }, (eventType, filename) => {
                if (filename && !filename.includes('.git') && !filename.includes('.DS_Store')) {
                    const mw = getMainWindow();
                    if (mw && !mw.isDestroyed()) {
                        mw.webContents.send('project:files-changed', { eventType, filename });
                    }
                }
            });
        } catch (e) {
            console.error("Failed to watch:", e);
        }
    });

    ipcMain.on('log:info', (event, ...args) => { console.log('[Renderer]', ...args); });
    ipcMain.handle('log-to-debug-file', async (event, msg) => { console.log('[DEBUG]', msg); return true; });

    let eslintInstance = null;
    let eslintCwd = null;

    // Helper: Initialize or reuse ESLint instance
    const getOrCreateESLint = (projectRoot) => {
        // Ensure projectRoot is absolute
        const absoluteRoot = path.isAbsolute(projectRoot)
            ? projectRoot
            : path.resolve(process.cwd(), projectRoot);

        // Recreate ESLint instance if CWD changed or not initialized
        if (!eslintInstance || eslintCwd !== absoluteRoot) {
            console.log(`[Main] Creating new ESLint instance for root: ${absoluteRoot}`);
            eslintCwd = absoluteRoot;
            eslintInstance = new ESLint({
                cwd: absoluteRoot,
                useEslintrc: false,
                resolvePluginsRelativeTo: path.join(__dirname, '../../'),
                overrideConfig: {
                    env: { browser: true, es2021: true, node: true },
                    parser: require.resolve('@typescript-eslint/parser'),
                    plugins: ['@typescript-eslint', 'react'],
                    extends: [
                        'eslint:recommended',
                        'plugin:@typescript-eslint/recommended',
                        'plugin:react/recommended'
                    ],
                    parserOptions: {
                        ecmaVersion: 'latest',
                        sourceType: 'module',
                        ecmaFeatures: { jsx: true }
                    },
                    globals: {
                        // Browser globals
                        window: 'readonly',
                        document: 'readonly',
                        console: 'readonly',
                        fetch: 'readonly',
                        localStorage: 'readonly',
                        // Node globals
                        require: 'readonly',
                        module: 'readonly',
                        process: 'readonly',
                        __dirname: 'readonly',
                        // Common
                        URL: 'readonly',
                        FormData: 'readonly',
                        Blob: 'readonly'
                    },
                    rules: {
                        'no-unused-vars': 'off', // TypeScript handles this
                        '@typescript-eslint/no-unused-vars': 'warn',
                        'no-undef': 'off', // TypeScript handles this
                        'react/react-in-jsx-scope': 'off', // Not needed in Next.js/modern React
                        'react/prop-types': 'off'
                    }
                }
            });
        }
        return eslintInstance;
    };

    ipcMain.handle('project:lint-file', async (event, filePath, content) => {
        // console.log('[Main] project:lint-file called for:', filePath);
        try {
            // Find project root by looking for package.json
            let projectRoot = path.dirname(filePath);
            const stopPath = path.parse(projectRoot).root;
            while (projectRoot !== stopPath) {
                if (fs.existsSync(path.join(projectRoot, 'package.json'))) {
                    break;
                }
                projectRoot = path.dirname(projectRoot);
            }
            if (projectRoot === stopPath) projectRoot = path.dirname(filePath); // Fallback

            const eslint = getOrCreateESLint(projectRoot);
            const results = await eslint.lintText(content, { filePath });

            if (results && results[0]) {
                const messages = results[0].messages;
                // console.log(`[Main] Lint results for ${filePath}: ${messages.length} messages`);
                const formattedMessages = messages.map(msg => ({
                    from: 0, to: 0, line: msg.line, col: msg.column, endLine: msg.endLine, endCol: msg.endColumn,
                    severity: msg.severity === 2 ? 'error' : 'warning', message: msg.message, source: 'ESLint'
                }));

                // Broadcast results to renderer (for Sidebar)
                const mw = getMainWindow();
                if (mw && !mw.isDestroyed()) {
                    mw.webContents.send('project:lint-results', { filePath, errors: formattedMessages });
                }

                return formattedMessages;
            }

            // Broadcast empty results (clear errors)
            const mw = getMainWindow();
            if (mw && !mw.isDestroyed()) {
                mw.webContents.send('project:lint-results', { filePath, errors: [] });
            }
            return [];
        } catch (e) {
            console.error("[Main] Lint error:", e);
            return [];
        }
    });

    ipcMain.handle('project:delete-path', async (event, itemPath) => { try { await shell.trashItem(itemPath); return { success: true }; } catch (e) { return { error: e.message }; } });
    ipcMain.handle('read-file-as-data-url', async (event, filePath) => { try { const data = await fs.promises.readFile(filePath); let mimeType = mime.lookup(filePath) || 'application/octet-stream'; return { buffer: { type: 'Buffer', data: Array.from(data) }, mimeType }; } catch (e) { return { error: e.message }; } });
    ipcMain.handle('clipboard:write-image-dataurl', (e, d) => { try { clipboard.writeImage(nativeImage.createFromDataURL(d)); return { success: true }; } catch (e) { return { error: e.message }; } });

    ipcMain.handle('clipboard:write-files', (e, filePaths) => {
        try {
            if (!filePaths || filePaths.length === 0) return { error: 'No files' };
            clipboard.writeText(filePaths.join('\n'));
            if (process.platform === 'darwin') {
                const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
    ${filePaths.map(p => `<string>${p}</string>`).join('\n')}
</array>
</plist>`;
                clipboard.writeBuffer('NSFilenamesPboardType', Buffer.from(plist));
            } else if (process.platform === 'linux') {
                const uriList = filePaths.map(p => `file://${p}`).join('\r\n');
                clipboard.writeBuffer('text/uri-list', Buffer.from(uriList));
            }
            return { success: true };
        } catch (err) { return { error: err.message }; }
    });

    ipcMain.handle('project:find-file', async (event, rootPath, filename) => {
        if (!rootPath) return null;
        try {
            const fg = require('fast-glob');
            const entries = await fg([`**/${filename}`], {
                cwd: rootPath,
                ignore: ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**'],
                absolute: true,
                caseSensitiveMatch: false
            });
            return entries.length > 0 ? entries[0] : null;
        } catch (error) {
            console.error(`Error finding file ${filename}:`, error);
            return null;
        }
    });

    ipcMain.handle('project:read-dir', async (e, p) => { try { return (await fs.promises.readdir(p, { withFileTypes: true })).filter(i => !['.git', '.DS_Store'].includes(i.name)).map(i => ({ name: i.name, isDirectory: i.isDirectory(), path: path.join(p, i.name) })).sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1)); } catch (e) { return null; } });
    ipcMain.handle('project:read-file', async (e, p) => { try { return await fs.promises.readFile(p, 'utf8'); } catch (err) { return { error: err.message }; } });

    // AI Tool Handlers
    ipcMain.on('project:view-file', async (event, filePath) => {
        try {
            // Resolve path against current project root
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(state.currentProject || '', filePath);
            const content = await fs.promises.readFile(fullPath, 'utf8');
            event.sender.send('project:view-file-reply', null, content);
        } catch (error) {
            event.sender.send('project:view-file-reply', error.message, null);
        }
    });

    ipcMain.on('project:list-directory', async (event, dirPath, recursive = false) => {
        try {
            // Resolve path against current project root
            const fullDirPath = path.isAbsolute(dirPath) ? dirPath : path.join(state.currentProject || '', dirPath);

            const getDirectoryTree = async (dir) => {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const files = [];

                for (const entry of entries) {
                    // Skip common ignored directories
                    if (['.git', 'node_modules', '.DS_Store', 'dist', 'build', '.next'].includes(entry.name)) {
                        continue;
                    }

                    const fullPath = path.join(dir, entry.name);
                    const stats = await fs.promises.stat(fullPath);

                    const fileInfo = {
                        name: entry.name,
                        path: fullPath,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: stats.size,
                        modified: stats.mtime
                    };

                    files.push(fileInfo);

                    // Recursively process subdirectories if requested
                    if (recursive && entry.isDirectory()) {
                        const subFiles = await getDirectoryTree(fullPath);
                        files.push(...subFiles);
                    }
                }

                return files;
            };

            const getDirectoryList = async (dir) => {
                const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                const files = [];

                for (const entry of entries) {
                    // Skip common ignored directories
                    if (['.git', 'node_modules', '.DS_Store', 'dist', 'build', '.next'].includes(entry.name)) {
                        continue;
                    }

                    const fullPath = path.join(dir, entry.name);
                    const stats = await fs.promises.stat(fullPath);

                    const fileInfo = {
                        name: entry.name,
                        path: fullPath,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: stats.size,
                        modified: stats.mtime
                    };

                    files.push(fileInfo);
                }
                return files;
            };

            const result = recursive ? await getDirectoryTree(fullDirPath) : await getDirectoryList(fullDirPath);
            event.sender.send('project:list-directory-reply', null, Array.isArray(result) ? result : [result]);
        } catch (error) {
            event.sender.send('project:list-directory-reply', error.message, null);
        }
    });

    // Update File Handler (event-based for AI tools)
    ipcMain.on('project:update-file', async (event, filePath, content) => {
        try {
            // Resolve path against current project root
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(state.currentProject || '', filePath);

            // Create directory if it doesn't exist
            const dir = path.dirname(fullPath);
            await fs.promises.mkdir(dir, { recursive: true });

            // Write file
            await fs.promises.writeFile(fullPath, content, 'utf8');
            event.sender.send('project:update-file-reply', null, { success: true, path: fullPath });
        } catch (error) {
            console.error('[Main] update-file error:', error);
            event.sender.send('project:update-file-reply', error.message, null);
        }
    });

    // Create File Handler (event-based for AI tools)
    ipcMain.on('project:create-file', async (event, filePath, content) => {
        try {
            // Resolve path against current project root
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(state.currentProject || '', filePath);

            // Create directory if it doesn't exist
            const dir = path.dirname(fullPath);
            await fs.promises.mkdir(dir, { recursive: true });

            // Write file
            await fs.promises.writeFile(fullPath, content, 'utf8');
            event.sender.send('project:create-file-reply', null, { success: true, path: fullPath });
        } catch (error) {
            console.error('[Main] create-file error:', error);
            event.sender.send('project:create-file-reply', error.message, null);
        }
    });

    // Delete File Handler (event-based for AI tools)
    ipcMain.on('project:delete-file', async (event, filePath) => {
        try {
            // Resolve path against current project root
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(state.currentProject || '', filePath);

            // Use trashItem for safety (recoverable)
            await shell.trashItem(fullPath);

            event.sender.send('project:delete-file-reply', null, { success: true, path: fullPath });
        } catch (error) {
            console.error('[Main] delete-file error:', error);
            event.sender.send('project:delete-file-reply', error.message, null);
        }
    });

    // Edit File Handler (event-based for AI tools) - Robust Implementation
    ipcMain.on('project:edit-file', async (event, filePath, search, replace) => {
        try {
            // Resolve path against current project root
            const fullPath = path.isAbsolute(filePath) ? filePath : path.join(state.currentProject || '', filePath);
            console.log(`[Main] edit-file request for: ${fullPath}`);
            console.log(`[Main] Search (first 50 chars): "${search.substring(0, 50).replace(/\n/g, '\\n')}..."`);

            if (!fs.existsSync(fullPath)) {
                console.error(`[Main] File not found: ${fullPath}`);
                event.sender.send('project:edit-file-reply', 'File not found', null);
                return;
            }

            const originalContent = await fs.promises.readFile(fullPath, 'utf8');

            // 1. Try exact replacement first (fastest and most accurate)
            if (originalContent.includes(search)) {
                console.log('[Main] Exact match found!');
                const newContent = originalContent.replace(search, replace);
                await fs.promises.writeFile(fullPath, newContent, 'utf8');
                event.sender.send('project:edit-file-reply', null, { success: true, path: fullPath });
                return;
            }

            console.log('[Main] Exact match failed. Trying fuzzy match...');

            // 2. Robust Line-by-Line Matching (Fuzzy Indentation)
            // This handles cases where the AI messes up indentation or newlines slightly
            const originalLines = originalContent.split(/\r\n|\r|\n/);
            const searchLines = search.split(/\r\n|\r|\n/).map(l => l.trim()).filter(l => l.length > 0);

            if (searchLines.length === 0) {
                console.warn('[Main] Search lines empty after trimming.');
                event.sender.send('project:edit-file-reply', 'Search content is empty or whitespace only', null);
                return;
            }

            let foundStart = -1;
            let foundEnd = -1;

            // Scan original lines
            for (let i = 0; i < originalLines.length; i++) {
                // Match attempt starting at i
                let matchCount = 0;
                let currentOriginalIdx = i;

                while (matchCount < searchLines.length && currentOriginalIdx < originalLines.length) {
                    const originalLineTrimmed = originalLines[currentOriginalIdx].trim();

                    // Skip empty lines in original file during matching (allow AI to skip them too)
                    if (originalLineTrimmed === '') {
                        currentOriginalIdx++;
                        continue;
                    }

                    if (originalLineTrimmed === searchLines[matchCount]) {
                        matchCount++;
                        currentOriginalIdx++;
                    } else {
                        break; // Mismatch
                    }
                }

                if (matchCount === searchLines.length) {
                    foundStart = i;
                    foundEnd = currentOriginalIdx; // Exclusive end index
                    break;
                }
            }

            if (foundStart !== -1) {
                console.log(`[Main] Fuzzy match success! Lines ${foundStart + 1} to ${foundEnd}`);

                // Found a match! Construct new content.
                // We preserve lines before matched block and after matched block.
                const before = originalLines.slice(0, foundStart).join('\n');
                const after = originalLines.slice(foundEnd).join('\n');

                // Note: We use \n for joining, normalizing line endings.

                // Indentation Preservation Logic
                // 1. Capture indentation from the start of the found block in original file
                const firstMatchLine = originalLines[foundStart];
                const indentMatch = firstMatchLine.match(/^(\s*)/);
                const indentation = indentMatch ? indentMatch[1] : '';

                // 2. Check if replacement needs indentation
                // Heuristic: If replacement has NO indentation on its first non-empty line, but original did, apply it.
                let replaceLines = replace.split(/\r\n|\r|\n/);

                // Find first non-empty line to check existing indentation
                const firstNonEmptyLine = replaceLines.find(l => l.trim().length > 0);

                if (indentation.length > 0 && firstNonEmptyLine && !firstNonEmptyLine.startsWith(' ') && !firstNonEmptyLine.startsWith('\t')) {
                    // Apply indentation to ALL lines (even empty ones? No, usually not necessary but safer to just do matched)
                    console.log(`[Main] Auto-applying indentation: "${indentation}"`);
                    replaceLines = replaceLines.map(l => indentation + l);
                    replace = replaceLines.join('\n');
                }

                const newContent = [before, replace, after].join('\n');

                await fs.promises.writeFile(fullPath, newContent, 'utf8');
                event.sender.send('project:edit-file-reply', null, { success: true, path: fullPath, method: 'fuzzy' });
                return;
            }

            console.warn('[Main] Fuzzy match failed.');
            // 3. Failed to find match
            const errorMsg = `Search text not found. \nTry to be more precise or copy the exact content from the file. \nAttempted search start: "${search.substring(0, 50)}..."`;
            event.sender.send('project:edit-file-reply', errorMsg, null);

        } catch (error) {
            console.error('[Main] edit-file error:', error);
            event.sender.send('project:edit-file-reply', error.message, null);
        }
    });

    ipcMain.on('project:get-problems', async (event) => {
        try {
            // Use current project from state, or fallback to CWD
            const projectRoot = state.currentProject || eslintCwd || process.cwd();
            console.log('[Main] get-problems: Scanning project root:', projectRoot);

            // Initialize linting engine if not ready
            const eslint = getOrCreateESLint(projectRoot);

            const problems = [];
            const filesToLint = [];

            // Robust directory walker
            // 1. Respects ignore list
            // 2. Finds all .js/.ts/.jsx/.tsx files
            const walkDir = (dir) => {
                try {
                    const files = fs.readdirSync(dir, { withFileTypes: true });
                    for (const entry of files) {
                        const name = entry.name;
                        // Skip common ignored directories
                        if (['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.DS_Store'].includes(name)) continue;

                        const fullPath = path.join(dir, name);

                        if (entry.isDirectory()) {
                            walkDir(fullPath);
                        } else if (entry.isFile() && /\.(tsx?|jsx?|mjs|cjs)$/.test(name)) {
                            filesToLint.push(fullPath);
                        }
                    }
                } catch (err) {
                    console.warn(`[Main] Failed to read dir ${dir}:`, err.message);
                }
            };

            if (fs.existsSync(projectRoot)) {
                walkDir(projectRoot);
            } else {
                throw new Error(`Project root does not exist: ${projectRoot}`);
            }

            console.log(`[Main] Linting ${filesToLint.length} files...`);

            // Limit concurrent linting to avoid choking the process
            // Chunking into batches of 10
            const CHUNK_SIZE = 10;
            for (let i = 0; i < filesToLint.length; i += CHUNK_SIZE) {
                const chunk = filesToLint.slice(i, i + CHUNK_SIZE);
                await Promise.all(chunk.map(async (filePath) => {
                    try {
                        const content = await fs.promises.readFile(filePath, 'utf8');
                        const results = await eslint.lintText(content, { filePath });

                        for (const result of results) {
                            for (const msg of (result.messages || [])) {
                                problems.push({
                                    file: filePath, // Absolute path
                                    line: msg.line || 1,
                                    column: msg.column || 1,
                                    severity: msg.severity === 2 ? 'error' : 'warning',
                                    message: msg.message,
                                    ruleId: msg.ruleId || 'unknown'
                                });
                            }
                        }
                    } catch (err) {
                        console.error(`[Main] Error linting ${filePath}:`, err.message);
                    }
                }));
            }

            console.log(`[Main] Found ${problems.length} problems`);
            event.sender.send('project:get-problems-reply', null, problems);
        } catch (error) {
            console.error('[Main] get-problems fatal error:', error);
            event.sender.send('project:get-problems-reply', error.message, null);
        }
    });

    ipcMain.handle('project:write-file', async (e, p, c) => {
        try {
            const dir = path.dirname(p);

            // GUARDRAIL: Prevent writing content that looks like a hallucinated tool execution
            // This catches cases where the AI tries to use <search> or <<<<<<< inside a file write
            if (c.includes('<<<<<<< SEARCH') || (c.includes('<search>') && c.includes('</search>'))) {
                console.warn(`[Guardrail] Blocked suspicious file write to ${p}. Content contains tool markers.`);
                return { error: 'Guardrail: Your content contains tool markers (<<<<<<< or <search>). Did you mean to use the edit_file tool? Do not write these markers into files.' };
            }

            await fs.promises.mkdir(dir, { recursive: true });
            await fs.promises.writeFile(p, c, 'utf8');
            return { success: true };
        } catch (err) { return { error: err.message }; }
    });


    // Search Project Handler (for AI tools)
    ipcMain.on('project:search', async (event, query) => {
        try {
            const rootPath = state.currentProject;
            if (!rootPath) {
                event.sender.send('project:search-reply', 'No active project', null);
                return;
            }

            console.log(`[Main] Searching project: ${rootPath} for "${query}"`);

            const results = [];

            // Reuse recursive search logic
            const searchRecursive = async (dir) => {
                try {
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
                    for (const entry of entries) {
                        const fullPath = path.join(dir, entry.name);

                        // Skip common ignored directories
                        if (['node_modules', '.git', 'dist', 'build', '.DS_Store', '.next', 'coverage'].includes(entry.name)) continue;

                        if (entry.isDirectory()) {
                            await searchRecursive(fullPath);
                        } else if (entry.isFile()) {
                            // Only search text files - basic check
                            if (/\.(js|jsx|ts|tsx|css|html|json|md|txt)$/i.test(entry.name)) {
                                try {
                                    const content = await fs.promises.readFile(fullPath, 'utf8');
                                    // Make search case-insensitive for better AI results
                                    if (content.toLowerCase().includes(query.toLowerCase())) {
                                        // Find context snippets
                                        const lines = content.split(/\r\n|\r|\n/);
                                        lines.forEach((line, index) => {
                                            if (line.toLowerCase().includes(query.toLowerCase())) {
                                                // Create a snippet with line number
                                                results.push({
                                                    file: path.relative(rootPath, fullPath),
                                                    line: index + 1,
                                                    content: line.trim()
                                                });
                                            }
                                        });
                                    }
                                } catch (err) { }
                            }
                        }
                    }
                } catch (err) { }
            };

            await searchRecursive(rootPath);

            // Limit results to prevent context overflow
            const distinctResults = results.slice(0, 100);

            console.log(`[Main] Search found ${distinctResults.length} matches`);
            event.sender.send('project:search-reply', null, distinctResults);

        } catch (error) {
            console.error('[Main] Search error:', error);
            event.sender.send('project:search-reply', error.message, null);
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
                        try {
                            const content = await fs.promises.readFile(fullPath, 'utf8');
                            if (content.includes(query)) {
                                const lines = content.split('\n');
                                lines.forEach((line, index) => {
                                    if (line.includes(query)) {
                                        results.push({ filePath: path.relative(rootPath, fullPath), line: index + 1, content: line.trim() });
                                    }
                                });
                            }
                        } catch (err) { }
                    }
                }
            };
            await searchRecursive(rootPath);
            return results.slice(0, 50);
        } catch (err) { return { error: err.message }; }
    });

    // Track active exec processes for cleanup
    // Use state.activeExecProcesses initialized in main.js
    if (!state.activeExecProcesses) {
        state.activeExecProcesses = new Set();
    }

    ipcMain.handle('project:run-command', async (event, cmd, cwd) => {
        return new Promise((resolve) => {
            // Use current project from state, or fallback to CWD
            const targetCwd = cwd || state.currentProject || os.homedir();

            // Set 5 minute timeout to prevent hangs
            const options = { cwd: targetCwd, maxBuffer: 1024 * 1024 * 10, timeout: 300000 };

            console.log(`[Main] Running command: "${cmd}" in "${targetCwd}"`);
            console.log(`[Main] PATH: ${process.env.PATH}`);

            // Spawn the process
            const childProcess = exec(cmd, options, (error, stdout, stderr) => {
                // Cleanup from set when done
                state.activeExecProcesses.delete(childProcess);
                resolve({ stdout: stdout || '', stderr: stderr || '', error: error ? error.message : null, exitCode: error ? error.code : 0 });
            });

            // Add to tracking set
            state.activeExecProcesses.add(childProcess);
        });
    });

    ipcMain.handle('project:kill-all-commands', async () => {
        console.log(`[Main] Killing ${state.activeExecProcesses.size} active exec processes...`);
        let count = 0;

        for (const proc of state.activeExecProcesses) {
            try {
                if (proc && proc.pid) {
                    console.log(`[Main] Killing process tree for PID: ${proc.pid}`);
                    killProcessTree(proc.pid);
                    count++;
                }
            } catch (e) {
                console.error('[Main] Failed to kill process:', e);
            }
        }
        state.activeExecProcesses.clear();
        return { success: true, count };
    });

    ipcMain.handle('project:read-asset-base64', async (e, r) => {
        try {
            const filePath = path.join(__dirname, '..', '..', r); // Adjust path relative to src/main/ipc.js
            // Wait, r is passed from renderer, usually relative to project root or something?
            // In main.js it was path.join(__dirname, r). __dirname was root.
            // Here __dirname is src/main. So we need to go up 2 levels to root.
            const c = await fs.promises.readFile(filePath);
            const mimeType = mime.lookup(filePath) || 'image/png';
            return `data:${mimeType};base64,${c.toString('base64')}`;
        } catch (err) { return null; }
    });

    ipcMain.on('log', (event, ...args) => console.log('[Renderer]', ...args));

    ipcMain.handle('dialog:open-file', async (event, options) => { return await dialog.showOpenDialog(options); });
    ipcMain.handle('dialog:openFile', async (event) => {
        const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] });
        if (result.canceled || result.filePaths.length === 0) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('git:create-checkpoint', async (event, rootPath, messageId) => {
        return new Promise((resolve) => {
            if (!rootPath || !fs.existsSync(path.join(rootPath, '.git'))) { resolve({ error: 'Not a git repository' }); return; }
            exec('git add .', { cwd: rootPath }, (err) => {
                if (err) { resolve({ error: `Git Add Failed: ${err.message}` }); return; }
                const commitMsg = `Peak Checkpoint: ${messageId}`;
                exec(`git commit -m "${commitMsg}"`, { cwd: rootPath }, (err, stdout) => {
                    if (err) {
                        if (stdout.includes('nothing to commit')) {
                            exec('git rev-parse HEAD', { cwd: rootPath }, (e, hash) => { resolve({ hash: hash.trim() }); });
                            return;
                        }
                        resolve({ error: `Git Commit Failed: ${err.message}` });
                        return;
                    }
                    exec('git rev-parse HEAD', { cwd: rootPath }, (e, hash) => { resolve({ hash: hash.trim() }); });
                });
            });
        });
    });

    ipcMain.handle('git:revert-to-checkpoint', async (event, rootPath, hash) => {
        return new Promise((resolve) => {
            if (!rootPath || !hash) { resolve({ error: 'Invalid parameters' }); return; }
            console.log(`[Main] Reverting to checkpoint: ${hash} in ${rootPath}`);
            exec(`git reset --hard ${hash}`, { cwd: rootPath }, (err, stdout, stderr) => {
                if (err) {
                    console.error(`[Main] Git Reset Failed: ${err.message}`);
                    resolve({ error: `Git Reset Failed: ${err.message}` });
                } else {
                    exec('git clean -fd', { cwd: rootPath }, (cleanErr, cleanStdout, cleanStderr) => {
                        if (cleanErr) console.warn(`[Main] Git Clean Failed (non-fatal): ${cleanErr.message}`);
                        console.log(`[Main] Git Reset & Clean Success. Reset Output: ${stdout}, Clean Output: ${cleanStdout}`);
                        resolve({ success: true });
                    });
                }
            });
        });
    });

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
                        fileList.push(path.relative(rootPath, res));
                    }
                }
            } catch (e) { console.error(`[Main] Error scanning ${dir}:`, e); }
        }
        await scan(rootPath);
        return fileList;
    });

    ipcMain.handle('project:get-file-tree', async (event, rootPath) => {
        if (!rootPath) return { error: 'No root path provided' };
        async function getDirectoryTree(dir) {
            const name = path.basename(dir);
            const item = { name, path: dir, type: 'directory', children: [] };
            try {
                const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
                dirents.sort((a, b) => {
                    if (a.isDirectory() && !b.isDirectory()) return -1;
                    if (!a.isDirectory() && b.isDirectory()) return 1;
                    return a.name.localeCompare(b.name);
                });
                for (const dirent of dirents) {
                    const fullPath = path.join(dir, dirent.name);
                    if (['node_modules', '.git', 'dist', 'build', '.DS_Store', '.idea', '.vscode'].includes(dirent.name)) continue;
                    if (dirent.isDirectory()) {
                        const child = await getDirectoryTree(fullPath);
                        item.children.push(child);
                    } else {
                        item.children.push({ name: dirent.name, path: fullPath, type: 'file' });
                    }
                }
            } catch (e) { console.error(`[Main] Error scanning ${dir}:`, e); item.error = e.message; }
            return item;
        }
        return await getDirectoryTree(rootPath);
    });

    // Track active streams for aborting
    const activeStreams = new Map();

    ipcMain.on('llm-stream-request', async (event, sId, mId, msgs) => {
        const apiKey = settingsStore.get('openrouterApiKey');
        if (!apiKey) { event.sender.send('llm-stream-data', sId, { type: 'error', message: 'API Key missing' }); return; }
        try {
            console.log(`[Main] Starting stream for model: ${mId}, ID: ${sId}`);
            const stream = await openrouterService.streamChatCompletion(mId, msgs, apiKey, 'peak', 'Peak');

            // Store stream for aborting
            activeStreams.set(sId, stream);

            let buffer = '';
            stream.on('data', c => {
                buffer += c.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    if (line.startsWith(':')) continue;
                    const msg = line.replace(/^data: /, '');
                    if (msg === '[DONE]') {
                        console.log('[Main] Stream received [DONE]');
                        event.sender.send('llm-stream-data', sId, { type: 'end' });
                        activeStreams.delete(sId);
                        return;
                    }
                    try {
                        const p = JSON.parse(msg);
                        const content = p.choices[0]?.delta?.content || '';
                        if (content) event.sender.send('llm-stream-data', sId, { type: 'data', content: content });
                    } catch (e) { console.error('[Main] JSON Parse Error:', e.message, 'Line:', line); }
                }
            });
            stream.on('end', () => {
                console.log('[Main] Stream ended');
                event.sender.send('llm-stream-data', sId, { type: 'end' });
                activeStreams.delete(sId);
            });
            stream.on('error', e => {
                console.error('[Main] Stream error:', e);
                event.sender.send('llm-stream-data', sId, { type: 'error', message: e.message });
                activeStreams.delete(sId);
            });
        } catch (e) {
            console.error('[Main] Request setup error:', e);
            event.sender.send('llm-stream-data', sId, { type: 'error', message: e.message });
        }
    });

    ipcMain.on('llm-stream-abort', (event, sId) => {
        console.log(`[Main] Aborting stream: ${sId}`);
        const stream = activeStreams.get(sId);
        if (stream) {
            try {
                stream.destroy(); // Destroy the axios stream
                console.log(`[Main] Stream ${sId} destroyed.`);
            } catch (e) {
                console.error(`[Main] Error destroying stream ${sId}:`, e);
            }
            activeStreams.delete(sId);
            event.sender.send('llm-stream-data', sId, { type: 'error', message: 'Aborted by user' });
        } else {
            console.warn(`[Main] Stream ${sId} not found to abort.`);
        }
    });

    ipcMain.on('save-whiteboard-data', (e, id, d, t) => { const mw = getMainWindow(); if (mw) mw.webContents.send('whiteboard-save-data', Number(id), d, t); });
    ipcMain.on('show-inspector-context-menu', (e, { type, id }) => { Menu.buildFromTemplate([{ label: 'Delete', click: () => e.sender.send('delete-inspector-item', { type, id }) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.on('show-whiteboard-context-menu', (e, d) => { Menu.buildFromTemplate([{ label: 'Delete', click: () => e.sender.send('whiteboard-action', { action: 'delete', ...d }) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.on('show-kanban-context-menu', (e, d) => { Menu.buildFromTemplate([{ label: 'Delete Task', click: () => e.sender.send('kanban-action', { action: 'delete', ...d }) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.on('show-problem-context-menu', (event, textToCopy) => { const template = [{ label: 'Copy', click: () => clipboard.writeText(textToCopy) }]; Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) }); });

    ipcMain.on('show-terminal-context-menu', (event, { id, hasSelection }) => {
        const template = [
            { label: 'Copy', enabled: hasSelection, click: () => event.sender.send('terminal-context-action', { action: 'copy', id }) },
            { label: 'Paste', click: () => event.sender.send('terminal-context-action', { action: 'paste', id }) },
            { label: 'Select All', click: () => event.sender.send('terminal-context-action', { action: 'select-all', id }) },
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
            template.splice(3, 0, { type: 'separator' }, { label: 'Save Image As...', click: () => event.sender.send('webview-context-action', { action: 'save-image', tabId, url: srcURL }) });
        }
        Menu.buildFromTemplate(template).popup({ window: BrowserWindow.fromWebContents(event.sender) });
    });

    ipcMain.on('will-swap-content', () => { state.ignoreBlur = true; });
    ipcMain.on('did-finish-content-swap', () => { setTimeout(() => { state.ignoreBlur = false; }, 300); });
    ipcMain.on('open-settings-window', () => createSettingsWindow());
    ipcMain.handle('get-all-settings', () => { const s = settingsStore.store; s.openrouterApiKey = s.openrouterApiKey ? '*****' : null; return s; });
    ipcMain.on('toggle-dock-visibility', (e, v) => { settingsStore.set('isDockVisible', v); if (process.platform === 'darwin') app.setActivationPolicy(v ? 'regular' : 'accessory'); });
    ipcMain.on('toggle-level', (e, f) => { settingsStore.set('isFloating', f); const mw = getMainWindow(); if (mw) { mw.setAlwaysOnTop(f, 'floating'); mw.setLevel(f ? 'floating' : 'normal'); } });
    ipcMain.on('show-block-context-menu', (e, d) => { Menu.buildFromTemplate([{ label: 'Delete Block', click: () => e.sender.send('delete-block-command', d) }]).popup({ window: BrowserWindow.fromWebContents(e.sender) }); });
    ipcMain.handle('select-image', async () => { const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'ico'] }] }); return canceled ? null : filePaths; });

    ipcMain.on('terminal-create', (e, id, cwd) => {
        console.log(`[Main] terminal-create request for ID: ${id}, CWD: ${cwd}`);
        if (!pty) {
            console.error('[Main] node-pty is not available!');
            return;
        }
        if (state.ptyProcesses[id]) try { state.ptyProcesses[id].kill(); } catch (e) { }
        try {
            const shell = os.platform() === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
            const proc = pty.spawn(shell, [], { name: 'xterm-256color', cols: 80, rows: 30, cwd: cwd || os.homedir(), env: process.env });
            state.ptyProcesses[id] = proc;
            proc.on('data', d => { const mw = getMainWindow(); if (mw) mw.webContents.send('terminal-data', id, d); });
            proc.on('exit', () => delete state.ptyProcesses[id]);
        } catch (err) { console.error(err); }
    });
    ipcMain.on('terminal-write', (e, id, d) => { if (state.ptyProcesses[id]) state.ptyProcesses[id].write(d); });
    ipcMain.on('terminal-resize', (e, id, s) => { if (state.ptyProcesses[id]) try { state.ptyProcesses[id].resize(s.cols, s.rows); } catch (e) { } });
    ipcMain.on('terminal-kill', (e, id) => {
        if (state.ptyProcesses[id]) {
            try {
                console.log(`[Main] Killing PTY process tree for ID: ${id} (PID: ${state.ptyProcesses[id].pid})`);
                killProcessTree(state.ptyProcesses[id].pid);
            } catch (e) { console.error(`[Main] Failed to kill PTY ${id}:`, e); }
        }
        delete state.ptyProcesses[id];
    });
    ipcMain.on('save-api-key', (e, k) => { settingsStore.set('openrouterApiKey', k); process.env.OPENROUTER_API_KEY = k; });
    ipcMain.on('update-hotkey', (e, k) => { settingsStore.set('hotkey', k); registerHotKey(); });

    ipcMain.handle('project:show-save-dialog', async (e, d) => { const { canceled, filePath } = await dialog.showSaveDialog({ defaultPath: d }); return canceled ? null : filePath; });
    ipcMain.handle('project:open-dialog', async () => { const { filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] }); return filePaths[0]; });

    // Helper for recursive search
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
}

module.exports = { setupIpcHandlers };
