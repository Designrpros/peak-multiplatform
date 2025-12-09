// src/components/ProjectView/plugins.js
// Lightweight Plugin System for Peak Multiplatform

/**
 * Plugin Registry
 * Manages loading and executing plugins for sidebar and editor
 */
class PluginRegistry {
    constructor() {
        this.sidebarPlugins = [];
        this.editorPlugins = [];
        this.loaded = false;
    }

    /**
     * Register a sidebar plugin
     * @param {SidebarPlugin} plugin
     */
    registerSidebarPlugin(plugin) {
        if (plugin instanceof SidebarPlugin) {
            this.sidebarPlugins.push(plugin);
            console.log(`[PluginRegistry] Registered sidebar plugin: ${plugin.name}`);
        }
    }

    /**
     * Register an editor plugin
     * @param {EditorPlugin} plugin
     */
    registerEditorPlugin(plugin) {
        if (plugin instanceof EditorPlugin) {
            this.editorPlugins.push(plugin);
            console.log(`[PluginRegistry] Registered editor plugin: ${plugin.name}`);
        }
    }

    /**
     * Trigger sidebar plugin hooks
     */
    triggerSidebarHook(hookName, ...args) {
        this.sidebarPlugins.forEach(plugin => {
            if (typeof plugin[hookName] === 'function') {
                try {
                    plugin[hookName](...args);
                } catch (err) {
                    console.error(`[Plugin ${plugin.name}] Error in ${hookName}:`, err);
                }
            }
        });
    }

    /**
     * Trigger editor plugin hooks
     */
    triggerEditorHook(hookName, ...args) {
        const results = [];
        this.editorPlugins.forEach(plugin => {
            if (typeof plugin[hookName] === 'function') {
                try {
                    const result = plugin[hookName](...args);
                    if (result !== undefined) {
                        results.push(result);
                    }
                } catch (err) {
                    console.error(`[Plugin ${plugin.name}] Error in ${hookName}:`, err);
                }
            }
        });
        return results.flat(); // Flatten array of results
    }
}

/**
 * Base class for sidebar plugins
 * Plugins can extend this to add custom functionality to the file tree
 */
class SidebarPlugin {
    constructor(name, version = '1.0.0') {
        this.name = name;
        this.version = version;
    }

    /**
     * Called when a tree item is rendered
     * @param {Object} item - The file/folder item {name, path, isDirectory}
     * @param {HTMLElement} element - The DOM element for this item
     */
    onFileRender(item, element) {
        // Override in subclass
    }

    /**
     * Called when context menu is about to show
     * @param {Object} file - The file/folder being right-clicked
     * @param {Array} menuItems - Array of menu items to modify
     * @returns {Array} Modified menu items
     */
    onContextMenu(file, menuItems) {
        // Override in subclass
        return menuItems;
    }

    /**
     * Called when a file is opened
     * @param {String} filePath - Absolute path to the opened file
     */
    onFileOpen(filePath) {
        // Override in subclass
    }

    /**
     * Called when a file is saved
     * @param {String} filePath - Absolute path to the saved file
     */
    onFileSave(filePath) {
        // Override in subclass
    }

    /**
     * Called when sidebar is initialized
     * @param {HTMLElement} sidebarContainer - The sidebar container element
     */
    onInit(sidebarContainer) {
        // Override in subclass
    }
}

/**
 * Base class for editor plugins
 * Plugins can extend this to add custom functionality to CodeMirror
 */
class EditorPlugin {
    constructor(name, version = '1.0.0') {
        this.name = name;
        this.version = version;
    }

    /**
     * Called when editor is created
     * @param {EditorView} editor - CodeMirror EditorView instance
     * @param {String} filePath - Path of the file being edited
     */
    onEditorCreate(editor, filePath) {
        // Override in subclass
    }

    /**
     * Get completion provider
     * @param {EditorState} state - CodeMirror state
     * @param {Number} pos - Cursor position
     * @returns {Array|null} Array of completion items or null
     */
    getCompletionProvider(state, pos) {
        // Override in subclass
        return null;
    }

    /**
     * Get hover tooltip provider
     * @param {EditorState} state - CodeMirror state
     * @param {Number} pos - Cursor position
     * @returns {String|null} Tooltip text or null
     */
    getHoverProvider(state, pos) {
        // Override in subclass
        return null;
    }

    /**
     * Get custom linter
     * @returns {Function|null} Linter function or null
     */
    getLinter() {
        // Override in subclass
        return null;
    }

    /**
     * Get CodeMirror extensions to add
     * @returns {Array} Array of CodeMirror extensions
     */
    getExtensions() {
        // Override in subclass
        return [];
    }
}

/**
 * Example Plugin: Git Status Indicator
 * Shows git status icons next to files (modified, added, deleted)
 */
class GitStatusPlugin extends SidebarPlugin {
    constructor() {
        super('GitStatus', '1.0.0');
        this.modifiedFiles = new Set();
    }

    onFileRender(item, element) {
        // Add git status indicator if file is modified
        if (!item.isDirectory && this.modifiedFiles.has(item.path)) {
            const indicator = document.createElement('span');
            indicator.textContent = 'M';
            indicator.style.cssText = 'color:orange; font-size:10px; margin-left:6px; font-weight:bold;';
            element.appendChild(indicator);
        }
    }

    markModified(filePath) {
        this.modifiedFiles.add(filePath);
    }

    clearModified(filePath) {
        this.modifiedFiles.delete(filePath);
    }
}

/**
 * Example Plugin: TODO Highlighter
 * Highlights files containing TODO comments
 */
class TodoHighlighterPlugin extends EditorPlugin {
    constructor() {
        super('TodoHighlighter', '1.0.0');
    }

    getLinter() {
        return (view) => {
            const diagnostics = [];
            const text = view.state.doc.toString();
            const lines = text.split('\n');

            lines.forEach((line, index) => {
                // Check for TODO, FIXME, HACK comments
                const todoMatch = line.match(/\/\/\s*(TODO|FIXME|HACK):?\s*(.+)/i);
                if (todoMatch) {
                    const from = view.state.doc.line(index + 1).from;
                    const to = view.state.doc.line(index + 1).to;

                    diagnostics.push({
                        from,
                        to,
                        severity: 'info',
                        message: `${todoMatch[1]}: ${todoMatch[2] || 'Task marker'}`,
                        source: 'TodoHighlighter'
                    });
                }
            });

            return diagnostics;
        };
    }
}

// Global plugin registry instance
const pluginRegistry = new PluginRegistry();

// Export
module.exports = {
    PluginRegistry,
    SidebarPlugin,
    EditorPlugin,
    GitStatusPlugin,
    TodoHighlighterPlugin,
    pluginRegistry
};
