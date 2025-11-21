// src/components/Whiteboard/systems/GroupSystem.js
const { clipboard } = require('electron');
let Fabric;
try { Fabric = require('fabric'); } catch(e) { if (typeof fabric !== 'undefined') Fabric = fabric; }

class GroupSystem {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.clipboard = null;
    }

    async groupSelected() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject || activeObject.type !== 'activeSelection') return;

        // 1. Capture objects and center
        // activeObject.getObjects() gives us the references we need
        const objects = activeObject.getObjects();
        const groupCenter = activeObject.getCenterPoint();

        // 2. Discard selection to reset transforms
        // This returns objects to their absolute canvas coordinates
        this.canvas.discardActiveObject();

        // 3. Create Group Shell
        const group = new Fabric.Group([], {
            left: groupCenter.x,
            top: groupCenter.y,
            originX: 'center',
            originY: 'center',
            
            subTargetCheck: false, // Default: Move as one unit
            interactive: true,     // Allow editing if deep-selected
            
            id: Date.now(),
            layerName: 'Group'
        });

        // 4. Move Objects into Group
        objects.forEach(obj => {
            this.canvas.remove(obj);

            // FIX: Use absolute center point for robust relative math
            const objCenter = obj.getCenterPoint();
            const dx = objCenter.x - groupCenter.x;
            const dy = objCenter.y - groupCenter.y;

            // Standardize child objects to center origin
            obj.set({
                left: dx,
                top: dy,
                originX: 'center',
                originY: 'center'
            });

            group.add(obj);
        });

        // 5. Add & Select
        this.canvas.add(group);
        this.canvas.setActiveObject(group);
        
        this._refresh();
    }

    async ungroupSelected() {
        const activeObject = this.canvas.getActiveObject();
        if (!activeObject || activeObject.type !== 'group') return;

        // 1. Remove Group
        this.canvas.remove(activeObject);
        
        // 2. Restore Objects
        // toActiveSelection handles the coordinate restoration automatically
        const selection = activeObject.toActiveSelection();
        
        this.canvas.setActiveObject(selection);
        this._refresh();
    }

    async copy() {
        const active = this.canvas.getActiveObject();
        if (active) {
            try {
                const cloned = await active.clone();
                this.clipboard = cloned;
            } catch (e) { console.error(e); }
        }
    }

    async paste() {
        if (this.clipboard) {
            try {
                const clonedObj = await this.clipboard.clone();
                this.canvas.discardActiveObject();
                
                clonedObj.set({
                    left: clonedObj.left + 20,
                    top: clonedObj.top + 20,
                    evented: true,
                    id: Date.now()
                });

                if (clonedObj.type === 'activeSelection') {
                    clonedObj.canvas = this.canvas;
                    clonedObj.forEachObject((obj) => {
                        obj.id = Date.now() + Math.random(); 
                        this.canvas.add(obj);
                    });
                    clonedObj.setCoords();
                } else {
                    this.canvas.add(clonedObj);
                    if (clonedObj.type === 'group') {
                        clonedObj.set({ 
                            subTargetCheck: false, 
                            interactive: true 
                        });
                    }
                }
                
                if (clonedObj.setCoords) clonedObj.setCoords();
                this.canvas.setActiveObject(clonedObj);
                this._refresh();
            } catch (e) { console.error(e); }
        }
    }

    _refresh() {
        this.canvas.requestRenderAll();
        this.engine.debouncedSave();
        if (this.engine.historySystem) this.engine.historySystem.saveState();
        this.canvas.fire('layer:changed'); 
    }
}

module.exports = GroupSystem;