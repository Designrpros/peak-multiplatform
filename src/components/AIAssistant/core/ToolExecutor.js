/**
 * ToolExecutor.js
 * 
 * Centralized tool execution engine.
 * Replaces scattered tool logic across ChatView and individual tool files.
 * 
 * Responsibilities:
 * - Register all available tools
 * - Execute tool calls (from AI stream or user clicks)
 * - Track execution state (pending, running, complete, error)
 * - Apply settings to tool execution
 * - Emit results to StateStore
 */

const { ipcRenderer } = require('electron');
const StateStore = require('./StateStore');

class ToolExecutor {
    constructor() {
        this.tools = new Map(); // toolName -> handler function
        this.executionCounter = 0;

        // Register built-in tools
        this._registerBuiltInTools();

        // Subscribe to settings for reactive tool behavior
        StateStore.subscribeTo('settings', (settings) => {
            this.currentSettings = settings;
        });

        this.currentSettings = StateStore.getState().settings;
    }

    /**
     * Register a tool
     * @param {string} name - Tool name (e.g., 'view_file')
     * @param {Function} handler - Async function to execute tool
     * @param {object} config - Tool configuration (autoExecute, requiresConfirmation, etc.)
     */
    registerTool(name, handler, config = {}) {
        if (this.tools.has(name)) {
            console.warn(`[ToolExecutor] Tool "${name}" already registered, overwriting`);
        }

        this.tools.set(name, {
            name,
            handler,
            config: {
                autoExecute: config.autoExecute || false,
                requiresConfirmation: config.requiresConfirmation || false,
                description: config.description || '',
                ...config
            }
        });

        // console.log(`[ToolExecutor] Registered tool: ${name}`);
    }

    /**
     * Execute a tool
     * @param {string} toolName - Name of tool to execute
     * @param {object} args - Tool arguments
     * @param {object} options - Execution options (skipConfirmation, onProgress, etc.)
     */
    async executeTool(toolName, args = {}, options = {}) {
        const tool = this.tools.get(toolName);

        if (!tool) {
            throw new Error(`Tool "${toolName}" not found`);
        }

        // Generate execution ID
        const executionId = `${toolName}-${++this.executionCounter}-${Date.now()}`;

        // console.log(`[ToolExecutor] Executing tool: ${toolName}`, { executionId, args });

        // Check if confirmation required (based on settings and tool config)
        const needsConfirmation = this._needsConfirmation(tool);
        if (needsConfirmation && !options.skipConfirmation) {
            console.log(`[ToolExecutor] Tool "${toolName}" requires confirmation`);

            // Update state: pending confirmation
            this._updateToolState(executionId, {
                toolName,
                args,
                status: 'pending_confirmation',
                startTime: Date.now()
            });

            // Emit event for UI to show confirmation dialog
            StateStore.emit('tool:confirmation-required', {
                executionId,
                toolName,
                args,
                tool: tool.config
            });

            return executionId;
        }

        // Update state: executing
        this._updateToolState(executionId, {
            toolName,
            args,
            status: 'executing',
            startTime: Date.now()
        });

        try {
            // Execute tool with settings context
            const result = await tool.handler({
                ...args,
                settings: this.currentSettings,
                onProgress: (progress) => {
                    this._updateToolState(executionId, {
                        status: 'executing',
                        progress
                    });
                }
            });

            // Update state: complete
            this._updateToolState(executionId, {
                status: 'complete',
                endTime: Date.now(),
                result
            });

            // Emit completion event
            StateStore.emit('tool:complete', {
                executionId,
                toolName,
                result
            });

            // console.log(`[ToolExecutor] Tool "${toolName}" completed successfully`);
            return result;

        } catch (error) {
            console.error(`[ToolExecutor] Tool "${toolName}" failed:`, error);

            // Update state: error
            this._updateToolState(executionId, {
                status: 'error',
                endTime: Date.now(),
                error: error.message
            });

            // Emit error event
            StateStore.emit('tool:error', {
                executionId,
                toolName,
                error: error.message
            });

            throw error;
        }
    }

    /**
     * Confirm pending tool execution
     */
    async confirmExecution(executionId) {
        const state = StateStore.getState();
        const execution = state.tools.executing.get(executionId);

        if (!execution || execution.status !== 'pending_confirmation') {
            throw new Error(`No pending execution found for ID: ${executionId}`);
        }

        console.log(`[ToolExecutor] ✅ User approved "${execution.toolName}", re-executing...`);

        // Re-execute with confirmation skipped
        try {
            const result = await this.executeTool(execution.toolName, execution.args, { skipConfirmation: true });
            console.log(`[ToolExecutor] Tool "${execution.toolName}" completed successfully, result:`, result);

            // Emit event to notify AIExecutor to continue conversation
            console.log(`[ToolExecutor] 🔔 Emitting tool:execution-completed for "${execution.toolName}"`);
            StateStore.emit('tool:execution-completed', {
                executionId,
                toolName: execution.toolName,
                result
            });

            return result;
        } catch (error) {
            console.error(`[ToolExecutor] ❌ Tool "${execution.toolName}" failed:`, error.message);

            // Still emit completion event with error
            console.log(`[ToolExecutor] 🔔 Emitting tool:execution-completed (with error) for "${execution.toolName}"`);
            StateStore.emit('tool:execution-completed', {
                executionId,
                toolName: execution.toolName,
                result: { error: error.message }
            });

            throw error;
        }
    }

