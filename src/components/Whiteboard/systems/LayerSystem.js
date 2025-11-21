// src/components/Whiteboard/systems/LayerSystem.js

class LayerSystem {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
    }

    _sortObjects(objects, direction = 'asc') {
        return [...objects].sort((a, b) => {
            const list = a.group?._objects || this.canvas.getObjects();
            const indexA = list.indexOf(a);
            const indexB = list.indexOf(b);
            return direction === 'asc' ? indexA - indexB : indexB - indexA;
        });
    }

    _move(objects, direction) {
        if (!objects || objects.length === 0) return;

        const sorted = this._sortObjects(objects, direction === 'forward' || direction === 'front' ? 'desc' : 'asc');

        sorted.forEach(obj => {
            const parent = obj.group;

            if (parent) {
                // Nested Logic (Inside Group)
                const items = parent._objects;
                const index = items.indexOf(obj);
                if (index === -1) return;

                if (direction === 'back' && index > 0) {
                    [items[index], items[index - 1]] = [items[index - 1], items[index]];
                } else if (direction === 'forward' && index < items.length - 1) {
                    [items[index], items[index + 1]] = [items[index + 1], items[index]];
                } else if (direction === 'bottom') {
                    items.splice(index, 1);
                    items.unshift(obj);
                } else if (direction === 'top') {
                    items.splice(index, 1);
                    items.push(obj);
                }
                
                // CRITICAL FIX:
                // 1. Trigger bounding box recalc
                parent.addWithUpdate(); 
                // 2. Mark as dirty so cache regenerates
                parent.set('dirty', true);
                // 3. Update coords
                parent.setCoords();
            } else {
                // Root Logic (Main Canvas)
                if (direction === 'back') obj.sendBackwards();
                else if (direction === 'forward') obj.bringForward();
                else if (direction === 'bottom') obj.sendToBack();
                else if (direction === 'top') obj.bringToFront();
            }
        });

        this._refresh();
    }

    bringForward(objects) { this._move(objects, 'forward'); }
    sendBackwards(objects) { this._move(objects, 'back'); }
    bringToFront(objects) { this._move(objects, 'top'); }
    sendToBack(objects) { this._move(objects, 'bottom'); }

    _refresh() {
        this.canvas.requestRenderAll();
        this.engine.debouncedSave();
        
        // CRITICAL: Wait for next tick to ensure Fabric's array is settled
        setTimeout(() => {
            this.canvas.fire('layer:changed');
        }, 0);
    }
}

module.exports = LayerSystem;