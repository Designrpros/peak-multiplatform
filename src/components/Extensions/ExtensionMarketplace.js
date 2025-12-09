// src/components/Extensions/ExtensionMarketplace.js
// Extension Marketplace UI Component

const { ipcRenderer } = require('electron');

// Try to load BundledExtensions, but don't fail if it errors
let BundledExtensions = null;
try {
    BundledExtensions = require('../../services/BundledExtensions');
    console.log('[ExtensionMarketplace] BundledExtensions loaded successfully');
} catch (err) {
    console.error('[ExtensionMarketplace] Failed to load BundledExtensions:', err);
}

console.log('[ExtensionMarketplace] Module loaded!');

class ExtensionMarketplace {
    constructor(container) {
        console.log('[ExtensionMarketplace] Constructor called', container);
        this.container = container;
        this.extensions = [];
        this.activeTab = 'installed'; // 'installed' or 'browse'

        // Only initialize BundledExtensions if it loaded successfully
        if (BundledExtensions) {
            try {
                this.bundledExtensions = new BundledExtensions();
            } catch (err) {
                console.error('[ExtensionMarketplace] Failed to init BundledExtensions:', err);
                this.bundledExtensions = null;
            }
        }

        try {
            console.log('[ExtensionMarketplace] Starting render...');
            this.render();
            console.log('[ExtensionMarketplace] Render complete, attaching listeners...');
            this.attachListeners();
            console.log('[ExtensionMarketplace] Loading extensions...');
            this.loadExtensions();
            console.log('[ExtensionMarketplace] Initializing extension system...');
            this.initializeExtensionSystem();
        } catch (err) {
            console.error('[ExtensionMarketplace] Initialization error:', err);
        }
    }

    async initializeExtensionSystem() {
        const result = await ipcRenderer.invoke('extensions:init');
        if (result.error) {
            console.error('[ExtensionMarketplace] Init failed:', result.error);
        } else {
            console.log('[ExtensionMarketplace] Extension system initialized');
            await this.loadExtensions();
        }
    }

    async loadExtensions() {
        this.extensions = await ipcRenderer.invoke('extensions:list');
        this.renderExtensionsList();
        this.loadBundledExtensions();
    }

    async loadBundledExtensions() {
        try {
            this.bundledRegistry = await ipcRenderer.invoke('extensions:get-bundled-registry');
            this.renderBundledExtensionsList();
        } catch (err) {
            console.error('[ExtensionMarketplace] Failed to load bundled registry:', err);
        }
    }

