// src/components/Whiteboard/tools/DrawTool.js
const Fabric = require('fabric'); 
const { TOOL_MODES } = require('../utils');

class DrawTool {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.isDrawing = false;
        
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }
    
    activate() {
        const mode = this.engine.toolMode;
        
        if (mode === TOOL_MODES.DRAW) {
             this.canvas.isDrawingMode = true;
             
             // CRITICAL FIX: Explicitly check for and instantiate the brush if null.
             if (!this.canvas.freeDrawingBrush) {
                this.canvas.freeDrawingBrush = new Fabric.PencilBrush(this.canvas);
             }
             
             // Apply brush settings, guaranteeing a functional brush
             this.canvas.freeDrawingBrush.color = this.engine.currentSettings.color;
             this.canvas.freeDrawingBrush.width = this.engine.currentSettings.width;

             this.canvas.on('mouse:up', this.engine.debouncedSave);
             return;
        }

        this.canvas.isDrawingMode = false;
    }

    deactivate() {
        this.canvas.isDrawingMode = false;
        this.canvas.off('mouse:up', this.engine.debouncedSave);
        this.canvas.off('mouse:down', this.handleMouseDown);
        this.canvas.off('mouse:move', this.handleMouseMove);
        this.canvas.off('mouse:up', this.handleMouseUp);
        
        if (this.engine.currentShape && this.engine.currentShape.canvas) {
             this.canvas.remove(this.engine.currentShape);
             this.engine.currentShape = null;
        }
    }
    
    handleMouseDown(options) { }
    handleMouseMove(options) { }
    handleMouseUp(options) { }
}

module.exports = DrawTool;