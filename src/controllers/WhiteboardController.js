// src/controllers/WhiteboardController.js
const StoreController = require('./StoreController');

/**
 * Handles persistence and title synchronization logic for the Whiteboard.
 * It reads the canvas state and updates the whiteboardStore item.
 * * @param {number} id The ID of the whiteboard session.
 * @param {string} data JSON string of the Fabric.js canvas state.
 * @param {string} title The user-edited title from the toolbar.
 * @returns {string} The final title used for the session and tab.
 */
function save(id, data, title) {
    const whiteboardStore = StoreController.get('whiteboards');
    if (!whiteboardStore) return title;

    // CRITICAL FIX: If the user provides an empty or whitespace-only title, 
    // default it to a stable, non-empty name like "Whiteboard".
    const newTitle = (title && title.trim()) || "Whiteboard"; 

    let items = whiteboardStore.get('items', []);
    const boardId = Number(id);
    
    const itemIndex = items.findIndex(i => i.id === boardId);
    
    if (itemIndex > -1) {
        const snapshot = JSON.parse(data);
        
        items[itemIndex].data = snapshot; 
        items[itemIndex].title = newTitle; // Use the guaranteed non-empty title
        items[itemIndex].createdAt = Date.now();
        whiteboardStore.set('items', items);
    } 
    
    // Return the new title for the tab-manager to update the UI
    return newTitle;
}

module.exports = { save };