    renderBundledExtensionsList() {
        const listContainer = document.getElementById('bundled-extensions-list');
        if (!listContainer) return;

        if (!this.bundledRegistry || this.bundledRegistry.length === 0) {
            listContainer.innerHTML = `
                <div style="padding:20px; text-align:center; color:var(--peak-secondary);">
                    <p style="font-size:11px;">No bundled extensions found.</p>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = this.bundledRegistry.map(ext => {
            const isInstalled = this.extensions.some(e => e.id === ext.id);
            return `
            <div class="extension-item" data-extension-id="${ext.id}">
                <div class="extension-item-header">
                    <div class="extension-icon">
                        <img src="assets/Peak.png" style="width:100%; height:100%; border-radius:4px;">
                    </div>
                    <div class="extension-info">
                        <div class="extension-name">${ext.name}</div>
                        <div class="extension-publisher">${ext.publisher} • v${ext.version}</div>
                    </div>
                    <div class="extension-actions">
                        ${isInstalled ?
                    `<span class="extension-status">Installed</span>` :
                    `<button class="extension-btn primary btn-install-bundled" data-extension-id="${ext.id}" title="Install">
                        <i data-lucide="download" style="width:14px; height:14px;"></i>
                    </button>`
                }
                    </div>
                </div>
                <div class="extension-description">
                    ${ext.description || 'No description available'}
                </div>
            </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    render() {
        console.log('[ExtensionMarketplace] render() called, container:', this.container);
        console.log('[ExtensionMarketplace] container.tagName:', this.container?.tagName);
        console.log('[ExtensionMarketplace] container.className:', this.container?.className);

        if (!this.container) {
            console.error('[ExtensionMarketplace] Container is null!');
            return;
        }

        this.container.innerHTML = `
            <div class="extension-marketplace">
                <div class="extension-header">
                    <div class="extension-tabs" style="display:flex; gap:4px; width: 100%;">
                        <button class="extension-tab active" data-tab="installed" style="flex:1; justify-content:center;">
                            <i data-lucide="package" style="width:14px; height:14px;"></i>
                            Installed
                        </button>
                        <button class="extension-tab" data-tab="browse" style="flex:1; justify-content:center;">
                            <i data-lucide="search" style="width:14px; height:14px;"></i>
                            Browse
                        </button>
                    </div>
                </div>

                <div class="extension-content">
                    <!-- Installed Tab -->
                    <div class="extension-tab-content active" id="ext-installed">
                        <div class="extension-list" id="installed-extensions-list">
                            <div style="padding:40px; text-align:center; color:var(--peak-secondary);">
                                <i data-lucide="package" style="width:32px; height:32px; opacity:0.3;"></i>
                                <p style="margin-top:12px; font-size:12px;">Loading extensions...</p>
                            </div>
                        </div>
                    </div>

                    <!-- Browse Tab -->
                    <div class="extension-tab-content" id="ext-browse">
                        <div class="extension-browse">
                            <div style="padding:16px;">
                                <div class="install-from-file" style="margin-bottom:16px;">
                                    <button class="btn-install-vsix" style="width:100%; justify-content:center;">
                                        <i data-lucide="upload" style="width:14px; height:14px;"></i>
                                        Install from .vsix File
                                    </button>
                                </div>

                                <div style="border-top:1px solid var(--border-color); padding-top:16px;">
                                    <h3 style="font-size:12px; font-weight:600; margin-bottom:8px;">Bundled Extensions</h3>
                                    <div class="extension-list" id="bundled-extensions-list">
                                        <div style="padding:20px; text-align:center; color:var(--peak-secondary);">
                                            <p style="font-size:11px;">Loading bundled extensions...</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Details Modal -->
                <div id="extension-details-modal" class="extension-modal" style="display:none;">
                    <div class="extension-modal-content">
                        <div class="extension-modal-header">
                            <h3 id="modal-extension-name">Extension Name</h3>
                            <button class="btn-close-modal">×</button>
                        </div>
                        <div class="extension-modal-body" id="modal-extension-readme">
                            Loading...
                        </div>
                    </div>
                </div>
            </div>
    `;

        // Apply styles
        this.injectStyles();

        // Initialize lucide icons
        if (window.lucide) {
            window.lucide.createIcons();
        }

        console.log('[ExtensionMarketplace] Render complete');
    }

    injectStyles() {
        const styleId = 'extension-marketplace-styles';
        if (document.getElementById(styleId)) return;

        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .extension-marketplace {
                height: 100%;
                display: flex;
                flex-direction: column;
                background: var(--window-background-color);
                position: relative;
            }

            .extension-modal {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: 100;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .extension-modal-content {
                width: 90%;
                height: 90%;
                background: var(--window-background-color);
                border: 1px solid var(--border-color);
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            }

            .extension-modal-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .extension-modal-header h3 {
                margin: 0;
                font-size: 14px;
                font-weight: 600;
                color: var(--peak-primary);
            }

            .btn-close-modal {
                background: none;
                border: none;
                color: var(--peak-secondary);
                font-size: 18px;
                cursor: pointer;
                padding: 0 4px;
            }

            .btn-close-modal:hover {
                color: var(--peak-primary);
            }

            .extension-modal-body {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                font-size: 13px;
                line-height: 1.5;
                color: var(--peak-primary);
                white-space: pre-wrap;
                font-family: monospace;
            }

            .extension-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--border-color);
            }

            .extension-tabs {
                display: flex;
                gap: 4px;
            }

            .extension-tab {
                padding: 4px 10px;
                background: transparent;
                border: 1px solid var(--border-color);
                border-radius: 4px;
                color: var(--peak-secondary);
                font-size: 11px;
                cursor: pointer;
                transition: all 0.2s;
                display: flex;
                align-items: center;
                gap: 4px;
            }

            .extension-tab:hover {
                background: var(--control-background-color);
                color: var(--peak-primary);
            }

            .extension-tab.active {
                background: var(--peak-accent);
                color: white;
                border-color: var(--peak-accent);
            }

            .extension-content {
                flex: 1;
                overflow-y: auto;
            }

            .extension-tab-content {
                display: none;
            }

            .extension-tab-content.active {
                display: block;
            }

            .extension-list {
                padding: 8px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .extension-item {
                background: var(--control-background-color);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                padding: 12px;
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .extension-item-header {
                display: flex;
                align-items: center;
                gap: 12px;
            }

            .extension-icon {
                width: 32px;
                height: 32px;
                border-radius: 4px;
                background: var(--peak-accent);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 16px;
                font-weight: 600;
                flex-shrink: 0;
            }

            .extension-info {
                flex: 1;
                min-width: 0;
            }

            .extension-name {
                font-weight: 600;
                font-size: 13px;
                color: var(--peak-primary);
                margin-bottom: 2px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .extension-publisher {
                font-size: 11px;
                color: var(--peak-secondary);
            }

            .extension-status {
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 10px;
                background: rgba(255, 255, 255, 0.1);
                color: var(--peak-secondary);
            }

            .extension-status.inactive {
                opacity: 0.7;
            }

            /* Markdown Styles */
            .markdown-body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                font-size: 14px;
                line-height: 1.6;
                color: var(--text-primary);
                padding: 20px;
            }
            .markdown-body h1, .markdown-body h2, .markdown-body h3 {
                margin-top: 24px;
                margin-bottom: 16px;
                font-weight: 600;
                line-height: 1.25;
                color: var(--text-primary);
            }
            .markdown-body h1 { font-size: 2em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
            .markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid var(--border-color); padding-bottom: 0.3em; }
            .markdown-body h3 { font-size: 1.25em; }
            .markdown-body p { margin-top: 0; margin-bottom: 16px; }
            .markdown-body a { color: var(--peak-primary); text-decoration: none; }
            .markdown-body a:hover { text-decoration: underline; }
            .markdown-body img { max-width: 100%; box-sizing: border-box; background-color: transparent; }
            .markdown-body code {
                padding: 0.2em 0.4em;
                margin: 0;
                font-size: 85%;
                background-color: rgba(127, 127, 127, 0.1);
                border-radius: 6px;
                font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
            }
            .markdown-body pre {
                padding: 16px;
                overflow: auto;
                font-size: 85%;
                line-height: 1.45;
                background-color: rgba(127, 127, 127, 0.05);
                border-radius: 6px;
                margin-bottom: 16px;
            }
            .markdown-body pre code { background-color: transparent; padding: 0; }
            .markdown-body blockquote {
                padding: 0 1em;
                color: var(--text-secondary);
                border-left: 0.25em solid var(--border-color);
                margin: 0 0 16px 0;
            }
            .markdown-body ul, .markdown-body ol { padding-left: 2em; margin-bottom: 16px; }
            .markdown-body hr {
                height: 0.25em;
                padding: 0;
                margin: 24px 0;
                background-color: var(--border-color);
                border: 0;
            }
            .markdown-body table {
                border-spacing: 0;
                border-collapse: collapse;
                margin-bottom: 16px;
                width: 100%;
            }
            .markdown-body table th, .markdown-body table td {
                padding: 6px 13px;
                border: 1px solid var(--border-color);
            }
            .markdown-body table th { font-weight: 600; }
            .markdown-body table tr:nth-child(2n) { background-color: rgba(127, 127, 127, 0.03); }

            .extension-description {
                font-size: 11px;
                color: var(--peak-secondary);
                line-height: 1.3;
                margin-bottom: 6px;
            }

            .extension-actions {
                display: flex;
                gap: 8px;
            }

            .extension-btn {
                padding: 4px 12px;
                border-radius: 4px;
                font-size: 11px;
                cursor: pointer;
                border: 1px solid var(--border-color);
                background: transparent;
                color: var(--peak-primary);
                transition: all 0.2s;
            }

            .extension-btn:hover {
                background: rgba(255, 255, 255, 0.1);
            }

            .extension-btn.primary {
                background: var(--peak-accent);
                border-color: var(--peak-accent);
                color: white;
            }

            .extension-btn.primary:hover {
                opacity: 0.9;
            }

            .extension-btn.danger {
                color: #ff6b6b;
                border-color: rgba(255, 107, 107, 0.3);
            }

            .extension-btn.danger:hover {
                background: rgba(255, 107, 107, 0.1);
            }

            .extension-browse {
                height: 100%;
                display: flex;
                flex-direction: column;
            }

            .install-from-file {
                display: flex;
                justify-content: center;
            }

            .btn-install-vsix {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 16px;
                background: var(--control-background-color);
                border: 1px solid var(--border-color);
                border-radius: 6px;
                color: var(--peak-primary);
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s;
            }

            .btn-install-vsix:hover {
                background: var(--peak-accent);
                color: white;
                border-color: var(--peak-accent);
            }
        `;
        document.head.appendChild(style);
    }

    renderExtensionsList() {
        const listContainer = document.getElementById('installed-extensions-list');
        console.log('[ExtensionMarketplace] Rendering extensions:', this.extensions);

        if (!this.extensions || this.extensions.length === 0) {
            listContainer.innerHTML = `
                <div style="padding:40px; text-align:center; color:var(--peak-secondary);">
                    <i data-lucide="package" style="width:32px; height:32px; opacity:0.3;"></i>
                    <p style="margin-top:12px; font-size:12px;">No extensions installed</p>
                    <p style="font-size:11px; margin-top:4px;">Install extensions from .vsix files or browse the marketplace</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        listContainer.innerHTML = this.extensions.map(ext => `
            <div class="extension-item" data-extension-id="${ext.id}">
                <div class="extension-item-header">
                    <div class="extension-icon">
                        ${ext.icon ?
                `<img src="${ext.icon}" style="width:100%; height:100%; border-radius:4px;" onerror="this.onerror=null;this.src='assets/Peak.png'">` :
                `<img src="assets/Peak.png" style="width:100%; height:100%; border-radius:4px;">`
            }
                    </div>
                    <div class="extension-info">
                        <div class="extension-name">${ext.name}</div>
                        <div class="extension-publisher">${ext.displayPublisher || ext.publisher} • v${ext.version}</div>
                    </div>
                    <div class="extension-actions">
                        ${ext.isActive ?
                `<button class="extension-btn btn-disable" data-extension-id="${ext.id}" title="Disable">
                        <i data-lucide="power" style="width:14px; height:14px;"></i>
                    </button>` :
                `<button class="extension-btn primary btn-enable" data-extension-id="${ext.id}" title="Enable">
                        <i data-lucide="power-off" style="width:14px; height:14px;"></i>
                    </button>`
            }
                        ${!ext.isBundled ?
                `<button class="extension-btn danger btn-uninstall" data-extension-id="${ext.id}" title="Uninstall">
                        <i data-lucide="trash-2" style="width:14px; height:14px;"></i>
                    </button>` :
                ''
            }
                        <button class="extension-btn btn-details" data-extension-id="${ext.id}" title="Details">
                            <i data-lucide="info" style="width:14px; height:14px;"></i>
                        </button>
                    </div>
                </div>
                <div class="extension-description">
                    ${ext.description || 'No description available'}
                </div>
            </div>
            `).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    attachListeners() {
        // Tab switching
        this.container.addEventListener('click', (e) => {
            const tab = e.target.closest('.extension-tab');
            if (tab) {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            }

            // Install from .vsix
            if (e.target.closest('.btn-install-vsix')) {
                this.installFromFile();
            }

            // Install bundled extension
            const installBundledBtn = e.target.closest('.btn-install-bundled');
            if (installBundledBtn) {
                const extensionId = installBundledBtn.dataset.extensionId;
                this.installBundledExtension(extensionId);
            }

            // Enable extension
            const enableBtn = e.target.closest('.btn-enable');
            if (enableBtn) {
                console.log('[ExtensionMarketplace] Enable button clicked', enableBtn.dataset.extensionId);
                const extensionId = enableBtn.dataset.extensionId;
                this.enableExtension(extensionId);
            }

            // Disable extension
            const disableBtn = e.target.closest('.btn-disable');
            if (disableBtn) {
                const extensionId = disableBtn.dataset.extensionId;
                this.disableExtension(extensionId);
            }

            // Uninstall extension
            const uninstallBtn = e.target.closest('.btn-uninstall');
            if (uninstallBtn) {
                const extensionId = uninstallBtn.dataset.extensionId;
                this.uninstallExtension(extensionId);
            }

            // Details
            const detailsBtn = e.target.closest('.btn-details');
            if (detailsBtn) {
                const extensionId = detailsBtn.dataset.extensionId;
                this.showExtensionDetails(extensionId);
            }

            // Close modal
            if (e.target.closest('.btn-close-modal') || e.target === document.getElementById('extension-details-modal')) {
                this.closeModal();
            }
        });
    }

    async showExtensionDetails(extensionId) {
        const modal = document.getElementById('extension-details-modal');
        const nameEl = document.getElementById('modal-extension-name');
        const bodyEl = document.getElementById('modal-extension-readme');

        const ext = this.extensions.find(e => e.id === extensionId);
        if (!ext) return;

        nameEl.textContent = ext.name;
        bodyEl.innerHTML = '<div style="display:flex; justify-content:center; padding:20px;">Loading README...</div>';
        modal.style.display = 'flex';

        // User requested to skip README loading due to potential crashes/issues
        bodyEl.innerHTML = `
            <div style="padding:20px;">
                <p><strong>${ext.description || 'No description available.'}</strong></p>
                <p style="margin-top:20px; color:var(--peak-secondary); font-size:11px;">
                    README display is currently disabled for stability.
                </p>
            </div>
        `;
    }

    closeModal() {
        const modal = document.getElementById('extension-details-modal');
        if (modal) modal.style.display = 'none';
    }

    switchTab(tabName) {
        this.activeTab = tabName;

        // Update tab buttons
        this.container.querySelectorAll('.extension-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        this.container.querySelectorAll('.extension-tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `ext-${tabName}`);
        });
    }

    async installBundledExtension(extensionId) {
        const btn = this.container.querySelector(`.btn-install-bundled[data-extension-id="${extensionId}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="spin" style="width:14px; height:14px;"></i>';
            if (window.lucide) window.lucide.createIcons();
        }

        try {
            const result = await ipcRenderer.invoke('extensions:install-bundled', extensionId);
            if (result.error) {
                alert(`Failed to install extension: ${result.error}`);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="download" style="width:14px; height:14px;"></i>';
                    if (window.lucide) window.lucide.createIcons();
                }
            } else {
                await this.loadExtensions();
            }
        } catch (err) {
            console.error('Install failed:', err);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="download" style="width:14px; height:14px;"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }

    async installFromFile() {
        const result = await ipcRenderer.invoke('dialog:open-file', {
            title: 'Select .vsix file',
            filters: [
                { name: 'VSCode Extension', extensions: ['vsix'] }
            ],
            properties: ['openFile']
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return;
        }

        const vsixPath = result.filePaths[0];
        console.log('[ExtensionMarketplace] Installing from:', vsixPath);

        const installResult = await ipcRenderer.invoke('extensions:install-vsix', vsixPath);

        if (installResult.error) {
            alert(`Installation failed: ${installResult.error} `);
        } else {
            alert(`Extension "${installResult.name}" installed successfully!`);
            await this.loadExtensions();
        }
    }

    async enableExtension(extensionId) {
        const result = await ipcRenderer.invoke('extensions:enable', extensionId);

        if (result.error) {
            alert(`Failed to enable extension: ${result.error} `);
        } else {
            await this.loadExtensions();
        }
    }

    async disableExtension(extensionId) {
        const result = await ipcRenderer.invoke('extensions:disable', extensionId);

        if (result.error) {
            alert(`Failed to disable extension: ${result.error} `);
        } else {
            await this.loadExtensions();
        }
    }

    async uninstallExtension(extensionId) {
        if (!confirm(`Are you sure you want to uninstall this extension ? `)) {
            return;
        }

        const result = await ipcRenderer.invoke('extensions:uninstall', extensionId);

        if (result.error) {
            alert(`Uninstall failed: ${result.error} `);
        } else {
            await this.loadExtensions();
        }
    }

    async showExtensionDetails(extensionId) {
        const readme = await ipcRenderer.invoke('extensions:get-readme', extensionId);

        // Remove existing modal if any
        const existingModal = this.container.querySelector('.extension-details-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.className = 'extension-details-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        `;

        const content = document.createElement('div');
        content.className = 'extension-details-content';
        content.style.cssText = `
            background: var(--bg-primary);
            width: 80%;
            height: 80%;
            border-radius: 8px;
            padding: 20px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            border: 1px solid var(--border-color);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--border-color);
        `;
        header.innerHTML = `
            <h2 style="margin: 0;">Extension Details: ${extensionId}</h2>
            <button class="btn-close" style="background: none; border: none; cursor: pointer; color: var(--text-primary);">
                <i data-lucide="x"></i>
            </button>
        `;

        const body = document.createElement('div');
        body.style.cssText = `
            flex: 1;
            overflow-y: auto;
            white-space: pre-wrap;
            font-family: monospace;
            padding: 10px;
            background: var(--bg-secondary);
            border-radius: 4px;
        `;
        body.textContent = readme || 'No README available.';

        content.appendChild(header);
        content.appendChild(body);
        modal.appendChild(content);
        this.container.appendChild(modal);

        if (window.lucide) window.lucide.createIcons();

        // Close handlers
        const closeBtn = header.querySelector('.btn-close');
        closeBtn.onclick = () => modal.remove();
        modal.onclick = (e) => {
            if (e.target === modal) modal.remove();
        };
    }
}

module.exports = ExtensionMarketplace;
