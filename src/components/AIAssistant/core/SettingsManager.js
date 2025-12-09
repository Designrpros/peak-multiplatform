/**
 * SettingsManager.js
 * 
 * Centralized settings management with reactive updates.
 * 
 * Responsibilities:
 * - Load/save settings from localStorage
 * - Provide reactive settings updates via StateStore
 * - Validate settings
 * - Default settings management
 */

const StateStore = require('./StateStore');

const DEFAULT_SETTINGS = {
    model: 'google/gemini-2.5-pro', // Gemini 2.5 Pro - requested default
    mode: 'assisted', // 'auto' | 'assisted' | 'hybrid' - assisted requires approval for tools
    temperature: 0.7,
    maxTokens: null,
    streaming: true,
    autoExecute: false, // Changed to false so tools require approval
    showThinking: true,
    darkMode: true,
    compactView: false,
    // Granular automation permissions (overrides 'assisted' mode)
    automation: {
        run_command: false,
        create_file: false,
        edit_file: false, // Covers edit_file, update_file
        delete_file: false
    }
};

class SettingsManager {
    constructor() {
        // Load settings from storage
        this.loadSettings();
    }

    /**
     * Load settings from localStorage
     */
    loadSettings() {
        try {
            const stored = localStorage.getItem('peak-ai-settings');
            const storedVersion = localStorage.getItem('peak-settings-version');
            const CURRENT_VERSION = '3'; // Bump to force model update

            let settings = stored ? JSON.parse(stored) : {};

            // Migration logic
            if (storedVersion !== CURRENT_VERSION) {
                console.log('[SettingsManager] Migrating settings to version', CURRENT_VERSION);
                // Force update model to new default
                settings.model = DEFAULT_SETTINGS.model;
                localStorage.setItem('peak-settings-version', CURRENT_VERSION);
                this._saveSettings(settings); // Helper saves to peak-ai-settings
            }

            // Merge with defaults
            const merged = { ...DEFAULT_SETTINGS, ...settings };

            // Update StateStore
            StateStore.setState(prevState => ({
                settings: merged
            }));

            console.log('[SettingsManager] Settings loaded:', merged);

        } catch (error) {
            console.error('[SettingsManager] Error loading settings:', error);
            // Use defaults
            StateStore.setState(prevState => ({
                settings: DEFAULT_SETTINGS
            }));
        }
    }

    /**
     * Update settings
     * @param {object} updates - Partial settings to update
     */
    updateSettings(updates) {
        const state = StateStore.getState();
        const newSettings = { ...state.settings, ...updates };

        // Validate
        const validated = this._validate(newSettings);

        // Update StateStore
        StateStore.setState(prevState => ({
            settings: validated
        }));

        // Persist to localStorage
        this._saveSettings(validated);

        console.log('[SettingsManager] Settings updated:', updates);

        // Emit event
        StateStore.emit('settings:changed', { settings: validated, updates });
    }

    /**
     * Reset settings to defaults
     */
    resetSettings() {
        StateStore.setState(prevState => ({
            settings: { ...DEFAULT_SETTINGS }
        }));

        this._saveSettings(DEFAULT_SETTINGS);

        console.log('[SettingsManager] Settings reset to defaults');
        StateStore.emit('settings:reset');
    }

    /**
     * Get current settings
     */
    getSettings() {
        const state = StateStore.getState();
        return { ...state.settings };
    }

    /**
     * Get a specific setting
     */
    getSetting(key) {
        const state = StateStore.getState();
        return state.settings[key];
    }

    /**
     * Subscribe to settings changes
     * @param {Function} callback - Called when settings change
     * @returns {Function} Unsubscribe function
     */
    subscribe(callback) {
        return StateStore.subscribeTo('settings', callback);
    }

    // ==================== Private Methods ====================

    _validate(settings) {
        const validated = { ...settings };

        // Validate temperature (0-2)
        if (typeof validated.temperature === 'number') {
            validated.temperature = Math.max(0, Math.min(2, validated.temperature));
        }

        // Validate maxTokens
        if (validated.maxTokens !== null && typeof validated.maxTokens !== 'number') {
            validated.maxTokens = null;
        }

        // Validate mode
        const validModes = ['auto', 'assisted', 'hybrid'];
        if (!validModes.includes(validated.mode)) {
            validated.mode = 'auto';
        }

        // Validate boolean settings
        const boolSettings = ['streaming', 'autoExecute', 'showThinking', 'darkMode', 'compactView'];
        for (const key of boolSettings) {
            if (typeof validated[key] !== 'boolean') {
                validated[key] = DEFAULT_SETTINGS[key];
            }
        }

        return validated;
    }

    _saveSettings(settings) {
        try {
            localStorage.setItem('peak-ai-settings', JSON.stringify(settings));
        } catch (error) {
            console.error('[SettingsManager] Error saving settings:', error);
        }
    }
}

// Singleton instance
const instance = new SettingsManager();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakSettingsManager = instance;
}

module.exports = instance;
