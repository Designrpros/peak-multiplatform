/**
 * StateStore.js
 * 
 * Centralized, immutable state management for AIAssistant.
 * Single source of truth for all AI execution, tool, and UI state.
 * 
 * Features:
 * - Event-driven: Emits events on state changes
 * - Immutable: State updates create new objects (structural sharing)
 * - Inspectable: Can dump entire state at any time
 * - Snapshots: Time-travel debugging support
 */

const { EventEmitter } = require('events');

class StateStore extends EventEmitter {
    constructor() {
        super();

        // Increase max listeners (we have multiple components subscribing)
        this.setMaxListeners(20);

        // Initial state structure
        this.state = {
            conversation: {
                id: null,
                projectRoot: null,
                messages: [],
                currentStream: null // { content: string, status: 'streaming' | 'complete' }
            },
            tools: {
                executing: new Map(), // toolId -> { status, startTime, endTime }
                results: new Map(),   // toolId -> { output, error }
                queue: []            // Array of pending tool executions
            },
            settings: {
                model: 'google/gemini-2.5-pro',
                mode: 'auto', // 'auto' | 'assisted' | 'hybrid'
                temperature: 0.7,
                maxTokens: null,
                // Add more settings as needed
            },
            ui: {
                activeCard: null,
                collapsedSteps: new Set(),
                fileChips: [],
                isStreaming: false,
                showSettings: false
            },
            debug: {
                snapshots: [],
                lastError: null
            }
        };

        // State history for time-travel debugging
        this.history = [];
        this.maxHistorySize = 50; // Keep last 50 states
    }

    /**
     * Get current state (read-only)
     * Returns a deep clone to prevent mutations
     */
    getState() {
        return this._deepClone(this.state);
    }

    /**
     * Update state with partial changes
     * Uses structural sharing for performance
     * @param {Function} updater - Function that receives current state and returns updates
     */
    setState(updater) {
        const prevState = this.state;

        try {
            // Call updater function with current state
            const updates = typeof updater === 'function' ? updater(prevState) : updater;

            // Merge updates (shallow merge at top level, deep for nested)
            this.state = this._mergeState(prevState, updates);

            // Add to history
            this._addToHistory(prevState);

            // Emit change event with affected paths
            const changedPaths = this._getChangedPaths(prevState, this.state);
            this.emit('change', { state: this.state, changedPaths });

            // Emit specific events for major changes
            if (changedPaths.includes('conversation.messages')) {
                this.emit('conversation:update', this.state.conversation);
            }
            if (changedPaths.includes('conversation.currentStream')) {
                this.emit('stream:update', this.state.conversation.currentStream);
            }
            if (changedPaths.some(p => p.startsWith('tools.'))) {
                this.emit('tools:update', this.state.tools);
            }
            if (changedPaths.some(p => p.startsWith('settings.'))) {
                this.emit('settings:update', this.state.settings);
            }
            if (changedPaths.some(p => p.startsWith('ui.'))) {
                this.emit('ui:update', this.state.ui);
            }

        } catch (error) {
            console.error('[StateStore] Error updating state:', error);
            this.state = prevState; // Rollback
            this.setState({ debug: { lastError: error.message } });
            throw error;
        }
    }

    /**
     * Subscribe to state changes
     * @param {Function} listener - Called when state changes
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
        this.on('change', listener);
        return () => this.off('change', listener);
    }

    /**
     * Subscribe to specific path changes
     * @param {string} path - Dot-notation path (e.g., 'conversation.messages')
     * @param {Function} listener - Called when path changes
     * @returns {Function} Unsubscribe function
     */
    subscribeTo(path, listener) {
        const handler = ({ changedPaths }) => {
            if (changedPaths.includes(path) || changedPaths.some(p => p.startsWith(path + '.'))) {
                listener(this._getByPath(this.state, path));
            }
        };
        this.on('change', handler);
        return () => this.off('change', handler);
    }

    /**
     * Create a snapshot of current state
     * @param {string} label - Optional label for the snapshot
     */
    snapshot(label = null) {
        const snapshot = {
            timestamp: Date.now(),
            label: label || `Snapshot ${this.state.debug.snapshots.length + 1}`,
            state: this._deepClone(this.state)
        };

        this.setState(state => ({
            debug: {
                ...state.debug,
                snapshots: [...state.debug.snapshots, snapshot]
            }
        }));

        console.log(`[StateStore] Snapshot created: ${snapshot.label}`);
        return snapshot;
    }

