// src/components/Whiteboard/ToolbarUI.js
const { renderToolbarControlsHTML } = require('./tools/ToolControls');

function renderToolbarUI(id, safeTitle) {
    return `
        <div class="main-toolbar-container" style="display:flex; align-items:center; gap:10px; background:var(--window-background-color); border-radius:8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border:1px solid var(--border-color); padding: 4px;">
            
            <div id="header-controls-${id}" style="padding:0 12px; border-right:1px solid var(--border-color); display:flex; align-items:center; gap:8px;">
                 <span id="board-title-${id}" contenteditable="true" style="font-weight:600; color:var(--peak-primary); font-size:14px; padding:4px 0; white-space: nowrap; min-width:60px;">
                    ${safeTitle}
                </span>
            </div>
            
            <div style="display:flex; gap:2px; padding-right:8px; border-right:1px solid var(--border-color);">
                <button id="btn-undo-${id}" class="icon-btn" title="Undo (Ctrl+Z)">
                    <i data-lucide="undo-2" style="width:16px; height:16px;"></i>
                </button>
                <button id="btn-redo-${id}" class="icon-btn" title="Redo (Ctrl+Shift+Z)">
                    <i data-lucide="redo-2" style="width:16px; height:16px;"></i>
                </button>
            </div>

            <div id="main-tools-${id}" style="padding:0 4px;">
                ${renderToolbarControlsHTML(id)}
            </div>
            
            <div id="inspector-toggle-${id}" style="padding:0 8px; border-left:1px solid var(--border-color);">
                 <button id="btn-toggle-inspector-${id}" title="Toggle Object Inspector" class="icon-btn">
                     <i data-lucide="layout-panel-left" style="width:16px; height:16px;"></i>
                 </button>
            </div>

        </div>
    `;
}

function attachToolbarUIListeners(engine, titleEl) {
    const onTitleChange = () => { engine.debouncedSave(); };
    const onTitleKeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } };

    titleEl.addEventListener('input', onTitleChange);
    titleEl.addEventListener('keydown', onTitleKeydown);
    
    const inspectorBtn = document.getElementById(`btn-toggle-inspector-${engine.id}`);
    const onInspectorClick = () => window.openInspector('whiteboard-properties');
    if (inspectorBtn) inspectorBtn.addEventListener('click', onInspectorClick);

    // --- UNDO / REDO LISTENERS ---
    const undoBtn = document.getElementById(`btn-undo-${engine.id}`);
    const redoBtn = document.getElementById(`btn-redo-${engine.id}`);

    const onUndo = () => { if(engine.historySystem) engine.historySystem.undo(); };
    const onRedo = () => { if(engine.historySystem) engine.historySystem.redo(); };

    if(undoBtn) undoBtn.addEventListener('click', onUndo);
    if(redoBtn) redoBtn.addEventListener('click', onRedo);

    return () => {
        titleEl.removeEventListener('input', onTitleChange);
        titleEl.removeEventListener('keydown', onTitleKeydown);
        if (inspectorBtn) inspectorBtn.removeEventListener('click', onInspectorClick);
        if (undoBtn) undoBtn.removeEventListener('click', onUndo);
        if (redoBtn) redoBtn.removeEventListener('click', onRedo);
    };
}

module.exports = { renderToolbarUI, attachToolbarUIListeners };