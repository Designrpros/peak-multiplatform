// src/controllers/StoreController.js
const Store = require('electron-store');

class StoreController {
    constructor() {
        this.stores = {};
        this.init();
    }

    init() {
        const commonOpts = { clearInvalidConfig: true };
        const storeNames = [
            'notes', 'chats', 'history', 'closedTabs', 
            'bookmarks', 'mindmaps', 'kanban', 
            'terminals', 'whiteboards', 'docs', 
            'appState'
        ];

        // Initialize all stores safely
        storeNames.forEach(name => {
            try {
                // appState needs specific handling if you want, but generic is fine here
                // For specific defaults, we can map them, but empty defaults work for most
                let defaults = {};
                if (name === 'notes') defaults = { notes: [] };
                else if (name === 'chats') defaults = { sessions: [] };
                else if (name === 'history' || name === 'terminals' || name === 'whiteboards' || name === 'docs') defaults = { items: [] };
                else if (name === 'kanban') defaults = { boards: [] };
                else if (name === 'mindmaps') defaults = { maps: [] };
                
                this.stores[name] = new Store({ name, defaults, ...commonOpts });
            } catch (e) {
                console.error(`[StoreController] Failed to load ${name} store:`, e);
                // Fallback: Create a dummy object so the app doesn't crash on access
                this.stores[name] = { get: () => [], set: () => {} }; 
            }
        });
    }

    get(storeName) {
        return this.stores[storeName];
    }
}

// Singleton instance
module.exports = new StoreController();