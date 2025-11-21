// src/components/Whiteboard/WhiteboardContextMenu.js
const { ipcRenderer } = require('electron');

class WhiteboardContextMenu {
    constructor(engine, container) {
        this.engine = engine;
        this.container = container;
        this.handleContextMenu = this.handleContextMenu.bind(this);
        this.isAttached = false;
    }

    attach() {
        if (this.isAttached) return;
        // Capture event before Fabric to ensure menu always works
        this.container.addEventListener('contextmenu', this.handleContextMenu, { capture: true });
        this.isAttached = true;
    }

    detach() {
        if (!this.isAttached) return;
        this.container.removeEventListener('contextmenu', this.handleContextMenu, { capture: true });
        this.isAttached = false;
    }

    handleContextMenu(e) {
        e.preventDefault();
        e.stopPropagation(); 

        const target = this.engine.canvas.findTarget(e);
        // Auto-select target if not already selected
        if (target && !this.engine.canvas.getActiveObjects().includes(target)) {
            this.engine.canvas.discardActiveObject();
            this.engine.canvas.setActiveObject(target);
            this.engine.canvas.requestRenderAll();
        }

        const activeObject = this.engine.canvas.getActiveObject();
        
        // Prevent if editing text
        if (activeObject && activeObject.isType('i-text') && activeObject.isEditing) {
            return; 
        }

        // Trigger Main Process Menu
        ipcRenderer.send('show-whiteboard-context-menu', { 
            type: activeObject ? activeObject.type : null,
            hasTarget: !!activeObject 
        });
    }
    
    // IPC Logic moved to global tab-manager.js to prevent race conditions
}

module.exports = WhiteboardContextMenu;