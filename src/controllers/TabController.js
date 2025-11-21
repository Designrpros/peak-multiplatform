// src/controllers/TabController.js
const StoreController = require('./StoreController');

class TabController {
    constructor() {
        this.store = StoreController.get('appState');
        this.tabs = this.store.get('openTabs', []);
        this.selectedTabId = this.store.get('selectedTabId', null);

        // Integrity Check
        if (!Array.isArray(this.tabs) || this.tabs.length === 0) {
            this.reset();
        } else if (!this.selectedTabId || !this.tabs.find(t => t.id === this.selectedTabId)) {
             this.selectedTabId = this.tabs[0].id;
             this.save();
        }
    }

    reset() {
        const id = Date.now();
        this.tabs = [{ id, title: 'New Tab', content: { type: 'empty', id, data: {}, viewMode: 'landing' } }];
        this.selectedTabId = id;
        this.save();
    }

    save() {
        this.store.set('openTabs', this.tabs);
        this.store.set('selectedTabId', this.selectedTabId);
    }

    getAll() { return this.tabs; }
    
    getActive() { return this.tabs.find(t => t.id === this.selectedTabId); }

    setActive(id) {
        if (this.tabs.find(t => t.id === id)) {
            this.selectedTabId = id;
            this.save();
            return true;
        }
        return false;
    }

    add(content, title = "New Tab") {
        const id = Date.now();
        // If content is just a type string (e.g. 'empty'), normalize it
        if (typeof content === 'string') {
            content = { type: content, id, data: {}, viewMode: 'landing' };
        }
        // Ensure ID consistency
        if (!content.id) content.id = id;

        this.tabs.push({ id, title, content });
        this.selectedTabId = id;
        this.save();
        return id;
    }

    updateActive(newData) {
        const tab = this.getActive();
        if (tab) {
            Object.assign(tab, newData);
            this.save();
        }
    }

    close(id) {
        const idx = this.tabs.findIndex(t => t.id === id);
        if (idx === -1) return null;

        const closedTab = this.tabs[idx];
        this.tabs.splice(idx, 1);

        // Determine new active tab
        if (this.selectedTabId === id) {
            if (this.tabs.length > 0) {
                // Select previous or first
                const newIdx = Math.max(0, idx - 1);
                this.selectedTabId = this.tabs[newIdx].id;
            } else {
                this.reset(); // Always keep one tab open
            }
        }
        this.save();
        return closedTab;
    }

    reorder(fromIndex, toIndex) {
        if (fromIndex === toIndex) return;
        if (fromIndex < 0 || fromIndex >= this.tabs.length || toIndex < 0 || toIndex >= this.tabs.length) return;
        
        const item = this.tabs.splice(fromIndex, 1)[0];
        this.tabs.splice(toIndex, 0, item);
        this.save();
    }
}

module.exports = new TabController();