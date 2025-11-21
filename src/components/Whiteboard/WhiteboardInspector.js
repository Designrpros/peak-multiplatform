// src/components/Whiteboard/WhiteboardInspector.js
const { updateInspector } = require('./InspectorRenderer');
const { insertAsset } = require('./InspectorAssets');
const Fabric = require('fabric'); 

let currentMode = 'design'; 
let expandedGroups = new Set();
let draggedPath = null;

function getObjectFromPath(engine, pathStr) {
    if (!pathStr && pathStr !== 0) return null;
    const indices = String(pathStr).split('-').map(Number);
    const allObjects = engine.canvas.getObjects();
    let target = allObjects[indices[0]];
    for (let i = 1; i < indices.length; i++) {
        if (target && target.type === 'group' && target._objects) {
            target = target._objects[indices[i]];
        } else { return null; }
    }
    return target;
}

function attachWhiteboardInspectorListeners(engine, container) {
    updateInspector(engine.canvas.getActiveObjects(), container, currentMode, engine, expandedGroups);

    const updateHandler = () => {
        const active = engine.canvas.getActiveObjects();
        if (active.length > 0 && currentMode === 'assets') currentMode = 'design';
        updateInspector(active, container, currentMode, engine, expandedGroups);
    };

    engine.canvas.on('selection:created', updateHandler);
    engine.canvas.on('selection:updated', updateHandler);
    engine.canvas.on('selection:cleared', updateHandler);
    engine.canvas.on('object:modified', updateHandler);
    engine.canvas.on('object:added', updateHandler);
    engine.canvas.on('object:removed', updateHandler);
    engine.canvas.on('layer:changed', updateHandler);

    // --- UI EVENT DELEGATION ---
    container.addEventListener('click', (e) => {
        // 1. Tab Switching
        if (e.target.closest('.figma-tab')) {
            currentMode = e.target.closest('.figma-tab').dataset.mode;
            updateHandler();
            return;
        }

        // 2. Group Expand/Collapse Toggle
        if (e.target.closest('.layer-toggle-btn')) {
            e.stopPropagation();
            const item = e.target.closest('.layer-item');
            const path = item.dataset.path;
            if (expandedGroups.has(path)) expandedGroups.delete(path); else expandedGroups.add(path);
            updateHandler();
            return;
        }

        // 3. Layer Selection (Supports Multi-Select)
        const layerItem = e.target.closest('.layer-item');
        if (layerItem && !e.target.closest('button') && !e.target.isContentEditable) {
            const target = getObjectFromPath(engine, layerItem.dataset.path);
            
            if (target) {
                // Handle Multi-Selection (Cmd/Ctrl/Shift)
                if (e.metaKey || e.ctrlKey || e.shiftKey) {
                    const currentActive = engine.canvas.getActiveObjects();
                    
                    // Toggle logic
                    if (currentActive.includes(target)) {
                        // Remove from selection
                        const newSelection = currentActive.filter(o => o !== target);
                        engine.canvas.discardActiveObject();
                        if (newSelection.length > 0) {
                            const sel = new Fabric.ActiveSelection(newSelection, { canvas: engine.canvas });
                            engine.canvas.setActiveObject(sel);
                        }
                    } else {
                        // Add to selection
                        // Important: We must discard first to form a clean ActiveSelection
                        engine.canvas.discardActiveObject();
                        const newSelection = [...currentActive, target];
                        const sel = new Fabric.ActiveSelection(newSelection, { canvas: engine.canvas });
                        engine.canvas.setActiveObject(sel);
                    }
                } else {
                    // Single Select
                    engine.canvas.discardActiveObject();
                    engine.canvas.setActiveObject(target);
                }
                engine.canvas.requestRenderAll();
            }
            return;
        }

        // 4. Asset Insertion
        if (e.target.closest('.asset-item')) {
            const el = e.target.closest('.asset-item');
            insertAsset(engine, el.dataset.name, el.dataset.type);
            currentMode = 'design';
            return;
        }

        // 5. Action Buttons (Grouping, Export, etc.)
        const btn = e.target.closest('button');
        if (btn && btn.id) {
             if (btn.id === 'btn-group-object') engine.groupSystem.groupSelected();
             else if (btn.id === 'btn-ungroup-object') engine.groupSystem.ungroupSelected();
             else if (btn.id === 'btn-copy-png') engine.exportSelectedToClipboard();
             else if (btn.id === 'delete-selected-btn') {
                 const active = engine.canvas.getActiveObjects();
                 engine.canvas.remove(...active);
                 engine.canvas.discardActiveObject();
                 engine.canvas.requestRenderAll();
                 engine.debouncedSave();
             }
             // Layering
             else if (btn.id === 'btn-bring-forward') engine.layerSystem.bringForward(engine.canvas.getActiveObjects());
             else if (btn.id === 'btn-send-backward') engine.layerSystem.sendBackwards(engine.canvas.getActiveObjects());
             else if (btn.id === 'btn-bring-to-top') engine.layerSystem.bringToFront(engine.canvas.getActiveObjects());
             else if (btn.id === 'btn-send-to-bottom') engine.layerSystem.sendToBack(engine.canvas.getActiveObjects());
        }
    });

    // --- DRAG & DROP (Reordering / Nesting) ---
    container.addEventListener('dragstart', (e) => {
        const item = e.target.closest('.layer-item');
        if (item && !e.target.isContentEditable) {
            draggedPath = item.dataset.path;
            e.dataTransfer.effectAllowed = 'move';
            item.style.opacity = '0.5';
        }
    });
    container.addEventListener('dragend', (e) => {
        const item = e.target.closest('.layer-item');
        if (item) item.style.opacity = '1';
        container.querySelectorAll('.layer-item').forEach(el => { el.style.border = 'none'; el.style.background = ''; });
        draggedPath = null;
    });
    container.addEventListener('dragover', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.layer-item');
        if (targetItem && draggedPath) {
             const rect = targetItem.getBoundingClientRect();
             const isGroup = targetItem.querySelector('.layer-toggle-btn i');
             
             // Logic: Middle hover = Nest (if group), Edges = Reorder
             if (isGroup && e.clientY > rect.top + 10 && e.clientY < rect.bottom - 10) {
                 targetItem.style.background = 'rgba(0, 122, 255, 0.1)';
                 targetItem.style.border = '1px dashed var(--peak-accent)';
             } else {
                 targetItem.style.background = '';
                 if (e.clientY < rect.top + rect.height / 2) {
                     targetItem.style.borderTop = '2px solid var(--peak-accent)';
                     targetItem.style.borderBottom = 'none';
                 } else {
                     targetItem.style.borderBottom = '2px solid var(--peak-accent)';
                     targetItem.style.borderTop = 'none';
                 }
             }
        }
    });

    container.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetItem = e.target.closest('.layer-item');
        if (!targetItem || !draggedPath) return;
        
        const targetPath = targetItem.dataset.path;
        if (targetPath === draggedPath) return;

        const objToMove = getObjectFromPath(engine, draggedPath);
        const targetObj = getObjectFromPath(engine, targetPath);

        if (!objToMove || !targetObj) return;

        const rect = targetItem.getBoundingClientRect();
        const isMiddle = e.clientY > rect.top + 10 && e.clientY < rect.bottom - 10;
        
        // NEST INTO GROUP
        if (isMiddle && targetObj.type === 'group') {
            moveObjectIntoGroup(engine, objToMove, targetObj);
            expandedGroups.add(targetPath);
        } 
        // REORDER
        else {
            if (!String(draggedPath).includes('-') && !String(targetPath).includes('-')) {
                 const fromIdx = parseInt(draggedPath);
                 const toIdx = parseInt(targetPath);
                 engine.canvas.moveObjectTo(objToMove, toIdx);
            }
        }
        
        engine.canvas.requestRenderAll();
        engine.debouncedSave();
        engine.canvas.fire('layer:changed');
    });

    return () => {
        engine.canvas.off('selection:created', updateHandler);
        engine.canvas.off('selection:updated', updateHandler);
        engine.canvas.off('selection:cleared', updateHandler);
        engine.canvas.off('object:modified', updateHandler);
        engine.canvas.off('object:added', updateHandler);
        engine.canvas.off('object:removed', updateHandler);
        engine.canvas.off('layer:changed', updateHandler);
    };
}

