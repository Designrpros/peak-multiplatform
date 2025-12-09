/**
 * StateToUITransformer.js
 * 
 * Transforms raw state into UI-ready data structures.
 * This is the bridge between Layer 1 (AI Execution) and Layer 3 (UI).
 * 
 * Responsibilities:
 * - Convert StateStore data to UI-friendly formats
 * - Memoize transformations for performance
 * - Provide selectors for different UI components
 */

const StateStore = require('../core/StateStore');
const CardFactory = require('./CardFactory');

class StateToUITransformer {
    constructor() {
        this.cache = new Map();
        this.lastStateSnapshot = null;

        // Subscribe to state changes to invalidate cache
        StateStore.subscribe(({ changedPaths }) => {
            this._invalidateCache(changedPaths);
        });
    }

    /**
     * Transform conversation messages to UI format
     * Includes card generation from operations
     */
    getConversationUI() {
        const cached = this._getCache('conversation');
        if (cached) return cached;

        const state = StateStore.getState();
        const { messages, currentStream } = state.conversation;

        const uiMessages = messages.map((msg, index) => ({
            id: `msg-${index}`,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || Date.now(),
            commitHash: msg.commitHash,
            // Add cards if this is an assistant message
            cards: msg.role === 'assistant' ? this._parseMessageToCards(msg.content) : []
        }));

        // Add current stream as a message if active
        if (currentStream && currentStream.content) {
            uiMessages.push({
                id: 'stream-current',
                role: 'assistant',
                content: currentStream.content,
                timestamp: Date.now(),
                isStreaming: currentStream.status === 'streaming',
                cards: this._parseMessageToCards(currentStream.content)
            });
        }

        this._setCache('conversation', uiMessages);
        return uiMessages;
    }

    /**
     * Transform tools state to UI format
     */
    getToolsUI() {
        const cached = this._getCache('tools');
        if (cached) return cached;

        const state = StateStore.getState();
        const { executing, results } = state.tools;

        const toolsUI = {
            active: Array.from(executing.entries()).map(([id, exec]) => ({
                id,
                toolName: exec.toolName,
                status: exec.status,
                progress: exec.progress,
                startTime: exec.startTime,
                args: exec.args
            })),
            completed: Array.from(results.entries()).map(([id, result]) => ({
                id,
                output: result.output,
                error: result.error
            }))
        };

        this._setCache('tools', toolsUI);
        return toolsUI;
    }

    /**
     * Transform settings to UI format
     */
    getSettingsUI() {
        const state = StateStore.getState();
        return { ...state.settings }; // Simple pass-through, but could add formatting
    }

    /**
     * Get UI state (collapsed cards, active panels, etc.)
     */
    getUIState() {
        const state = StateStore.getState();
        return {
            isStreaming: state.ui.isStreaming,
            showSettings: state.ui.showSettings,
            activeCard: state.ui.activeCard,
            collapsedSteps: Array.from(state.ui.collapsedSteps),
            fileChips: [...state.ui.fileChips]
        };
    }

    /**
     * Get file chips for display
     */
    getFileChips() {
        const state = StateStore.getState();
        const chips = state.ui.fileChips;

        // Group by file extension for display
        const grouped = chips.reduce((acc, chip) => {
            const ext = this._getExtension(chip.path);
            if (!acc[ext]) acc[ext] = [];
            acc[ext].push(chip);
            return acc;
        }, {});

        return {
            chips,
            grouped,
            count: chips.length
        };
    }

    /**
     * Get debug info for Inspector panel
     */
    getDebugInfo() {
        const state = StateStore.getState();

        return {
            snapshots: state.debug.snapshots.map(s => ({
                label: s.label,
                timestamp: s.timestamp
            })),
            lastError: state.debug.lastError,
            statesize: JSON.stringify(state).length,
            messageCount: state.conversation.messages.length,
            toolsExecuting: state.tools.executing.size,
            toolsCompleted: state.tools.results.size
        };
    }

    // ==================== Private Methods ====================

    _parseMessageToCards(content) {
        // This would use StreamProcessor operations
        // For now, return empty array (will be connected later)
        return [];
    }

    _getExtension(path) {
        const parts = path.split('.');
        return parts.length > 1 ? parts[parts.length - 1] : 'file';
    }

    _getCache(key) {
        return this.cache.get(key);
    }

    _setCache(key, value) {
        this.cache.set(key, value);
    }

    _invalidateCache(changedPaths) {
        // Invalidate relevant cache entries based on changed paths
        if (changedPaths.some(p => p.startsWith('conversation'))) {
            this.cache.delete('conversation');
        }
        if (changedPaths.some(p => p.startsWith('tools'))) {
            this.cache.delete('tools');
        }
        if (changedPaths.some(p => p.startsWith('ui'))) {
            this.cache.delete('ui');
        }
    }
}

// Singleton instance
const instance = new StateToUITransformer();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakTransformer = instance;
}

module.exports = instance;
