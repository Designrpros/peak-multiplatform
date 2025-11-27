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
            'appState', 'workspaces' // ADDED
        ];

        // Initialize all stores safely
        storeNames.forEach(name => {
            try {
                let defaults = {};
                if (name === 'notes') defaults = { notes: [] };
                else if (name === 'chats') defaults = { sessions: [] };
                else if (name === 'history' || name === 'terminals' || name === 'whiteboards' || name === 'docs' || name === 'workspaces') defaults = { items: [] };
                else if (name === 'kanban') defaults = { boards: [] };
                else if (name === 'mindmaps') defaults = { maps: [] };
                
                this.stores[name] = new Store({ name, defaults, ...commonOpts });
            } catch (e) {
                console.error(`[StoreController] Failed to load ${name} store:`, e);
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