// src/components/Whiteboard/tools/ToolManager.js
const { TOOL_MODES } = require('../utils');
const SelectTool = require('./SelectTool');
const DrawTool = require('./DrawTool');
const TextTool = require('./TextTool');
const EraserTool = require('./EraserTool'); 
const RectangleTool = require('./RectangleTool'); 
const CircleTool = require('./CircleTool');      
const LineTool = require('./LineTool');          
const ImageTool = require('./ImageTool'); 

class ToolManager {
    constructor(engine) {
        this.engine = engine;
        this.currentToolInstance = null;
        
        // CRITICAL FIX: Removed redundant 'new' keyword.
        this.toolInstances = {
            [TOOL_MODES.SELECT]: new SelectTool(engine),
            [TOOL_MODES.DRAW]: new DrawTool(engine), 
            
            [TOOL_MODES.RECTANGLE]: new RectangleTool(engine), 
            [TOOL_MODES.CIRCLE]: new CircleTool(engine),      
            [TOOL_MODES.LINE]: new LineTool(engine),          
            [TOOL_MODES.ARROW]: new LineTool(engine), 
            
            [TOOL_MODES.TEXT]: new TextTool(engine),
            [TOOL_MODES.ERASER]: new EraserTool(engine),
            [TOOL_MODES.IMAGE]: new ImageTool(engine) 
        };
    }

    setTool(newMode) {
        // 1. Deactivate current tool
        if (this.currentToolInstance && this.currentToolInstance.deactivate) {
            this.currentToolInstance.deactivate();
        }
        
        // 2. Set new mode and activate new tool instance
        this.engine.toolMode = newMode;
        this.currentToolInstance = this.toolInstances[newMode];
        
        if (this.currentToolInstance && this.currentToolInstance.activate) {
            this.currentToolInstance.activate();
        }
    }

    dispose() {
        Object.values(this.toolInstances).forEach(instance => {
            if (instance.deactivate) instance.deactivate();
        });
    }
}

module.exports = ToolManager;