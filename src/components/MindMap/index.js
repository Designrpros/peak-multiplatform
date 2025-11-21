// src/components/MindMap/index.js
const { getNodeColor } = require('./theme.js');
const { calculateConnectionPath } = require('./geometry.js');

function renderMindMapHTML(mapData) {
    const safeId = mapData.id;
    return `
        <div class="mindmap-container" id="mindmap-container-${safeId}" tabindex="0">
            <div class="mindmap-viewport" id="viewport-${safeId}">
                <svg class="mindmap-svg-layer" id="svg-${safeId}"></svg>
                <div class="mindmap-node-layer" id="nodes-${safeId}"></div>
            </div>
            <div class="mindmap-controls" style="position: absolute; bottom: 20px; right: 20px; z-index: 1000;">
                <button class="control-btn" id="btn-center-${safeId}" title="Center View"><i data-lucide="crosshair"></i></button>
                <button class="control-btn" id="btn-add-node-${safeId}" title="Add Child Node"><i data-lucide="plus"></i></button>
                <div class="separator"></div>
                <button class="control-btn" id="btn-zoom-in-${safeId}" title="Zoom In"><i data-lucide="zoom-in"></i></button>
                <button class="control-btn" id="btn-zoom-out-${safeId}" title="Zoom Out"><i data-lucide="zoom-out"></i></button>
            </div>
        </div>
    `;
}

