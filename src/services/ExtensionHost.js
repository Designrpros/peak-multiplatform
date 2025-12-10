// src/services/ExtensionHost.js
// Extension Host Process - Runs extensions in isolation

const path = require('path');
const Module = require('module');
const unzipper = require('unzipper'); // Added unzipper import

const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const VSCodeAPI = require('./VSCodeAPI');
const LSPClient = require('./LSPClient');

// FIX: Polyfill crypto for extensions (like Jupyter) that rely on it
const crypto = require('crypto');
if (!global.crypto) {
    global.crypto = {
        getRandomValues: (buffer) => crypto.randomFillSync(buffer),
        randomUUID: () => crypto.randomUUID(),
        ...crypto
    };
}

/**
 * Extension Host
 * Manages loading, activation, and lifecycle of VSCode extensions
 */
class ExtensionHost extends EventEmitter {
    constructor() {
        super();
        this.extensions = new Map(); // extensionId -> ExtensionDescriptor
        this.activatedExtensions = new Set();
        this.api = new VSCodeAPI(this);

        console.log('[ExtensionHost] Methods check:', {
            sendRegisteredViews: typeof this.sendRegisteredViews,
            activateExtensionByView: typeof this.activateExtensionByView
        });
        this.commandRegistry = new Map();
        this.lspClient = new LSPClient(); // Initialize LSPClient
        this.extensionsDir = path.join(os.homedir(), '.peak', 'extensions');
        this.bundledExtensionsDir = path.join(os.homedir(), '.peak', 'bundled-extensions');
        this.storageDir = path.join(os.homedir(), '.peak', 'storage');
        this.disabledExtensions = new Set();
        this.disabledExtensionsFile = path.join(this.extensionsDir, 'disabled.json');

        if (!fs.existsSync(this.extensionsDir)) {
            fs.mkdirSync(this.extensionsDir, { recursive: true });
        }
        if (!fs.existsSync(this.bundledExtensionsDir)) {
            fs.mkdirSync(this.bundledExtensionsDir, { recursive: true });
        }
        if (!fs.existsSync(this.storageDir)) {
            fs.mkdirSync(this.storageDir, { recursive: true });
        }
        // Forward LSP diagnostics events
        this.lspClient.on('diagnostics', (data) => {
            this.emit('diagnostics', data);
        });

        this.ensureExtensionsDirectory();

        // Load disabled extensions
        this.loadDisabledExtensions();

        // FIX: Add global unhandled promise rejection handler
        // This prevents the app from crashing when extensions have async errors
        process.on('unhandledRejection', (reason, promise) => {
            console.error('[ExtensionHost] Unhandled Promise Rejection (non-fatal):', reason);
            // Log but don't crash - many extension errors are non-critical
        });

        // Patch module loader to provide 'vscode' module
        this.patchModuleLoader();

        console.log('[ExtensionHost] Initialized. getExtension type:', typeof this.getExtension);
    }

    // ... (existing methods)

    sendRegisteredViews() {
        const containers = [];
        const views = {}; // containerId -> views[]
        this.viewToExtensionMap = new Map(); // viewId -> extensionId

        for (const [id, ext] of this.extensions) {
            if (this.disabledExtensions.has(id)) continue;
            const contrib = ext.manifest.contributes;
            if (contrib) {
                if (contrib.viewsContainers && contrib.viewsContainers.activitybar) {
                    contrib.viewsContainers.activitybar.forEach(vc => {
                        containers.push({
                            id: vc.id,
                            title: vc.title,
                            icon: vc.icon ? path.join(ext.extensionPath, vc.icon) : null,
                            extensionId: id
                        });
                    });
                }
                if (contrib.views) {
                    for (const [containerId, viewList] of Object.entries(contrib.views)) {
                        if (!views[containerId]) views[containerId] = [];
                        viewList.forEach(v => {
                            views[containerId].push({
                                id: v.id,
                                name: v.name,
                                extensionId: id
                            });
                            this.viewToExtensionMap.set(v.id, id);
                        });
                    }
                }
            }
        }

        if (this.api && global.mainWindow && !global.mainWindow.isDestroyed()) {
            global.mainWindow.webContents.send('vscode:views-contribution', { containers, views });
        }
    }

