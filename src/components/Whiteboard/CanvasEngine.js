// src/components/Whiteboard/CanvasEngine.js
const { ipcRenderer } = require('electron');
const { TOOL_MODES, CURSORS } = require('./utils');
const ToolManager = require('./tools/ToolManager');
const WhiteboardContextMenu = require('./WhiteboardContextMenu'); 
const LayerSystem = require('./systems/LayerSystem');
const GroupSystem = require('./systems/GroupSystem');
const HistorySystem = require('./systems/HistorySystem'); 

let Fabric;
try { Fabric = require('fabric'); } catch(e) { if (typeof fabric !== 'undefined') Fabric = fabric; }

class CanvasEngine {
    constructor(id, canvasElement, initialData, debouncedSaveCallback, updateZoomLevelCallback) {
        this.id = id;
        this.debouncedSave = this.wrapDebouncedSave(debouncedSaveCallback);
        this.updateZoomLevel = updateZoomLevelCallback;
        this.toolMode = TOOL_MODES.SELECT;
        this.isPanning = false;
        this.currentSettings = { color: '#6688AA', width: 5 };
        this.isLoading = false;
        
        const containerRect = canvasElement.parentNode.getBoundingClientRect();

        this.canvas = new Fabric.Canvas(canvasElement, {
            isDrawingMode: false,
            backgroundColor: 'white',
            selection: true,
            stopContextMenu: true, 
            width: containerRect.width || 800, 
            height: containerRect.height || 600,
            allowTouchScrolling: true,
            preserveObjectStacking: true, 
            selectionColor: 'rgba(102, 136, 170, 0.3)', 
            selectionBorderColor: '#6688AA',
            selectionLineWidth: 2,
            fireRightClick: true 
        });
        
        // --- Systems ---
        this.historySystem = new HistorySystem(this);
        this.layerSystem = new LayerSystem(this);
        this.groupSystem = new GroupSystem(this);
        this.toolManager = new ToolManager(this);
        
        if (this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.color = this.currentSettings.color;
            this.canvas.freeDrawingBrush.width = this.currentSettings.width;
        }

        this.contextMenu = new WhiteboardContextMenu(this, canvasElement.parentNode);
        this.contextMenu.attach();

        this.handleGlobalKeyDown = this.handleGlobalKeyDown.bind(this);
        this.handleGlobalDoubleClick = this.handleGlobalDoubleClick.bind(this);

        this.initListeners();
        this.loadData(initialData);
        
        this.resizeObserver = new ResizeObserver(this.resize.bind(this));
        this.resizeObserver.observe(canvasElement.parentNode);
        this.setToolMode(TOOL_MODES.SELECT);
    }

    wrapDebouncedSave(fn) {
        return () => {
            if (this.isLoading) return;
            if (this.historySystem) {
                 this.historySystem.saveState(); 
            }
            fn();
        };
    }

    loadData(initialData) {
        this.isLoading = true;
        if (initialData.objects && initialData.objects.length > 0) {
            this.canvas.loadFromJSON(initialData, () => {
                this.isLoading = false;
                
                // FIX: Enforce group behavior on loaded items
                this.canvas.getObjects().forEach(obj => {
                    if (obj.type === 'group') {
                        obj.set({
                            subTargetCheck: false, // Move as group
                            interactive: true      // Allow drilling in
                        });
                    }
                });

                this.canvas.calcOffset();
                this.canvas.requestRenderAll();
                if (this.historySystem) this.historySystem.saveState();
                this.canvas.fire('layer:changed');
            });
        } else {
            this.isLoading = false;
            if (initialData.viewportTransform) {
                 this.canvas.setViewportTransform(initialData.viewportTransform);
                 this.canvas.requestRenderAll();
            }
            if (this.historySystem) this.historySystem.saveState();
        }
    }

    resize() {
        const container = this.canvas.getElement().parentNode;
        const containerRect = container.getBoundingClientRect();
        if (containerRect.width === 0 || containerRect.height === 0) return;
        this.canvas.setWidth(containerRect.width);
        this.canvas.setHeight(containerRect.height);
        this.canvas.calcOffset();
        this.canvas.requestRenderAll();
    }
    
    setToolMode(mode) {
        this.toolManager.setTool(mode);
        this.toolMode = mode;
        this.canvas.isDrawingMode = (mode === TOOL_MODES.DRAW);
        const isDrawingOrErasing = (mode !== TOOL_MODES.SELECT && mode !== TOOL_MODES.TEXT);
        this.canvas.selection = !isDrawingOrErasing;
        
        this.canvas.forEachObject(obj => {
             obj.selectable = (mode === TOOL_MODES.SELECT || obj.hasControls); 
             obj.hasControls = (mode === TOOL_MODES.SELECT);
        });

        this.canvas.defaultCursor = CURSORS[mode.toUpperCase()] || 'default';
        this.canvas.hoverCursor = (mode === TOOL_MODES.SELECT) ? 'move' : this.canvas.defaultCursor;
        
        if (this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.color = this.currentSettings.color;
            this.canvas.freeDrawingBrush.width = this.currentSettings.width;
        }

        this.canvas.fire('mode:changed', { mode });
        this.canvas.requestRenderAll();
    }

