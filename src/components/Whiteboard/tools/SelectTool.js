// src/components/Whiteboard/tools/SelectTool.js
const { TOOL_MODES } = require('../utils');

class SelectTool {
    constructor(engine) {
        this.engine = engine;
    }
    
    // Methods kept for compatibility if called directly, but redirect to system
    copy() { this.engine.groupSystem.copy(); }
    paste() { this.engine.groupSystem.paste(); }
    groupSelected() { this.engine.groupSystem.groupSelected(); }
    ungroupSelected() { this.engine.groupSystem.ungroupSelected(); }

    activate() {
        // Key listener is now global in CanvasEngine, so SelectTool 
        // doesn't need its own listener anymore.
    }

    deactivate() {
        // Cleanup if necessary
    }
}

module.exports = SelectTool;