    /**
     * Cancel pending tool execution
     */
    cancelExecution(executionId) {
        this._updateToolState(executionId, {
            status: 'cancelled',
            endTime: Date.now()
        });

        StateStore.emit('tool:cancelled', { executionId });
    }

    /**
     * Get all registered tools
     */
    getTools() {
        return Array.from(this.tools.entries()).map(([name, tool]) => ({
            name,
            config: tool.config
        }));
    }

    /**
     * Get tool execution status
     */
    getExecutionStatus(executionId) {
        const state = StateStore.getState();
        return state.tools.executing.get(executionId);
    }

    // ==================== Private Methods ====================

    _needsConfirmation(tool) {
        // Check settings mode
        const { mode } = this.currentSettings;

        // SAFE TOOLS WHITELIST: These tools never require confirmation (unless explicitly forced)
        // This allows the AI to be "smart" and look around without bothering the user
        const SAFE_TOOLS = ['view_file', 'list_directory', 'search_codebase', 'grep_search', 'read_resource', 'list_resources'];

        if (SAFE_TOOLS.includes(tool.name) && tool.config.requiresConfirmation !== true) {
            // console.log(`[ToolExecutor] Auto-approving safe tool: ${tool.name}`);
            return false;
        }

        // Check granular automation settings first (overrides mode)
        // Map abstract permissions to concrete tools
        const { automation } = this.currentSettings;

        // Debug logging for granular permissions
        console.log(`[ToolExecutor] _needsConfirmation checking ${tool.name}. Mode: ${mode}`, {
            automation,
            requiresConfirmation: tool.config.requiresConfirmation,
            destructive: tool.config.destructive
        });

        if (automation) {
            let permissionKey = null;
            if (tool.name === 'run_command') permissionKey = 'run_command';
            else if (tool.name === 'create_file') permissionKey = 'create_file';
            else if (['edit_file', 'update_file'].includes(tool.name)) permissionKey = 'edit_file';
            else if (tool.name === 'delete_file') permissionKey = 'delete_file';

            if (permissionKey) {
                console.log(`[ToolExecutor] Permission key for ${tool.name}: ${permissionKey} = ${automation[permissionKey]}`);
            }

            // If explicit permission is granted, skip confirmation
            if (permissionKey && automation[permissionKey] === true) {
                console.log(`[ToolExecutor] Auto-approving ${tool.name} via automation setting`);
                return false;
            }
        }

        // Assisted mode: ALWAYS confirm all remaining tools (destructive/write)
        if (mode === 'assisted') {
            return true;
        }

        // Auto mode: only confirm if tool explicitly requires it
        if (mode === 'auto') {
            return tool.config.requiresConfirmation === true;
        }

        // Hybrid mode: confirm destructive operations
        if (mode === 'hybrid') {
            return tool.config.destructive === true;
        }

        return false;
    }

    _updateToolState(executionId, updates) {
        StateStore.setState(prevState => {
            const executing = new Map(prevState.tools.executing);
            const current = executing.get(executionId) || {};
            executing.set(executionId, { ...current, ...updates });

            return {
                tools: {
                    ...prevState.tools,
                    executing
                }
            };
        });
    }

