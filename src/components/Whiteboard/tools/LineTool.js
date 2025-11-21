// src/components/Whiteboard/tools/LineTool.js
const Fabric = require('fabric'); // FIXED: Use direct variable assignment
const { TOOL_MODES } = require('../utils');

class LineTool {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.isDrawing = false;
        this.currentLine = null;
    }
    
    activate() {
        this.canvas.on('mouse:down', this.handleMouseDown.bind(this));
        this.canvas.on('mouse:move', this.handleMouseMove.bind(this));
        this.canvas.on('mouse:up', this.handleMouseUp.bind(this));
    }

    deactivate() {
        this.canvas.off('mouse:down', this.handleMouseDown);
        this.canvas.off('mouse:move', this.handleMouseMove);
        this.canvas.off('mouse:up', this.handleMouseUp);
        if (this.currentLine) {
             this.canvas.remove(this.currentLine);
             this.currentLine = null;
        }
    }
    
    handleMouseDown(options) {
        if (this.engine.toolMode !== TOOL_MODES.LINE && this.engine.toolMode !== TOOL_MODES.ARROW) return;
        
        // CRITICAL FIX: Prevent default Fabric.js selection/event cascade
        if (options.e.preventDefault) options.e.preventDefault(); 
        
        this.isDrawing = true;
        const pointer = this.canvas.getPointer(options.e);
        this.engine.startX = pointer.x;
        this.engine.startY = pointer.y;

        const settings = this.engine.currentSettings;
        this.currentLine = new Fabric.Line([this.engine.startX, this.engine.startY, this.engine.startX, this.engine.startY], { // FIXED: Use Fabric variable
            stroke: settings.color, strokeWidth: settings.width, hasBorders: false, hasControls: false
        });
        this.canvas.add(this.currentLine);
    }

    handleMouseMove(options) {
        if (!this.isDrawing || !this.currentLine) return;
        const pointer = this.canvas.getPointer(options.e);
        this.currentLine.set({ 'x2': pointer.x, 'y2': pointer.y });
        this.canvas.renderAll();
    }

    handleMouseUp(options) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        const x1 = this.currentLine.x1;
        const y1 = this.currentLine.y1;
        const x2 = this.currentLine.x2;
        const y2 = this.currentLine.y2;
        const length = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

        if (length < 5) {
             this.canvas.remove(this.currentLine);
        } else {
            this.currentLine.set({ hasBorders: true, hasControls: true, selectable: true });
            
            if (this.engine.toolMode === TOOL_MODES.ARROW) {
                 // Complex arrow logic is omitted, but the base line is created
            }

            this.canvas.setActiveObject(this.currentLine);
            this.engine.debouncedSave();
        }
        
        this.currentLine = null;
        this.engine.setToolMode(TOOL_MODES.SELECT); 
    }
}

module.exports = LineTool;