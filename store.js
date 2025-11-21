// src/store.js
const Store = require('electron-store');

const schema = {
    tabs: { type: 'array', default: [] },
    activeTabId: { type: ['string', 'null'], default: null },
    notes: { type: 'array', default: [] },
    chatSessions: { type: 'array', default: [] }
};

// 'clearInvalidConfig' prevents crashes if you changed data structure repeatedly
const store = new Store({ 
    name: 'peak-data',
    schema: schema,
    clearInvalidConfig: true 
});

module.exports = store;