// src/components/Whiteboard/tools/RectangleTool.js
const Fabric = require('fabric'); // FIXED: Use direct variable assignment
const { TOOL_MODES } = require('../utils');

class RectangleTool {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.isDrawing = false;
        this.currentRect = null;
        
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }
    
    activate() {
        this.canvas.on('mouse:down', this.handleMouseDown);
        this.canvas.on('mouse:move', this.handleMouseMove);
        this.canvas.on('mouse:up', this.handleMouseUp);
    }

    deactivate() {
        this.canvas.off('mouse:down', this.handleMouseDown);
        this.canvas.off('mouse:move', this.handleMouseMove);
        this.canvas.off('mouse:up', this.handleMouseUp);
        if (this.currentRect) {
             this.canvas.remove(this.currentRect);
             this.currentRect = null;
        }
    }
    
    handleMouseDown(options) {
        if (this.engine.toolMode !== TOOL_MODES.RECTANGLE) return;
        
        // CRITICAL FIX: Prevent default Fabric.js selection/event cascade
        if (options.e.preventDefault) options.e.preventDefault(); 
        
        this.isDrawing = true;
        const pointer = this.canvas.getPointer(options.e);
        this.engine.startX = pointer.x;
        this.engine.startY = pointer.y;

        const settings = this.engine.currentSettings;
        this.currentRect = new Fabric.Rect({ // FIXED: Use Fabric variable
            left: this.engine.startX, top: this.engine.startY, width: 0, height: 0, 
            fill: 'transparent', stroke: settings.color, strokeWidth: settings.width,
            originX: 'left', originY: 'top', hasBorders: false, hasControls: false
        });
        this.canvas.add(this.currentRect);
    }

    handleMouseMove(options) {
        if (!this.isDrawing || !this.currentRect) return;
        const pointer = this.canvas.getPointer(options.e);
        const { startX, startY } = this.engine;
        
        this.currentRect.set({
            left: Math.min(pointer.x, startX),
            top: Math.min(pointer.y, startY),
            width: Math.abs(pointer.x - startX),
            height: Math.abs(pointer.y - startY)
        });
        this.canvas.renderAll();
    }

    handleMouseUp(options) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (this.currentRect.width < 5 && this.currentRect.height < 5) {
             this.canvas.remove(this.currentRect);
        } else {
            this.currentRect.set({ hasBorders: true, hasControls: true, selectable: true });
            this.canvas.setActiveObject(this.currentRect);
            this.engine.debouncedSave();
        }
        
        this.currentRect = null;
        this.engine.setToolMode(TOOL_MODES.SELECT); 
    }
}

module.exports = RectangleTool;