    async activateExtensionByView(viewId) {
        const extensionId = this.viewToExtensionMap.get(viewId);
        if (extensionId) {
            console.log(`[ExtensionHost] Activating extension ${extensionId} for view ${viewId}`);
            await this.activateExtension(extensionId);
            return true;
        }
        return false;
    }

    ensureExtensionsDirectory() {
        if (!fs.existsSync(this.extensionsDir)) {
            fs.mkdirSync(this.extensionsDir, { recursive: true });
            console.log('[ExtensionHost] Created extensions directory:', this.extensionsDir);
        }
        if (!fs.existsSync(this.bundledExtensionsDir)) {
            fs.mkdirSync(this.bundledExtensionsDir, { recursive: true });
            console.log('[ExtensionHost] Created bundled extensions directory:', this.bundledExtensionsDir);
        }
    }

    loadDisabledExtensions() {
        try {
            if (fs.existsSync(this.disabledExtensionsFile)) {
                const disabledList = JSON.parse(fs.readFileSync(this.disabledExtensionsFile, 'utf8'));
                // FORCE ENABLE TYPESCRIPT & LLAMA: Filter it out of the disabled list
                const filteredList = disabledList.filter(id => id !== 'vscode.typescript-language-features' && id !== 'ggml-org.llama-vscode');
                if (filteredList.length !== disabledList.length) {
                    console.log('[ExtensionHost] Force-enabled vscode.typescript-language-features / ggml-org.llama-vscode');
                }
                this.disabledExtensions = new Set(filteredList);
                console.log(`[ExtensionHost] Loaded ${this.disabledExtensions.size} disabled extensions`);
            }
        } catch (error) {
            console.error('[ExtensionHost] Failed to load disabled extensions:', error);
        }
    }

