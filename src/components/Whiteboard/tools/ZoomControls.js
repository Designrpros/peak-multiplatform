// src/components/Whiteboard/tools/ZoomControls.js

/**
 * Renders the Zoom/Clear controls block in the bottom right corner.
 */
function renderZoomControlsHTML(id) {
    return `
        <div id="zoom-controls-panel-${id}" 
             style="display: flex; align-items: center; background:var(--window-background-color); border-radius:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border:1px solid var(--border-color); padding: 4px 10px; gap: 8px;">

            <span id="zoom-level-${id}" style="font-size: 13px; font-weight: 500; color: var(--peak-primary);">100%</span>
            
            <div style="width:1px; height:20px; background:var(--border-color);"></div>

            <button id="btn-zoom-out-${id}" title="Zoom Out" class="icon-btn">
                <i data-lucide="minus" style="width:16px; height:16px;"></i>
            </button>
            <button id="btn-zoom-in-${id}" title="Zoom In" class="icon-btn">
                <i data-lucide="plus" style="width:16px; height:16px;"></i>
            </button>
            
            <div style="width:1px; height:20px; background:var(--border-color);"></div>

            <button id="btn-clear-canvas-${id}" title="Clear Canvas" class="icon-btn">
                <i data-lucide="trash-2" style="width:16px; height:16px;"></i>
            </button>
        </div>
    `;
}

/**
 * Attaches event listeners for Zoom/Clear controls.
 * @param {CanvasEngine} engine 
 * @returns {{cleanup: function, updateZoomLevel: function}} cleanup function and updateZoomLevel function
 */
function attachZoomControlsListeners(engine) {
    const zoomInBtn = document.getElementById(`btn-zoom-in-${engine.id}`);
    const zoomOutBtn = document.getElementById(`btn-zoom-out-${engine.id}`);
    const clearBtn = document.getElementById(`btn-clear-canvas-${engine.id}`);
    const zoomLevelEl = document.getElementById(`zoom-level-${engine.id}`);
    
    // CRITICAL FIX: The UI update logic is now available on the engine instance
    const updateZoomLevel = engine.updateZoomLevel;
    
    // Zoom Logic
    const zoomCanvas = (factor) => {
        let zoom = engine.canvas.getZoom();
        let newZoom = zoom * factor;
        
        // Clamp zoom level
        if (newZoom > 20) newZoom = 20;
        if (newZoom < 0.1) newZoom = 0.1;
        
        // Center of the view for zoom point
        const center = engine.canvas.getCenterPoint();
        engine.canvas.zoomToPoint(center, newZoom);
        
        // CRITICAL FIX: Update the UI after zoom and save
        updateZoomLevel();
        engine.debouncedSave();
    };

    const onZoomIn = () => zoomCanvas(1.1);
    const onZoomOut = () => zoomCanvas(0.9);

    // Clear Logic
    const onClearClick = () => {
        if (confirm("Are you sure you want to clear the entire canvas?")) {
            engine.clear();
        }
    };
    
    // Attach Listeners
    // CRITICAL FIX: Buttons are now functional as they call zoomCanvas using the correct engine reference
    if (zoomInBtn) zoomInBtn.addEventListener('click', onZoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', onZoomOut);
    if (clearBtn) clearBtn.addEventListener('click', onClearClick);

    // Initial update
    updateZoomLevel();

    // Cleanup function
    const cleanup = () => {
        if (zoomInBtn) zoomInBtn.removeEventListener('click', onZoomIn);
        if (zoomOutBtn) zoomOutBtn.removeEventListener('click', onZoomOut);
        if (clearBtn) clearBtn.removeEventListener('click', onClearClick);
    };
    
    return { cleanup, updateZoomLevel };
}

module.exports = { renderZoomControlsHTML, attachZoomControlsListeners };