    setBrushColor(color) {
        this.currentSettings.color = color;
        if (this.canvas.freeDrawingBrush) { this.canvas.freeDrawingBrush.color = color; }
    }

    setBrushWidth(width) {
        this.currentSettings.width = width;
        if (this.canvas.freeDrawingBrush) { this.canvas.freeDrawingBrush.width = width; }
    }

    clear() {
        this.canvas.clear();
        this.canvas.backgroundColor = 'white';
        this.debouncedSave();
    }
    
    async exportSelectedToClipboard() {
        const active = this.canvas.getActiveObject(); 
        if (!active) return { error: 'No object selected.' };

        try {
            const clonedObj = await active.clone();
            const dataUrl = clonedObj.toDataURL({
                format: 'png', 
                multiplier: 2,
                enableRetinaScaling: true
            });
            return window.ipcRenderer.invoke('clipboard:write-image-dataurl', dataUrl);
        } catch(e) {
            console.error("Export failed:", e);
        }
    }

    initListeners() {
        this.canvas.on('object:modified', this.debouncedSave);
        this.canvas.on('object:added', this.debouncedSave);
        this.canvas.on('object:removed', this.debouncedSave);
        
        this.canvas.on('mouse:down', this.handleGlobalMouseDown.bind(this));
        this.canvas.on('mouse:move', this.handleGlobalMouseMove.bind(this));
        this.canvas.on('mouse:up', this.handleGlobalMouseUp.bind(this));
        this.canvas.on('mouse:wheel', this.handleMouseWheel.bind(this));
        
        // Double click listener for "Drilling Down"
        this.canvas.on('mouse:dblclick', this.handleGlobalDoubleClick); 

        window.addEventListener('keydown', this.handleGlobalKeyDown);
    }
    