    saveDisabledExtensions() {
        try {
            const data = Array.from(this.disabledExtensions);
            fs.writeFileSync(this.disabledExtensionsFile, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('[ExtensionHost] Failed to save disabled extensions:', err);
        }
    }

    async enableExtension(extensionId) {
        let changed = false;
        if (this.disabledExtensions.has(extensionId)) {
            this.disabledExtensions.delete(extensionId);
            this.saveDisabledExtensions();
            console.log(`[ExtensionHost] Enabled extension: ${extensionId}`);
            changed = true;
        }

        // Always try to activate it if it's loaded
        if (this.extensions.has(extensionId)) {
            const descriptor = this.extensions.get(extensionId);
            if (!descriptor.isActive) {
                await this.activateExtension(extensionId, '*', true);
                changed = true;
            }
        }

        // FIX: Notify VSCodeAPI of extension state change
        if (changed) {
            this.emit('extensions-changed');
            if (this.api) {
                this.api.emitExtensionsChange();
            }
        }

        return changed;
    }

    async disableExtension(extensionId) {
        if (!this.disabledExtensions.has(extensionId)) {
            this.disabledExtensions.add(extensionId);
            this.saveDisabledExtensions();
            console.log(`[ExtensionHost] Disabled extension: ${extensionId}`);

            // Deactivate if active
            if (this.activatedExtensions.has(extensionId)) {
                await this.deactivateExtension(extensionId);
            }

            // FIX: Notify VSCodeAPI of extension state change
            this.emit('extensions-changed');
            if (this.api) {
                this.api.emitExtensionsChange();
            }

            return true;
        }
        return false;
    }

    /**
     * Patch module loader to inject 'vscode' module
     */
    patchModuleLoader() {
        const originalLoad = Module._load;
        const self = this;

        Module._load = function (request, parent, isMain) {
            if (request === 'vscode') {
                // Create the API object
                const vscode = self.api.getVSCodeAPI();

                // Make vscode global for the extension
                global.vscode = vscode;
                return vscode;
            }
            return originalLoad.apply(this, arguments);
        };
    }

    // FIX: Add resolveWebviewView method
    async resolveWebviewView(viewId, webviewView) {
        if (this.api) {
            await this.api.resolveWebviewView(viewId, webviewView);
        }
    }

    setWorkspaceRoot(rootPath) {
        if (this.workspaceRoot !== rootPath) {
            console.log(`[ExtensionHost] Workspace root changed: ${this.workspaceRoot} -> ${rootPath}`);
            this.workspaceRoot = rootPath;
            if (this.api && this.api.handleWorkspaceFoldersChange) {
                this.api.handleWorkspaceFoldersChange();
            }
        }
    }

    /**
     * Load an extension from a directory
     */
    async loadExtension(extensionPath) {
        try {
            const manifestPath = path.join(extensionPath, 'package.json');
            if (!fs.existsSync(manifestPath)) {
                throw new Error('No package.json found');
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            // Use publisher.name as ID
            const id = `${manifest.publisher}.${manifest.name}`;

            const descriptor = {
                id,
                extensionPath,
                manifest,
                isActive: false,
                exports: undefined,
                isDisabled: false
            };

            this.extensions.set(id, descriptor);

            // FIX: Notify VSCodeAPI of new extension loaded
            this.emit('extensions-changed');
            if (this.api) {
                this.api.emitExtensionsChange();
            }

            this.sendRegisteredViews();

            return descriptor;
        } catch (err) {
            console.error(`[ExtensionHost] Failed to load extension from ${extensionPath}:`, err);
            throw err;
        }
    }

    /**
     * Activate an extension
     */
    async activateExtension(extensionId, activationEvent = '*', force = false) {
        const descriptor = this.extensions.get(extensionId);
        if (!descriptor) return false;
        if (descriptor.isActive) return true;

        if (descriptor.isDisabled && !force) {
            return false;
        }

        try {
            console.log(`[ExtensionHost] Activating ${extensionId}`);

            if (descriptor.manifest.main) {
                const mainPath = path.join(descriptor.extensionPath, descriptor.manifest.main);
                // Ensure we can require relative paths from the extension
                // This might need more robust handling if extension uses complex requires
                const extensionModule = require(mainPath);

                if (extensionModule.activate) {
                    // FIX: Create extension URI for context
                    const Uri = this.api.getAPI().Uri;
                    const extensionUri = Uri.file(descriptor.extensionPath);

                    const context = {
                        subscriptions: [],
                        extensionPath: descriptor.extensionPath,
                        extensionUri: extensionUri, // FIX: Add extensionUri
                        extension: this.api.getAPI().extensions.getExtension(extensionId), // FIX: Add extension object
                        storageUri: Uri.file(path.join(this.storageDir, descriptor.id, 'workspace')),
                        globalStorageUri: Uri.file(path.join(this.storageDir, descriptor.id, 'global')),
                        logUri: Uri.file(path.join(this.storageDir, descriptor.id, 'log')),
                        // FIX: Add legacy string paths for compatibility
                        storagePath: path.join(this.storageDir, descriptor.id, 'workspace'),
                        globalStoragePath: path.join(this.storageDir, descriptor.id, 'global'),
                        // FIX: Add extensionMode (Production = 1)
                        extensionMode: 1,
                        // FIX: Add secrets mock
                        secrets: {
                            get: async (key) => { return undefined; },
                            store: async (key, value) => { },
                            delete: async (key) => { },
                            onDidChange: (listener) => { return { dispose: () => { } }; }
                        },
                        globalState: {
                            get: (key, defaultValue) => this.globalState?.get(key) ?? defaultValue,
                            update: (key, value) => {
                                if (!this.globalState) this.globalState = new Map();
                                this.globalState.set(key, value);
                                return Promise.resolve();
                            },
                            setKeysForSync: (keys) => { }
                        },
                        workspaceState: {
                            get: (key, defaultValue) => this.workspaceState?.get(key) ?? defaultValue,
                            update: (key, value) => {
                                if (!this.workspaceState) this.workspaceState = new Map();
                                this.workspaceState.set(key, value);
                                return Promise.resolve();
                            }
                        },
                        environmentVariableCollection: {
                            replace: (variable, value) => { },
                            append: (variable, value) => { },
                            prepend: (variable, value) => { },
                            get: (variable) => undefined,
                            forEach: (callback) => { },
                            delete: (variable) => { },
                            clear: () => { }
                        },
                        asAbsolutePath: (relativePath) => path.join(descriptor.extensionPath, relativePath)
                    };

                    // FIX: Wrap activation in try-catch to allow partial initialization
                    // Some extensions may fail during provider registration but still be partially functional
                    try {
                        descriptor.exports = await extensionModule.activate(context);
                        console.log(`[ExtensionHost] Successfully activated ${extensionId}`);
                    } catch (activationError) {
                        console.error(`[ExtensionHost] Error during ${extensionId} activation (allowing partial initialization):`, activationError);
                        // Don't rethrow - allow extension to be marked as active even if activation had errors
                        descriptor.exports = {}; // Provide empty exports
                    }
                }
            } else {
                // Declarative extension (e.g. themes, snippets)
                // console.log(`[ExtensionHost] Extension ${extensionId} has no main entry point`);
            }

            descriptor.isActive = true;
            this.activatedExtensions.add(extensionId);

            // FIX: Notify VSCodeAPI of extension activation
            this.emit('extensions-changed');
            if (this.api) {
                this.api.emitExtensionsChange();
            }

            return true;
        } catch (err) {
            console.error(`[ExtensionHost] Failed to activate ${extensionId}:`, err);
            return false;
        }
    }

    /**
     * Deactivate an extension
     */
    async deactivateExtension(extensionId) {
        const descriptor = this.extensions.get(extensionId);
        if (!descriptor || !descriptor.isActive) return;

        try {
            if (descriptor.manifest.main) {
                const mainPath = path.join(descriptor.extensionPath, descriptor.manifest.main);
                // We can't easily "un-require" a module in Node.js without clearing cache
                // But we can call deactivate if it exists
                const extensionModule = require(mainPath);
                if (extensionModule.deactivate) {
                    await extensionModule.deactivate();
                }
            }
        } catch (err) {
            console.error(`[ExtensionHost] Error deactivating ${extensionId}:`, err);
        }

        descriptor.isActive = false;
        this.activatedExtensions.delete(extensionId);
    }

    /**
     * Activate extensions by event
     */
    async activateByEvent(event) {
        const promises = [];
        for (const descriptor of this.extensions.values()) {
            if (!descriptor.isActive && descriptor.manifest.activationEvents) {
                if (descriptor.manifest.activationEvents.includes(event) || descriptor.manifest.activationEvents.includes('*')) {
                    promises.push(this.activateExtension(descriptor.id, event));
                }
            }
        }
        await Promise.all(promises);
    }

    /**
     * Get bundled extensions registry
     */
    getBundledRegistry() {
        const sourceDir = path.join(__dirname, '../../bundled-extensions');
        const registryPath = path.join(sourceDir, 'registry.json');

        if (!fs.existsSync(registryPath)) {
            return [];
        }

        try {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            return registry.extensions || [];
        } catch (err) {
            console.error('[ExtensionHost] Failed to read registry:', err);
            return [];
        }
    }

    /**
     * Install a specific bundled extension
     */
    async installBundledExtension(extensionId) {
        console.log(`[ExtensionHost] Installing bundled extension: ${extensionId}`);
        const sourceDir = path.join(__dirname, '../../bundled-extensions');
        const registryPath = path.join(sourceDir, 'registry.json');

        if (!fs.existsSync(registryPath)) {
            throw new Error('Registry not found');
        }

        const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        const ext = registry.extensions.find(e => e.id === extensionId);

        if (!ext) {
            throw new Error(`Extension ${extensionId} not found in registry`);
        }

        const vsixName = path.basename(ext.downloadUrl);
        const vsixPath = path.join(sourceDir, vsixName);
        const installPath = path.join(this.bundledExtensionsDir, ext.id);

        if (fs.existsSync(installPath)) {
            console.log(`[ExtensionHost] Extension ${ext.id} already installed`);
            return true;
        }

        if (fs.existsSync(vsixPath)) {
            console.log(`[ExtensionHost] Unpacking ${vsixName} to ${installPath}`);

            // Create temp dir for extraction
            const tempDir = path.join(this.bundledExtensionsDir, `${ext.id}_temp`);
            if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
            fs.mkdirSync(tempDir, { recursive: true });

            try {
                // Unzip .vsix (it's a zip file)
                const directory = await unzipper.Open.file(vsixPath);
                await directory.extract({ path: tempDir });

                // Move 'extension' folder to final destination
                const extensionContent = path.join(tempDir, 'extension');
                if (fs.existsSync(extensionContent)) {
                    fs.renameSync(extensionContent, installPath);
                    console.log(`[ExtensionHost] Installed ${ext.id}`);
                    return true;
                } else {
                    throw new Error(`Invalid .vsix structure for ${vsixName}`);
                }
            } catch (err) {
                console.error(`[ExtensionHost] Failed to unpack ${vsixName}:`, err);
                throw err;
            } finally {
                // Cleanup temp
                if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
            }
        } else {
            throw new Error(`.vsix file not found: ${vsixPath}`);
        }
    }

    /**
     * Scan and load all extensions from extensions directory
     */
    async loadAllExtensions() {
        const loaded = [];

        // 1. Load user-installed extensions from ~/.peak/extensions
        if (fs.existsSync(this.extensionsDir)) {
            const extensionDirs = fs.readdirSync(this.extensionsDir)
                .filter(name => {
                    const fullPath = path.join(this.extensionsDir, name);
                    return fs.statSync(fullPath).isDirectory() && fs.existsSync(path.join(fullPath, 'package.json'));
                });

            for (const dir of extensionDirs) {
                try {
                    const extensionPath = path.join(this.extensionsDir, dir);
                    const descriptor = await this.loadExtension(extensionPath);

                    if (this.disabledExtensions.has(descriptor.id)) {
                        console.log(`[ExtensionHost] Extension ${descriptor.id} is disabled, skipping activation`);
                        descriptor.isDisabled = true;
                    }

                    loaded.push(descriptor);
                } catch (err) {
                    console.error(`[ExtensionHost] Failed to load extension from ${dir}:`, err);
                }
            }
        }

        // 2. Load bundled extensions from ~/.peak/bundled-extensions
        if (fs.existsSync(this.bundledExtensionsDir)) {
            const bundledExtensions = fs.readdirSync(this.bundledExtensionsDir)
                .filter(name => {
                    const fullPath = path.join(this.bundledExtensionsDir, name);
                    return fs.statSync(fullPath).isDirectory();
                });

            console.log(`[ExtensionHost] Found ${bundledExtensions.length} installed bundled extensions`);

            for (const dir of bundledExtensions) {
                try {
                    const extensionPath = path.join(this.bundledExtensionsDir, dir);
                    const descriptor = await this.loadExtension(extensionPath);

                    if (this.disabledExtensions.has(descriptor.id)) {
                        console.log(`[ExtensionHost] Extension ${descriptor.id} is disabled, skipping activation`);
                        descriptor.isDisabled = true;
                    }

                    loaded.push(descriptor);
                } catch (err) {
                    console.error(`[ExtensionHost] Failed to load bundled extension from ${dir}:`, err);
                }
            }
        }

        console.log(`[ExtensionHost] Loaded ${loaded.length} extensions total`);
        return loaded;
    }

    /**
     * Get extension descriptor by ID
     */
    getExtension(extensionId) {
        return this.extensions.get(extensionId);
    }

    /**
     * Get all loaded extensions
     */
    getExtensions() {
        return Array.from(this.extensions.values());
    }

    /**
     * Register a command
     */
    registerCommand(command, callback) {
        this.commandRegistry.set(command, callback);
        return {
            dispose: () => {
                this.commandRegistry.delete(command);
            }
        };
    }

    /**
     * Execute a command
     */
    async executeCommand(command, ...args) {
        const callback = this.commandRegistry.get(command);
        if (callback) {
            try {
                return await callback(...args);
            } catch (err) {
                console.error(`[ExtensionHost] Command ${command} failed:`, err);
                throw err;
            }
        } else {
            // console.warn(`[ExtensionHost] Command ${command} not found`);
        }
    }

    /**
     * Get icon theme definition
     */
    async getIconTheme(themeId) {
        // Find extension that contributes this theme
        for (const descriptor of this.extensions.values()) {
            const themes = descriptor.manifest.contributes?.iconThemes;
            if (themes) {
                const theme = themes.find(t => t.id === themeId);
                if (theme) {
                    const themePath = path.join(descriptor.extensionPath, theme.path);
                    if (fs.existsSync(themePath)) {
                        try {
                            const themeContent = JSON.parse(fs.readFileSync(themePath, 'utf8'));
                            // Resolve relative paths in theme definition
                            if (themeContent.iconDefinitions) {
                                for (const key in themeContent.iconDefinitions) {
                                    const def = themeContent.iconDefinitions[key];
                                    if (def.iconPath) {
                                        def.iconPath = `file://${path.join(path.dirname(themePath), def.iconPath)}`;
                                    }
                                }
                            }
                            return themeContent;
                        } catch (err) {
                            console.error(`[ExtensionHost] Failed to load icon theme ${themeId}:`, err);
                        }
                    }
                }
            }
        }
        return null;
    }


    /**
     * Dispose all extensions and clean up
     */
    async dispose() {
        console.log('[ExtensionHost] Disposing all extensions');

        for (const extensionId of this.activatedExtensions) {
            await this.deactivateExtension(extensionId);
        }

        if (this.lspClient) {
            await this.lspClient.shutdown();
        }

        this.extensions.clear();
        this.commandRegistry.clear();
    }
    /**
     * Get extension README content
     * @param {string} extensionId
     */
    getExtensionReadme(extensionId) {
        const descriptor = this.extensions.get(extensionId);
        if (!descriptor) {
            return null;
        }

        const readmeNames = ['README.md', 'readme.md', 'Readme.md', 'README.txt', 'readme.txt'];
        for (const name of readmeNames) {
            const readmePath = path.join(descriptor.extensionPath, name);
            if (fs.existsSync(readmePath)) {
                return fs.readFileSync(readmePath, 'utf8');
            }
        }

        return '# No README found';
    }

    /**
     * Handle document open event
     */
    onDidOpenDocument(uri, languageId, text, version) {
        if (!this.api) return;

        const api = this.api.getAPI();
        const docUri = api.Uri.parse(uri);

        // Create TextDocument instance
        const document = new api.TextDocument(docUri, languageId, version, () => text);

        console.log(`[ExtensionHost] onDidOpenDocument: ${uri} (${languageId})`);

        // Notify LSP Client
        if (this.lspClient) {
            this.lspClient.didOpenDocument(uri, languageId, text, version);
        }

        // Trigger activation events and wait for them
        this.activateByEvent(`onLanguage:${languageId}`).then(() => {
            console.log(`[ExtensionHost] Activation for ${languageId} completed. Notifying open document.`);
            this.api.handleDidOpenTextDocument(document);
        }).catch(err => {
            console.error(`[ExtensionHost] Activation failed for ${languageId}:`, err);
            // Still notify open even if activation failed, so other extensions might see it
            this.api.handleDidOpenTextDocument(document);
        });
    }

    /**
     * Handle document change event
     */
    onDidChangeDocument(uri, changes, newText) {
        if (!this.api) return;
        const api = this.api.getAPI();
        const docUri = api.Uri.parse(uri);

        // Update VSCodeAPI document state
        // We need to construct a proper TextDocumentChangeEvent
        // For simplicity, we just update the document text in the store
        // and emit the event.

        // Note: VSCodeAPI needs a way to update the document text.
        // We'll assume handleDidChangeTextDocument takes care of it or we need to update the store directly.

        this.api.handleDidChangeTextDocument(docUri, changes, newText);
    }

    /**
     * Handle document close event
     */
    onDidCloseDocument(uri) {
        if (!this.api) return;
        const api = this.api.getAPI();
        const docUri = api.Uri.parse(uri);
        const document = { uri: docUri }; // Minimal document object for close event

        // Notify LSP Client
        if (this.lspClient) {
            this.lspClient.didCloseDocument(uri);
        }

        this.api.handleDidCloseTextDocument(document);
    }

    /**
     * Forcefully terminate extension host and child processes
     */
    terminate() {
        if (this.lspClient) {
            this.lspClient.terminate();
        }
    }
}

module.exports = ExtensionHost;