function moveObjectIntoGroup(engine, obj, group) {
    // 1. Remove object from current context
    if (obj.group) obj.group.removeWithUpdate(obj);
    else engine.canvas.remove(obj);

    // 2. Calculate Relative Coordinates
    const objCenter = obj.getCenterPoint();
    const groupCenter = group.getCenterPoint();
    
    // Delta from group center
    const dx = objCenter.x - groupCenter.x;
    const dy = objCenter.y - groupCenter.y;

    // We must rotate the delta vector by the INVERSE of the group's rotation
    const r = -group.angle * (Math.PI / 180);
    const rx = dx * Math.cos(r) - dy * Math.sin(r);
    const ry = dx * Math.sin(r) + dy * Math.cos(r);

    // Compensate for Group Scale
    const finalX = rx / group.scaleX;
    const finalY = ry / group.scaleY;

    // Compensate Object Scale
    obj.scaleX = (obj.scaleX || 1) / group.scaleX;
    obj.scaleY = (obj.scaleY || 1) / group.scaleY;

    // Update Object Logic
    obj.set({
        left: finalX,
        top: finalY,
        originX: 'center',
        originY: 'center',
        angle: obj.angle - group.angle // Adjust angle relative to group
    });

    // 3. Add to Group
    group.add(obj);
    group.set('dirty', true);
    obj.setCoords(); 
    group.setCoords();
    
    engine.canvas.requestRenderAll();
}

module.exports = { attachWhiteboardInspectorListeners };