// src/components/Whiteboard/systems/HistorySystem.js

class HistorySystem {
    constructor(engine) {
        this.engine = engine;
        this.undoStack = [];
        this.redoStack = [];
        this.locked = false;
        this.maxDepth = 50;
    }

    saveState() {
        if (this.locked) return;

        // Limit stack size
        if (this.undoStack.length >= this.maxDepth) {
            this.undoStack.shift();
        }

        // Save current state
        // We include specific properties to ensure custom data (like ids) are preserved
        const json = JSON.stringify(this.engine.canvas.toJSON(['id', 'gradientAngle', 'selectable', 'hasControls', 'layerName']));
        this.undoStack.push(json);
        
        // Clear redo stack on new change
        this.redoStack = [];
    }

    async undo() {
        if (this.undoStack.length === 0) return;

        this.locked = true; // Prevent saving new states during undo

        // Save current state to redo stack before undoing
        const currentState = JSON.stringify(this.engine.canvas.toJSON(['id', 'layerName']));
        this.redoStack.push(currentState);

        const state = this.undoStack.pop();
        
        await this.engine.canvas.loadFromJSON(state);
        
        // Re-render and save to disk (but don't push to history)
        this.engine.canvas.renderAll();
        this.engine.debouncedSave();
        
        this.locked = false;
    }

    async redo() {
        if (this.redoStack.length === 0) return;

        this.locked = true;

        // Save current to undo stack
        const currentState = JSON.stringify(this.engine.canvas.toJSON(['id', 'layerName']));
        this.undoStack.push(currentState);

        const state = this.redoStack.pop();
        
        await this.engine.canvas.loadFromJSON(state);
        
        this.engine.canvas.renderAll();
        this.engine.debouncedSave();
        
        this.locked = false;
    }
}

module.exports = HistorySystem;