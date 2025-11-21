// src/components/Whiteboard/tools/ToolControls.js

/**
 * Renders the HTML for the primary tool buttons (Select, Draw, Shapes, etc.).
 */
function renderToolbarControlsHTML(id) {
    return `
        <div id="main-tools-row-${id}" class="toolbar-horizontal-group" style="display:flex; align-items:center; gap:4px;">

            <button id="btn-mode-select-${id}" title="Select / Move / Pan" class="icon-btn active" data-tool="select">
                <i data-lucide="mouse-pointer" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>

            <button id="btn-mode-draw-${id}" title="Freehand Draw" class="icon-btn" data-tool="draw">
                <i data-lucide="pencil" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>

            <button id="btn-mode-rect-${id}" title="Draw Rectangle" class="icon-btn" data-tool="rectangle">
                <i data-lucide="square" style="width:16px; height:16px;"></i>
            </button>
            
            <button id="btn-mode-circle-${id}" title="Draw Circle" class="icon-btn" data-tool="circle">
                <i data-lucide="circle" style="width:16px; height:16px;"></i>
            </button>
            
            <button id="btn-mode-line-${id}" title="Draw Line" class="icon-btn" data-tool="line">
                <i data-lucide="minus" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>

            <button id="btn-mode-arrow-${id}" title="Draw Arrow" class="icon-btn" data-tool="arrow">
                <i data-lucide="arrow-right" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>
            
            <button id="btn-mode-image-${id}" title="Add Image" class="icon-btn" data-tool="image">
                <i data-lucide="image" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>
            
            <button id="btn-mode-text-${id}" title="Add Text" class="icon-btn" data-tool="text">
                <i data-lucide="type" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>
            
            <button id="btn-mode-eraser-${id}" title="Eraser" class="icon-btn" data-tool="eraser">
                <i data-lucide="eraser" style="width:16px; height:16px; stroke-width: 2.5;"></i>
            </button>
        </div>
    `;
}

/**
 * Attaches event listeners to the tool buttons.
 */
function attachToolbarControlsListeners(engine) {
    const toolButtons = document.querySelectorAll('.icon-btn[data-tool]');
    
    // Logic to update UI state (colors/active classes)
    const updateUI = (activeTool) => {
        toolButtons.forEach(btn => {
            const isActive = btn.dataset.tool === activeTool;
            btn.style.color = isActive ? 'var(--peak-accent)' : 'var(--peak-secondary)';
            btn.classList[isActive ? 'add' : 'remove']('active');
        });
    };
    
    // CRITICAL: Listen to engine changes to keep UI in sync
    engine.canvas.on('mode:changed', () => updateUI(engine.toolMode));


    toolButtons.forEach(btn => {
        btn.addEventListener('click', () => {
             engine.setToolMode(btn.dataset.tool);
             updateUI(btn.dataset.tool);
        });
    });
    
    updateUI(engine.toolMode);

    // Cleanup function
    return () => {
        toolButtons.forEach(btn => btn.removeEventListener('click', null));
        engine.canvas.off('mode:changed', null);
    };
}

module.exports = { renderToolbarControlsHTML, attachToolbarControlsListeners };