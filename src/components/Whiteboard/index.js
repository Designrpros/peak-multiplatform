// src/components/Whiteboard/index.js
const { ipcRenderer } = require('electron');
const CanvasEngine = require('./CanvasEngine');
const { attachToolbarControlsListeners } = require('./tools/ToolControls');
const { renderToolbarUI, attachToolbarUIListeners } = require('./ToolbarUI'); 
const { renderZoomControlsHTML, attachZoomControlsListeners } = require('./tools/ZoomControls'); 
const WhiteboardInspector = require('./WhiteboardInspector'); 
const WhiteboardContextMenu = require('./WhiteboardContextMenu'); // NEW IMPORT

const DEBOUNCE_TIME = 300; 

function renderWhiteboardHTML(id, initialData = {}) {
    const safeTitle = initialData.title || 'Untitled Board';
    
    return `
        <div class="whiteboard-container" id="fabric-container-${id}" 
             style="width:100%; height:100%; display:flex; flex-direction:column; position:relative; overflow:hidden; background-color: var(--text-background-color);">
             
            <canvas id="fabric-canvas-${id}"></canvas>

            <div id="toolbar-container-${id}" style="position:absolute; top:10px; left:50%; transform: translateX(-50%); 
                 display:flex; align-items:center; gap:10px; z-index:1000;">
                ${renderToolbarUI(id, safeTitle)}
            </div>
            
            <div id="zoom-container-${id}" style="position:absolute; bottom:20px; right:20px; z-index:1000;">
                ${renderZoomControlsHTML(id)}
            </div>
             <div style="display:none;" id="lucide-loader"></div>
        </div>
    `;
}

function attachWhiteboardListeners(id, initialData) {
    if(window.lucide) window.lucide.createIcons(); 
    
    const canvasElement = document.getElementById(`fabric-canvas-${id}`);
    const container = document.getElementById(`fabric-container-${id}`);

    let canvasEngine = null; 

    let saveTimeout = null;
    const debouncedSave = () => {
        if (!canvasEngine) return; 
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            const jsonState = canvasEngine.canvas.toJSON(['backgroundColor', 'viewportTransform']);
            const titleEl = document.getElementById(`board-title-${id}`);
            const title = titleEl ? titleEl.innerText.trim() : 'Untitled Board';
            
            ipcRenderer.send('save-whiteboard-data', id, JSON.stringify(jsonState), title);
        }, DEBOUNCE_TIME);
    };
    
    let zoomControlsCleanup = () => {};
    let inspectorCleanup = () => {};
    let contextMenuController = null; // State for new controller
    
    let updateZoomLevel = () => {
         const zoomLevelEl = document.getElementById(`zoom-level-${id}`);
         if (zoomLevelEl && canvasEngine && canvasEngine.canvas) {
             zoomLevelEl.textContent = `${Math.round(canvasEngine.canvas.getZoom() * 100)}%`;
         } else if (zoomLevelEl) {
             zoomLevelEl.textContent = `100%`;
         }
    };

    canvasEngine = new CanvasEngine(id, canvasElement, initialData.data || {}, debouncedSave, updateZoomLevel);
    window.activeWhiteboardEngine = canvasEngine; 

    const zoomControlsResult = attachZoomControlsListeners(canvasEngine);
    zoomControlsCleanup = zoomControlsResult.cleanup;
    
    window.attachWhiteboardInspector = (inspectorContainer) => {
        inspectorCleanup = WhiteboardInspector.attachWhiteboardInspectorListeners(canvasEngine, inspectorContainer);
        return inspectorCleanup;
    };
    
    const titleEl = document.getElementById(`board-title-${id}`);
    const toolbarControlsCleanup = attachToolbarControlsListeners(canvasEngine);
    const toolbarUICleanup = attachToolbarUIListeners(canvasEngine, titleEl); 
    
    updateZoomLevel();

    // --- NEW: Initialize Context Menu Controller ---
    // This replaces the previous inline contextmenu listener
    if (container) {
        contextMenuController = new WhiteboardContextMenu(canvasEngine, container);
        contextMenuController.attach();
    }
    // -----------------------------------------------

    // --- DRAG & DROP ---
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const filePath = files[0].path; 
            if (window.activeWhiteboardEngine) {
                const imageTool = window.activeWhiteboardEngine.toolManager.toolInstances['image'];
                const pointer = window.activeWhiteboardEngine.canvas.getPointer(e);
                if (imageTool && imageTool.loadAndPlaceImage) {
                    imageTool.loadAndPlaceImage(filePath, pointer.x, pointer.y);
                }
            }
        }
    };
    
    const handleDragOver = (e) => {
        e.preventDefault(); 
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy'; 
    };

    if (container) {
        container.addEventListener('dragover', handleDragOver);
        container.addEventListener('drop', handleDrop);
    }

    ipcRenderer.send('did-finish-content-swap');

    return () => {
        if (saveTimeout) clearTimeout(saveTimeout);
        toolbarControlsCleanup();
        toolbarUICleanup();
        zoomControlsCleanup();
        inspectorCleanup(); 
        
        // --- Clean up new controller ---
        if (contextMenuController) {
            contextMenuController.detach();
        }
        // -------------------------------
        
        delete window.attachWhiteboardInspector; 
        
        if (container) {
            container.removeEventListener('dragover', handleDragOver);
            container.removeEventListener('drop', handleDrop);
        }
        
        canvasEngine.dispose();
        if (window.activeWhiteboardEngine === canvasEngine) {
             window.activeWhiteboardEngine = null;
        }
    };
}

module.exports = { renderWhiteboardHTML, attachWhiteboardListeners };