    _registerBuiltInTools() {
        // View File
        this.registerTool('view_file', async ({ path, settings }) => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('view_file timed out')), 5000);
                ipcRenderer.once('project:view-file-reply', (event, error, content) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ path, content });
                });
                ipcRenderer.send('project:view-file', path);
            });
        }, {
            autoExecute: true,
            description: 'Read file contents'
        });

        // List Directory
        this.registerTool('list_directory', async ({ path, recursive, settings }) => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('list_directory timed out')), 5000);
                ipcRenderer.once('project:list-directory-reply', (event, error, files) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ path, files, recursive });
                });
                ipcRenderer.send('project:list-directory', path, recursive);
            });
        }, {
            autoExecute: true,
            description: 'List directory contents'
        });

        // Create File
        this.registerTool('create_file', async ({ path, content, settings }) => {
            return new Promise((resolve, reject) => {
                // Safety: Ensure content is never undefined
                const safeContent = content === undefined ? '' : content;
                // console.log('[ToolExecutor] create_file - content type:', typeof content, 'safeContent type:', typeof safeContent);
                const timeout = setTimeout(() => reject(new Error('create_file timed out')), 10000);
                ipcRenderer.once('project:create-file-reply', (event, error, result) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ path, created: true });
                });
                ipcRenderer.send('project:create-file', path, safeContent);
            });
        }, {
            autoExecute: false,
            requiresConfirmation: false,
            description: 'Create new file'
        });

        // Update File
        this.registerTool('update_file', async ({ path, content, settings }) => {
            return new Promise((resolve, reject) => {
                // Safety: Ensure content is never undefined
                const safeContent = content === undefined ? '' : content;
                // console.log('[ToolExecutor] update_file - content type:', typeof content, 'safeContent type:', typeof safeContent);
                const timeout = setTimeout(() => reject(new Error('update_file timed out')), 10000);
                ipcRenderer.once('project:update-file-reply', (event, error, result) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ path, updated: true });
                });
                ipcRenderer.send('project:update-file', path, safeContent);
            });
        }, {
            autoExecute: false,
            requiresConfirmation: false,
            description: 'Update existing file'
        });

        // Edit File (search/replace)
        this.registerTool('edit_file', async ({ path, search, replace, settings }) => {
            return new Promise((resolve, reject) => {
                // Safety: Ensure search/replace are never undefined
                const safeSearch = search === undefined ? '' : search;
                const safeReplace = replace === undefined ? '' : replace;
                // console.log('[ToolExecutor] edit_file - search type:', typeof search, 'replace type:', typeof replace);
                const timeout = setTimeout(() => reject(new Error('edit_file timed out')), 15000);
                ipcRenderer.once('project:edit-file-reply', (event, error, result) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ path, edited: true, changes: result });
                });
                ipcRenderer.send('project:edit-file', path, safeSearch, safeReplace);
            });
        }, {
            autoExecute: false,
            requiresConfirmation: false,
            description: 'Edit file with search/replace'
        });

        // Delete File
        this.registerTool('delete_file', async ({ path, settings }) => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('delete_file timed out')), 10000);
                ipcRenderer.once('project:delete-file-reply', (event, error, result) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ path, deleted: true });
                });
                ipcRenderer.send('project:delete-file', path);
            });
        }, {
            destructive: true,
            requiresConfirmation: true,
            description: 'Delete file (destructive)'
        });

        // Run Command
        this.registerTool('run_command', async ({ command, cwd, settings, onProgress }) => {
            try {
                // FIXED: Use invoke to get Promise result directly (matching src/main/ipc.js)
                // The previous implementation used 'send' with an ID which caused argument mismatch
                const result = await ipcRenderer.invoke('project:run-command', command, cwd);

                // Result structure: { stdout, stderr, error, exitCode }
                const combinedOutput = (result.stdout || '') + (result.stderr || '');

                if (result.error) {
                    return { command, output: `Error: ${result.error}\n${combinedOutput}`, exitCode: result.exitCode || 1 };
                }

                return { command, output: combinedOutput, exitCode: result.exitCode };
            } catch (err) {
                return { command, output: `Execution Failed: ${err.message}`, exitCode: 1 };
            }
        }, {
            autoExecute: false,
            requiresConfirmation: false,
            description: 'Execute terminal command'
        });

        // Search Project
        this.registerTool('search_project', async ({ query, settings }) => {
            return new Promise((resolve, reject) => {
                ipcRenderer.once('project:search-reply', (event, error, results) => {
                    if (error) reject(new Error(error));
                    else resolve({ query, results });
                });
                ipcRenderer.send('project:search', query);
            });
        }, {
            autoExecute: true,
            description: 'Search project codebase'
        });

        // Get Problems (Diagnostics)
        this.registerTool('get_problems', async ({ settings }) => {
            return new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('get_problems timed out after 5s'));
                }, 5000);

                ipcRenderer.once('project:get-problems-reply', (event, error, problems) => {
                    clearTimeout(timeout);
                    if (error) reject(new Error(error));
                    else resolve({ problems });
                });
                ipcRenderer.send('project:get-problems');
            });
        }, {
            autoExecute: true,
            description: 'Get current linting/compiler problems'
        });

        // Capture Live View (Now Embedded)
        this.registerTool('capture_live_view', async ({ settings }) => {
            // We don't actually need to capture anything now, just signal the UI to show the card
            // We can optionally pass a URL if we want to support dynamic URLs later
            return {
                success: true,
                url: 'http://localhost:3000',
                message: 'Live view opened in chat'
            };
        }, {
            autoExecute: true,
            description: 'Open live preview in chat'
        });

        console.log(`[ToolExecutor] Registered ${this.tools.size} built-in tools`);
    }
}

// Singleton instance
const instance = new ToolExecutor();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakToolExecutor = instance;
}

module.exports = instance;
