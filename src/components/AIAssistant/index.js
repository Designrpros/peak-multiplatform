/**
 * AIAssistant index.js
 * 
 * Entry point for the new AIAssistant v2 architecture.
 * Provides backward-compatible API for Inspector integration.
 */

// Core Layer
const StateStore = require('./core/StateStore');
const AIExecutor = require('./core/AIExecutor');
const ToolExecutor = require('./core/ToolExecutor');
const ConversationManager = require('./core/ConversationManager');
const SettingsManager = require('./core/SettingsManager');

// UI Layer
const Canvas = require('./ui/Canvas');

console.log('[AIAssistant v2] Initializing...');

// Initialize core components
let canvas = null;

/**
 * Get HTML for AIAssistant
 */
function getAIAssistHTML(currentFileContent, currentFilePath) {
    return `
        <div id="ai-assist-content" style="height: 100%; display: flex; flex-direction: column; background: var(--background);"></div>
    `;
}

/**
 * Attach listeners and initialize Canvas
 */
function attachAIAssistListeners(currentFileContent, currentFilePath) {
    console.log('[AIAssistant v2] Attaching listeners...');

    const container = document.getElementById('ai-assist-content');
    if (!container) {
        console.error('[AIAssistant v2] Container not found');
        return () => { };
    }

    // Create and initialize Canvas
    canvas = new Canvas();
    canvas.init(container);

    // Return cleanup function
    return () => {
        console.log('[AIAssistant v2] Cleaning up...');
        if (canvas) {
            canvas.destroy();
            canvas = null;
        }
    };
}

/**
 * Get Settings HTML (for Settings view)
 */
function getSettingsHTML() {
    const SettingsController = require('./ui/SettingsController');
    return SettingsController.prototype.render.call(new SettingsController());
}

console.log('[AIAssistant v2] Initialized successfully');
console.log('[AIAssistant v2] Architecture:');
console.log('  Layer 1 (Core): StateStore, AIExecutor, ToolExecutor, ConversationManager, SettingsManager');
console.log('  Layer 2 (Transform): StreamProcessor, CardFactory, StateToUITransformer');
console.log('  Layer 3 (UI): Canvas, CardRenderer, InputController');

// Export API
module.exports = {
    getAIAssistHTML,
    attachAIAssistListeners,
    getSettingsHTML,
    ConversationManager
};
