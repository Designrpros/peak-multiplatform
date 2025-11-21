// src/components/Whiteboard/tools/TextTool.js
const Fabric = require('fabric'); // FIXED: Use direct variable assignment
const { TOOL_MODES } = require('../utils');

class TextTool {
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
        if (this.engine.toolMode !== TOOL_MODES.TEXT) return;

        const pointer = this.canvas.getPointer(options.e);
        const settings = this.engine.currentSettings;

        const text = new Fabric.IText('Text', { // FIXED: Use Fabric.IText
            left: pointer.x,
            top: pointer.y,
            fontFamily: 'sans-serif',
            fontSize: 20,
            fill: settings.color,
            selectable: true
        });

        this.canvas.add(text);
        this.canvas.setActiveObject(text);
        text.enterEditing();
        
        this.engine.debouncedSave();
        this.engine.setToolMode(TOOL_MODES.SELECT); 
    }
}

module.exports = TextTool;