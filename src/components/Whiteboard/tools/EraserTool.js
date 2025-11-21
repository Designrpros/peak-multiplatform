// src/components/Whiteboard/tools/EraserTool.js
const { TOOL_MODES } = require('../utils');

class EraserTool {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.handleMouseDown = this.handleMouseDown.bind(this);
    }
    
    activate() {
        this.canvas.on('mouse:down', this.handleMouseDown);
    }

    deactivate() {
        this.canvas.off('mouse:down', this.handleMouseDown);
    }

    handleMouseDown(options) {
        if (this.engine.toolMode !== TOOL_MODES.ERASER) return;

        const hitObject = this.canvas.findTarget(options.e);
        if (hitObject) {
            this.canvas.remove(hitObject);
            this.engine.debouncedSave();
        }
        return;
    }
}

module.exports = EraserTool;