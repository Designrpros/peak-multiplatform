// src/components/Whiteboard/tools/CircleTool.js
const Fabric = require('fabric'); // FIXED: Use direct variable assignment
const { TOOL_MODES } = require('../utils');

class CircleTool {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.isDrawing = false;
        this.currentCircle = null;
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
        if (this.currentCircle) {
             this.canvas.remove(this.currentCircle);
             this.currentCircle = null;
        }
    }
    
    handleMouseDown(options) {
        if (this.engine.toolMode !== TOOL_MODES.CIRCLE) return;
        
        // CRITICAL FIX: Prevent default Fabric.js selection/event cascade
        if (options.e.preventDefault) options.e.preventDefault(); 
        
        this.isDrawing = true;
        const pointer = this.canvas.getPointer(options.e);
        this.engine.startX = pointer.x;
        this.engine.startY = pointer.y;

        const settings = this.engine.currentSettings;
        this.currentCircle = new Fabric.Circle({ // FIXED: Use Fabric variable
            left: this.engine.startX, top: this.engine.startY, radius: 0, 
            fill: 'transparent', stroke: settings.color, strokeWidth: settings.width,
            originX: 'center', originY: 'center', hasBorders: false, hasControls: false
        });
        this.canvas.add(this.currentCircle);
    }

    handleMouseMove(options) {
        if (!this.isDrawing || !this.currentCircle) return;
        const pointer = this.canvas.getPointer(options.e);
        const { startX, startY } = this.engine;
        
        const radius = Math.max(Math.abs(pointer.x - startX), Math.abs(pointer.y - startY)) / 2;
        this.currentCircle.set({ radius: radius });
        
        this.currentCircle.set({ left: startX - radius, top: startY - radius });

        this.canvas.renderAll();
    }

    handleMouseUp(options) {
        if (!this.isDrawing) return;
        this.isDrawing = false;
        
        if (this.currentCircle.radius < 5) {
             this.canvas.remove(this.currentCircle);
        } else {
            this.currentCircle.set({ hasBorders: true, hasControls: true, selectable: true });
            this.canvas.setActiveObject(this.currentCircle);
            this.engine.debouncedSave();
        }
        
        this.currentCircle = null;
        this.engine.setToolMode(TOOL_MODES.SELECT); 
    }
}

module.exports = CircleTool;