    handleGlobalKeyDown(e) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) || e.target.isContentEditable) return;

        const key = e.key.toLowerCase();
        const isCmdOrCtrl = e.metaKey || e.ctrlKey;

        if (isCmdOrCtrl) {
            if (key === 'z') {
                e.preventDefault();
                e.shiftKey ? this.historySystem.redo() : this.historySystem.undo();
                return;
            }
            if (key === '[' || key === ']') {
                e.preventDefault();
                const activeObjects = this.canvas.getActiveObjects();
                if (activeObjects.length === 0) return;
                if (key === '[') {
                    e.shiftKey ? this.layerSystem.sendToBack(activeObjects) : this.layerSystem.sendBackwards(activeObjects);
                } else {
                    e.shiftKey ? this.layerSystem.bringToFront(activeObjects) : this.layerSystem.bringForward(activeObjects);
                }
                return;
            }
            if (key === 'c') { e.preventDefault(); this.groupSystem.copy(); } 
            else if (key === 'v') { e.preventDefault(); this.groupSystem.paste(); } 
            else if (key === 'g') { e.preventDefault(); e.shiftKey ? this.groupSystem.ungroupSelected() : this.groupSystem.groupSelected(); }
            else if (key === '=' || key === '+') { e.preventDefault(); this.zoomIn(); } 
            else if (key === '-') { e.preventDefault(); this.zoomOut(); } 
            else if (key === '0') { e.preventDefault(); this.resetZoom(); }
            return;
        }

        if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
            switch (key) {
                case 'v': this.setToolMode(TOOL_MODES.SELECT); break;
                case 'p': this.setToolMode(TOOL_MODES.DRAW); break;
                case 'r': this.setToolMode(TOOL_MODES.RECTANGLE); break;
                case 'o': this.setToolMode(TOOL_MODES.CIRCLE); break;
                case 't': this.setToolMode(TOOL_MODES.TEXT); break;
                case 'e': this.setToolMode(TOOL_MODES.ERASER); break;
                case 'l': this.setToolMode(TOOL_MODES.LINE); break;
                case 'a': this.setToolMode(TOOL_MODES.ARROW); break;
                case 'i': this.setToolMode(TOOL_MODES.IMAGE); break;
                case 'backspace':
                case 'delete':
                     const active = this.canvas.getActiveObjects();
                     if (active.length) {
                         this.canvas.remove(...active);
                         this.canvas.discardActiveObject();
                         this.canvas.requestRenderAll();
                         this.debouncedSave();
                     }
                     break;
            }
        }
    }

    zoomIn() {
        let zoom = this.canvas.getZoom() * 1.1;
        if (zoom > 20) zoom = 20;
        this.canvas.zoomToPoint(this.canvas.getCenterPoint(), zoom);
        this.updateZoomLevel();
        this.debouncedSave();
    }

    zoomOut() {
        let zoom = this.canvas.getZoom() * 0.9;
        if (zoom < 0.1) zoom = 0.1;
        this.canvas.zoomToPoint(this.canvas.getCenterPoint(), zoom);
        this.updateZoomLevel();
        this.debouncedSave();
    }

    resetZoom() {
        this.canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
        this.updateZoomLevel();
        this.debouncedSave();
    }
    
    handleGlobalMouseDown(options) {
        const isMiddleClick = options.e.button === 1;
        const isSpaceKey = options.e.code === 'Space' || options.e.spaceKey; 
        const isAltKey = options.e.altKey; 

        if (isMiddleClick || isSpaceKey || isAltKey) {
            if (options.e.preventDefault) options.e.preventDefault();
            this.isPanning = true;
            this.canvas.selection = false; 
            this.canvas.defaultCursor = CURSORS.PANNING;
            this.canvas.hoverCursor = CURSORS.PANNING;
            return;
        }

        // DEEP SELECT (Cmd/Ctrl + Click)
        // Allows clicking straight through the group container to the child
        const isDeepSelect = options.e.metaKey || options.e.ctrlKey;
        if (isDeepSelect && this.toolMode === TOOL_MODES.SELECT) {
            const target = this.canvas.findTarget(options.e);
            
            if (target && target.type === 'group') {
                // Temporarily enable subTargetCheck to find the child
                target.subTargetCheck = true;
                const subTarget = this.canvas.findTarget(options.e);
                target.subTargetCheck = false; // Reset immediately

                // If we hit a child, select it directly
                if (subTarget && subTarget !== target) {
                    this.canvas.discardActiveObject();
                    this.canvas.setActiveObject(subTarget);
                    this.canvas.requestRenderAll();
                    return; // Stop standard selection
                }
            }
        }

        if (this.toolMode === TOOL_MODES.SELECT) {
            this.isPanning = false;
            this.canvas.selection = true; 
            this.canvas.defaultCursor = 'default';
            this.canvas.hoverCursor = 'move';
        }
    }

    // DOUBLE CLICK TO DRILL DOWN
    handleGlobalDoubleClick(options) {
        const target = this.canvas.findTarget(options.e);

        if (target && target.type === 'group') {
             // Enable check, find child, disable check
             target.subTargetCheck = true;
             const subTarget = this.canvas.findTarget(options.e);
             target.subTargetCheck = false;
             
             if (subTarget && subTarget !== target) {
                 this.canvas.setActiveObject(subTarget);
                 // If text, start editing immediately
                 if (subTarget.type === 'i-text' || subTarget.type === 'textbox') {
                     subTarget.enterEditing();
                 }
                 this.canvas.requestRenderAll();
             }
        } else if (target && (target.type === 'i-text' || target.type === 'textbox')) {
            // Normal text edit
            target.enterEditing();
        }
    }

    handleGlobalMouseMove(options) {
        if (this.isPanning && (options.e.movementX || options.e.movementY)) {
            const delta = new Fabric.Point(options.e.movementX, options.e.movementY);
            this.canvas.relativePan(delta);
            options.e.preventDefault();
            options.e.stopPropagation();
        }
    }

    handleGlobalMouseUp(options) {
        if (this.isPanning) {
            this.isPanning = false;
            this.setToolMode(this.toolMode);
            this.debouncedSave();
        }
    }
    
    handleMouseWheel(options) {
        const evt = options.e;
        evt.preventDefault();
        evt.stopPropagation();

        if (evt.ctrlKey) {
             const delta = evt.deltaY;
             let zoom = this.canvas.getZoom();
             zoom *= 0.995 ** delta; 
             if (zoom > 20) zoom = 20;
             if (zoom < 0.1) zoom = 0.1;
             this.canvas.zoomToPoint({ x: evt.offsetX, y: evt.offsetY }, zoom);
        } else {
             const vpt = this.canvas.viewportTransform;
             vpt[4] -= evt.deltaX;
             vpt[5] -= evt.deltaY;
             this.canvas.requestRenderAll();
        }
        
        if (this._zoomSaveTimeout) clearTimeout(this._zoomSaveTimeout);
        this._zoomSaveTimeout = setTimeout(() => {
            this.updateZoomLevel();
            this.debouncedSave();
            this._zoomSaveTimeout = null;
        }, 200); 
    }

    dispose() {
        window.removeEventListener('keydown', this.handleGlobalKeyDown);
        if (this.contextMenu) this.contextMenu.detach();
        this.toolManager.dispose();
        this.canvas.off();
        this.resizeObserver.unobserve(this.canvas.getElement().parentNode);
        this.canvas.dispose();
        if (this._zoomSaveTimeout) clearTimeout(this._zoomSaveTimeout);
    }
}

module.exports = CanvasEngine;