    /**
     * Restore state from a snapshot
     * @param {number} snapshotIndex - Index of snapshot to restore
     */
    restoreSnapshot(snapshotIndex) {
        const snapshots = this.state.debug.snapshots;
        if (snapshotIndex < 0 || snapshotIndex >= snapshots.length) {
            throw new Error(`Invalid snapshot index: ${snapshotIndex}`);
        }

        const snapshot = snapshots[snapshotIndex];
        console.log(`[StateStore] Restoring snapshot: ${snapshot.label}`);

        // Restore state (keep snapshots)
        this.state = {
            ...snapshot.state,
            debug: {
                ...snapshot.state.debug,
                snapshots: snapshots // Keep all snapshots
            }
        };

        this.emit('change', { state: this.state, changedPaths: ['*'] });
        this.emit('snapshot:restore', snapshot);
    }

    /**
     * Export state as JSON for debugging
     */
    export() {
        return JSON.stringify({
            state: this._serializeState(this.state),
            timestamp: Date.now(),
            version: '2.0.0'
        }, null, 2);
    }

    /**
     * Import state from JSON
     */
    import(jsonString) {
        try {
            const { state } = JSON.parse(jsonString);
            this.state = this._deserializeState(state);
            this.emit('change', { state: this.state, changedPaths: ['*'] });
            console.log('[StateStore] State imported successfully');
        } catch (error) {
            console.error('[StateStore] Failed to import state:', error);
            throw error;
        }
    }

    // ==================== Helper Methods ====================

    _mergeState(prevState, updates) {
        const merged = { ...prevState };

        for (const key in updates) {
            if (updates[key] !== undefined) {
                if (typeof updates[key] === 'object' && updates[key] !== null && !Array.isArray(updates[key]) && !(updates[key] instanceof Map) && !(updates[key] instanceof Set)) {
                    // Deep merge for plain objects
                    merged[key] = this._mergeState(prevState[key] || {}, updates[key]);
                } else {
                    // Direct assignment for primitives, arrays, Maps, Sets
                    merged[key] = updates[key];
                }
            }
        }

        return merged;
    }

    _getChangedPaths(prevState, newState, prefix = '') {
        const paths = [];

        const allKeys = new Set([
            ...Object.keys(prevState || {}),
            ...Object.keys(newState || {})
        ]);

        for (const key of allKeys) {
            const path = prefix ? `${prefix}.${key}` : key;
            const prevVal = prevState?.[key];
            const newVal = newState?.[key];

            if (prevVal !== newVal) {
                paths.push(path);

                // Recurse for objects
                if (typeof newVal === 'object' && newVal !== null && !Array.isArray(newVal) && !(newVal instanceof Map) && !(newVal instanceof Set)) {
                    paths.push(...this._getChangedPaths(prevVal, newVal, path));
                }
            }
        }

        return paths;
    }

    _getByPath(obj, path) {
        const parts = path.split('.');
        let current = obj;
        for (const part of parts) {
            if (current === undefined || current === null) return undefined;
            current = current[part];
        }
        return current;
    }

    _deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Map) return new Map(obj);
        if (obj instanceof Set) return new Set(obj);
        if (Array.isArray(obj)) return obj.map(item => this._deepClone(item));

        const cloned = {};
        for (const key in obj) {
            cloned[key] = this._deepClone(obj[key]);
        }
        return cloned;
    }

    _addToHistory(state) {
        this.history.push(this._deepClone(state));
        if (this.history.length > this.maxHistorySize) {
            this.history.shift(); // Remove oldest
        }
    }

    _serializeState(state) {
        // Convert Maps and Sets to arrays for JSON serialization
        return {
            ...state,
            tools: {
                ...state.tools,
                executing: Array.from(state.tools.executing.entries()),
                results: Array.from(state.tools.results.entries())
            },
            ui: {
                ...state.ui,
                collapsedSteps: Array.from(state.ui.collapsedSteps)
            }
        };
    }

    _deserializeState(serialized) {
        // Convert arrays back to Maps and Sets
        return {
            ...serialized,
            tools: {
                ...serialized.tools,
                executing: new Map(serialized.tools.executing),
                results: new Map(serialized.tools.results)
            },
            ui: {
                ...serialized.ui,
                collapsedSteps: new Set(serialized.ui.collapsedSteps)
            }
        };
    }

    /**
     * Reset state to initial
     */
    reset() {
        console.log('[StateStore] Resetting state');
        this.state = {
            conversation: {
                id: null,
                projectRoot: null,
                messages: [],
                currentStream: null
            },
            tools: {
                executing: new Map(),
                results: new Map(),
                queue: []
            },
            settings: {
                model: 'openrouter/auto',
                mode: 'auto',
                temperature: 0.7,
                maxTokens: null,
            },
            ui: {
                activeCard: null,
                collapsedSteps: new Set(),
                fileChips: [],
                isStreaming: false,
                showSettings: false
            },
            debug: {
                snapshots: [],
                lastError: null
            }
        };
        this.history = [];
        this.emit('change', { state: this.state, changedPaths: ['*'] });
        this.emit('reset');
    }
}

// Singleton instance
const instance = new StateStore();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakStateStore = instance;
}

module.exports = instance;
