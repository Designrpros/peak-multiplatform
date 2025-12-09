// src/services/BundledExtensions.js
// Manages bundled extensions that ship with Peak

const fs = require('fs');
const path = require('path');

/**
 * BundledExtensions manages a local repository of popular extensions
 * that are pre-downloaded and bundled with Peak for offline use
 */
class BundledExtensions {
    constructor() {
        // Bundled extensions are stored in the app's resources
        this.bundledDir = path.join(__dirname, '../../bundled-extensions');
        this.extensionRegistry = this.loadRegistry();
    }

    /**
     * Load the registry of bundled extensions
     */
    loadRegistry() {
        const registryPath = path.join(this.bundledDir, 'registry.json');

        try {
            if (fs.existsSync(registryPath)) {
                return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            }
        } catch (err) {
            console.error('[BundledExtensions] Failed to load registry:', err);
        }

        // Default registry with popular extensions
        // These would be pre-downloaded .vsix files in the bundled-extensions directory
        return [
            {
                id: 'vscode.typescript-language-features',
                name: 'TypeScript and JavaScript Language Features',
                publisher: 'vscode',
                description: 'Provides rich language support for TypeScript and JavaScript',
                version: 'latest',
                category: 'Programming Languages',
                icon: '📘',
                bundled: true,
                vsixFile: 'vscode.typescript-language-features.vsix'
            },
            {
                id: 'ms-python.python',
                name: 'Python',
                publisher: 'ms-python',
                description: 'IntelliSense, linting, debugging, code navigation for Python',
                version: 'latest',
                category: 'Programming Languages',
                icon: '🐍',
                bundled: true,
                vsixFile: 'ms-python.python.vsix'
            },
            {
                id: 'dbaeumer.vscode-eslint',
                name: 'ESLint',
                publisher: 'dbaeumer',
                description: 'Integrates ESLint JavaScript linting',
                version: 'latest',
                category: 'Linters',
                icon: '🔍',
                bundled: true,
                vsixFile: 'dbaeumer.vscode-eslint.vsix'
            },
            {
                id: 'esbenp.prettier-vscode',
                name: 'Prettier - Code formatter',
                publisher: 'esbenp',
                description: 'Code formatter using prettier',
                version: 'latest',
                category: 'Formatters',
                icon: '✨',
                bundled: true,
                vsixFile: 'esbenp.prettier-vscode.vsix'
            },
            {
                id: 'PKief.material-icon-theme',
                name: 'Material Icon Theme',
                publisher: 'PKief',
                description: 'Material Design Icons for Visual Studio Code',
                version: '5.12.0',
                category: 'Themes',
                icon: '🎨',
                bundled: true,
                vsixFile: 'PKief.material-icon-theme-5.12.0.vsix'
            },
            {
                id: 'dracula-theme.theme-dracula',
                name: 'Dracula Official',
                publisher: 'dracula-theme',
                description: 'Official Dracula Theme',
                version: 'latest',
                category: 'Themes',
                icon: '🧛',
                bundled: true,
                vsixFile: 'dracula-theme.theme-dracula.vsix'
            },
            {
                id: 'rust-lang.rust-analyzer',
                name: 'rust-analyzer',
                publisher: 'rust-lang',
                description: 'Rust language support',
                version: 'latest',
                category: 'Programming Languages',
                icon: '🦀',
                bundled: true,
                vsixFile: 'rust-lang.rust-analyzer.vsix'
            },

        ];
    }

    /**
     * Get all bundled extensions
     */
    getBundledExtensions() {
        return this.extensionRegistry.map(ext => ({
            ...ext,
            // Check if .vsix file actually exists
            available: this.isAvailable(ext.vsixFile)
        }));
    }

    /**
     * Check if a bundled extension's .vsix file exists
     */
    isAvailable(vsixFile) {
        const vsixPath = path.join(this.bundledDir, vsixFile);
        return fs.existsSync(vsixPath);
    }

    /**
     * Get path to bundled .vsix file
     */
    getBundledVsixPath(extensionId) {
        const extension = this.extensionRegistry.find(ext => ext.id === extensionId);

        if (!extension) {
            return null;
        }

        const vsixPath = path.join(this.bundledDir, extension.vsixFile);

        if (fs.existsSync(vsixPath)) {
            return vsixPath;
        }

        return null;
    }

    /**
     * Get bundled extension metadata
     */
    getBundledExtension(extensionId) {
        return this.extensionRegistry.find(ext => ext.id === extensionId);
    }

    /**
     * Search bundled extensions
     */
    searchBundled(query) {
        const lowerQuery = query.toLowerCase();

        return this.extensionRegistry.filter(ext => {
            return ext.name.toLowerCase().includes(lowerQuery) ||
                ext.description.toLowerCase().includes(lowerQuery) ||
                ext.category.toLowerCase().includes(lowerQuery);
        });
    }

    /**
     * Get extensions by category
     */
    getByCategory(category) {
        return this.extensionRegistry.filter(ext => ext.category === category);
    }

    /**
     * Get all categories
     */
    getCategories() {
        const categories = new Set(this.extensionRegistry.map(ext => ext.category));
        return Array.from(categories);
    }
}

module.exports = BundledExtensions;
