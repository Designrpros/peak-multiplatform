/**
 * index.js (NEW)
 * 
 * Entry point for the rewritten AIAssistant.
 * Initializes the multi-layer architecture and exposes API.
 */

// Core Layer (Layer 1)
const StateStore = require('./core/StateStore');
const AIExecutor = require('./core/AIExecutor');
const ToolExecutor = require('./core/ToolExecutor');
const ConversationManager = require('./core/ConversationManager');
const SettingsManager = require('./core/SettingsManager');

// Transformation Layer (Layer 2)
const StreamProcessor = require('./transformation/StreamProcessor');
const CardFactory = require('./transformation/CardFactory');
const StateToUITransformer = require('./transformation/StateToUITransformer');

// UI Layer (Layer 3)
const Canvas = require('./ui/Canvas');

/**
 * HTML template for AIAssistant view
 */
function getAIAssistHTML() {
    return `
        <div id="ai-assist-content" style="height: 100%; display: flex; flex-direction: column; background: var(--background);"></div>
    `;
}

/**
 * HTML template for Settings view
 */
function getSettingsHTML() {
    return `
        <div id="ai-settings-content" style="padding: 20px;">
            <h3>AI Assistant Settings</h3>
            <p>Settings UI pending implementation...</p>
        </div>
    `;
}

/**
 * Initialize and attach listeners
 */
function attachAIAssistListeners(currentFileContent, currentFilePath) {
    console.log('[AIAssistant v2] Initializing...');

    // Get container
    const container = document.getElementById('ai-assist-content');
    if (!container) {
        console.error('[AIAssistant v2] Container not found');
        return null;
    }

    // Initialize Canvas (main UI controller)
    const canvas = new Canvas();
    canvas.init(container);

    console.log('[AIAssistant v2] Initialized successfully');
    console.log('[AIAssistant v2] Architecture:');
    console.log('  Layer 1 (Core): StateStore, AIExecutor, ToolExecutor, ConversationManager, SettingsManager');
    console.log('  Layer 2 (Transform): StreamProcessor, CardFactory, StateToUITransformer');
    console.log('  Layer 3 (UI): Canvas, CardRenderer, InputController');

    // Expose API for debugging
    window.peakAI = {
        version: '2.0.0',
        state: StateStore,
        executor: AIExecutor,
        tools: ToolExecutor,
        conversation: ConversationManager,
        settings: SettingsManager,
        canvas: canvas
    };

    // Return cleanup function
    return () => {
        console.log('[AIAssistant v2] Cleaning up...');
        canvas.destroy();
    };
}

module.exports = {
    getAIAssistHTML,
    getSettingsHTML,
    attachAIAssistListeners,

    // Expose modules for extensions/plugins
    StateStore,
    AIExecutor,
    ToolExecutor,
    ConversationManager,
    SettingsManager,
    StreamProcessor,
    CardFactory,
    StateToUITransformer,
    Canvas
};