// Added onSave parameter
function attachMindMapListeners(mapData, container, onSave) {
    const mapId = mapData.id;
    const rootEl = container.querySelector('.mindmap-container');
    const viewport = container.querySelector('.mindmap-viewport');
    const svgLayer = container.querySelector('.mindmap-svg-layer');
    const nodeLayer = container.querySelector('.mindmap-node-layer');

    let scale = 1;
    let panX = 0, panY = 0;
    let isPanning = false;
    let isDraggingNode = false;
    let dragStart = { x: 0, y: 0 };
    let activeNodeId = null; 
    let layoutTimeout = null;

    if (!mapData.nodes || mapData.nodes.length === 0) {
        mapData.nodes = [{ id: 'root', text: mapData.title || 'Central Idea', x: 0, y: 0, parentId: null, level: 0 }];
    }

    const triggerSave = () => {
        if (typeof onSave === 'function') onSave(mapData);
    };

    // ... (Layout and Draw logic remains the same) ...
    const GAP_Y = 20; const GAP_X = 150; const MIN_NODE_HEIGHT = 40;
    const getSubtreeSize = (nodeId) => {
        const children = mapData.nodes.filter(n => n.parentId === nodeId);
        if (children.length === 0) { const node = mapData.nodes.find(n => n.id === nodeId); return (node && node.height) ? node.height : MIN_NODE_HEIGHT; }
        let totalHeight = 0; children.forEach((child, index) => { totalHeight += getSubtreeSize(child.id); if (index < children.length - 1) totalHeight += GAP_Y; }); return totalHeight;
    };
    const layoutTree = () => {
        const root = mapData.nodes.find(n => n.id === 'root'); if (!root) return;
        const layoutBranch = (parentId, directionX) => {
            const children = mapData.nodes.filter(n => n.parentId === parentId); if (children.length === 0) return;
            const parent = mapData.nodes.find(n => n.id === parentId);
            let totalBlockHeight = getSubtreeSize(parentId);
            let currentY = parent.y - (totalBlockHeight / 2);
            children.forEach(child => {
                const childHeight = getSubtreeSize(child.id); const childCenterY = currentY + (childHeight / 2);
                if (!isDraggingNode || activeNodeId !== child.id) { const pW = parent.width || 100; const cW = child.width || 100; const dist = (pW / 2) + GAP_X + (cW / 2); child.x = parent.x + (dist * directionX); child.y = childCenterY; }
                layoutBranch(child.id, directionX); currentY += childHeight + GAP_Y;
            });
        };
        const rootChildren = mapData.nodes.filter(n => n.parentId === 'root'); const rightChildren = rootChildren.filter((_, i) => i % 2 === 0); const leftChildren = rootChildren.filter((_, i) => i % 2 !== 0);
        let rTotal = rightChildren.reduce((acc, c) => acc + getSubtreeSize(c.id), 0) + (Math.max(0, rightChildren.length - 1) * GAP_Y); let rY = root.y - (rTotal / 2);
        rightChildren.forEach(c => { const h = getSubtreeSize(c.id); if (!isDraggingNode || activeNodeId !== c.id) { c.x = root.x + 220; c.y = rY + (h / 2); } layoutBranch(c.id, 1); rY += h + GAP_Y; });
        let lTotal = leftChildren.reduce((acc, c) => acc + getSubtreeSize(c.id), 0) + (Math.max(0, leftChildren.length - 1) * GAP_Y); let lY = root.y - (lTotal / 2);
        leftChildren.forEach(c => { const h = getSubtreeSize(c.id); if (!isDraggingNode || activeNodeId !== c.id) { c.x = root.x - 220; c.y = lY + (h / 2); } layoutBranch(c.id, -1); lY += h + GAP_Y; });
    };

    const updateTransform = () => { viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`; };
    const centerView = () => { const rect = rootEl.getBoundingClientRect(); panX = rect.width / 2; panY = rect.height / 2; scale = 1; updateTransform(); };
    const drawLines = () => { svgLayer.innerHTML = ''; mapData.nodes.forEach(node => { if (!node.parentId) return; const parent = mapData.nodes.find(n => n.id === node.parentId); if (!parent) return; const color = getNodeColor(node, mapData.nodes); const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); const d = calculateConnectionPath(parent, node); path.setAttribute('d', d); path.setAttribute('class', 'connection-line'); path.setAttribute('stroke', color); svgLayer.appendChild(path); }); };

    const renderNodes = () => {
        if (!isDraggingNode) layoutTree();
        nodeLayer.innerHTML = '';
        mapData.nodes.forEach(node => {
            const el = document.createElement('div');
            el.className = `mind-node ${node.id === activeNodeId ? 'selected' : ''}`;
            el.dataset.id = node.id;
            el.dataset.level = node.level;
            el.contentEditable = false; 
            el.innerText = node.text;
            const color = getNodeColor(node, mapData.nodes);
            el.style.borderColor = color;
            el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; el.style.transform = 'translate(-50%, -50%)';
            const observer = new ResizeObserver(entries => {
                for (let entry of entries) {
                    node.width = entry.contentRect.width + 36; node.height = entry.contentRect.height + 16;
                    if (layoutTimeout) cancelAnimationFrame(layoutTimeout); layoutTimeout = requestAnimationFrame(() => { if (!isDraggingNode) layoutTree(); drawLines(); });
                }
            });
            observer.observe(el);
            nodeLayer.appendChild(el);
        });
        setTimeout(drawLines, 0);
        
        // TRIGGER SAVE ON RENDER
        triggerSave();
    };

    const addNode = (parentId) => {
        const parent = mapData.nodes.find(n => n.id === parentId);
        if (!parent) return;
        const id = 'node-' + Date.now();
        const newNode = { id, text: 'New Idea', x: parent.x + 100, y: parent.y + 50, parentId: parent.id, level: parent.level + 1 };
        mapData.nodes.push(newNode);
        activeNodeId = id;
        renderNodes();
        setTimeout(() => { enterEditMode(id); }, 50);
    };

    const deleteNode = (id) => {
        if (id === 'root') return;
        const toDelete = [id];
        const gatherChildren = (pid) => { mapData.nodes.filter(n => n.parentId === pid).forEach(c => { toDelete.push(c.id); gatherChildren(c.id); }); };
        gatherChildren(id);
        mapData.nodes = mapData.nodes.filter(n => !toDelete.includes(n.id));
        activeNodeId = null;
        renderNodes();
    };

    const enterEditMode = (id) => {
        const el = nodeLayer.querySelector(`[data-id="${id}"]`);
        if (el) { el.contentEditable = true; el.classList.add('editing'); el.focus(); document.execCommand('selectAll', false, null); }
    };

    // Listeners
    rootEl.addEventListener('mousedown', (e) => {
        if (e.target === rootEl || e.target === viewport || e.target === svgLayer) {
            isPanning = true;
            dragStart = { x: e.clientX - panX, y: e.clientY - panY };
            rootEl.classList.add('panning');
            if (activeNodeId) { const el = nodeLayer.querySelector(`[data-id="${activeNodeId}"]`); if(el) { el.contentEditable = false; el.classList.remove('editing'); } activeNodeId = null; renderNodes(); }
            rootEl.focus({ preventScroll: true });
        }
    });

    nodeLayer.addEventListener('mousedown', (e) => {
        const nodeEl = e.target.closest('.mind-node');
        if (nodeEl) {
            e.stopPropagation();
            const nodeId = nodeEl.dataset.id;
            if (!nodeEl.isContentEditable) { e.preventDefault(); rootEl.focus({ preventScroll: true }); }
            if(activeNodeId !== nodeId) { activeNodeId = nodeId; renderNodes(); }
            if (document.activeElement !== nodeEl) { isDraggingNode = true; const node = mapData.nodes.find(n => n.id === nodeId); dragStart = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }; }
        }
    });

    nodeLayer.addEventListener('dblclick', (e) => { const nodeEl = e.target.closest('.mind-node'); if(nodeEl) { e.stopPropagation(); enterEditMode(nodeEl.dataset.id); } });
    
    // SAVE ON TEXT CHANGE
    nodeLayer.addEventListener('focusout', (e) => { 
        const el = e.target; 
        if (el.classList.contains('mind-node')) { 
            el.contentEditable = false; el.classList.remove('editing'); 
            const node = mapData.nodes.find(n => n.id === el.dataset.id); 
            if(node && node.text !== el.innerText) { 
                node.text = el.innerText; 
                renderNodes(); 
            }
        } 
    });
    
    window.addEventListener('mousemove', (e) => { if (isPanning) { panX = e.clientX - dragStart.x; panY = e.clientY - dragStart.y; updateTransform(); } else if (isDraggingNode && activeNodeId) { const node = mapData.nodes.find(n => n.id === activeNodeId); if (node) { const dx = (e.clientX - dragStart.x) / scale; const dy = (e.clientY - dragStart.y) / scale; node.x = dragStart.nodeX + dx; node.y = dragStart.nodeY + dy; const el = nodeLayer.querySelector(`[data-id="${activeNodeId}"]`); if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; } drawLines(); } } });
    
    // SAVE ON DRAG END
    window.addEventListener('mouseup', () => { 
        if (isDraggingNode) {
             triggerSave(); // Save new position
        }
        isPanning = false; isDraggingNode = false; rootEl.classList.remove('panning'); 
    });
    
    rootEl.addEventListener('keydown', (e) => {
        if (!activeNodeId) return;
        const isEditing = document.activeElement.classList.contains('mind-node');
        const node = mapData.nodes.find(n => n.id === activeNodeId);
        if (e.key === 'Tab') { e.preventDefault(); addNode(activeNodeId); } 
        else if (e.key === 'Enter') { e.preventDefault(); if (isEditing) { document.activeElement.blur(); rootEl.focus(); } else { if (node.parentId) addNode(node.parentId); } } 
        else if ((e.key === 'Backspace' || e.key === 'Delete') && !isEditing) { deleteNode(activeNodeId); }
    });
    
    nodeLayer.addEventListener('input', (e) => { const el = e.target; const node = mapData.nodes.find(n => n.id === el.dataset.id); if(node) node.text = el.innerText; });

    container.querySelector(`#btn-center-${mapId}`).addEventListener('click', centerView);
    container.querySelector(`#btn-zoom-in-${mapId}`).addEventListener('click', () => { scale *= 1.1; updateTransform(); });
    container.querySelector(`#btn-zoom-out-${mapId}`).addEventListener('click', () => { scale *= 0.9; updateTransform(); });
    
    const btnAdd = container.querySelector(`#btn-add-node-${mapId}`);
    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            if (activeNodeId) addNode(activeNodeId);
            else if (mapData.nodes.length > 0) addNode('root'); 
        });
    }

    centerView();
    renderNodes();
    if(window.lucide) window.lucide.createIcons();
    rootEl.focus();

    return () => {};
}

module.exports = { renderMindMapHTML, attachMindMapListeners };