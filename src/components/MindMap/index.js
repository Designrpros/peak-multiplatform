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
            <div class="mindmap-controls" style="position: fixed; bottom: 20px; right: 20px; z-index: 1000;">
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
    // ... (Layout and Draw logic remains the same) ...
    // ... (Layout and Draw logic remains the same) ...
    // ... (Layout and Draw logic remains the same) ...
    const GAP_Y = 80; const GAP_X = 180; const MIN_NODE_HEIGHT = 40;

    // Calculate the total height of a branch (including the node itself and all its descendants)
    const getBranchHeight = (nodeId) => {
        const node = mapData.nodes.find(n => n.id === nodeId);
        if (!node) return MIN_NODE_HEIGHT;

        const children = mapData.nodes.filter(n => n.parentId === nodeId);
        if (children.length === 0) {
            return (node.height) ? node.height : MIN_NODE_HEIGHT;
        }

        let childrenStackHeight = 0;
        children.forEach((child, index) => {
            childrenStackHeight += getBranchHeight(child.id);
            if (index < children.length - 1) childrenStackHeight += GAP_Y;
        });

        // The branch height is the maximum of the node's own height and its children's stack height
        // This ensures that if a node is very tall, it pushes siblings apart enough
        return Math.max((node.height || MIN_NODE_HEIGHT), childrenStackHeight);
    };

    const layoutTree = () => {
        const root = mapData.nodes.find(n => n.id === 'root');
        if (!root) return;

        const layoutBranch = (parentId, directionX) => {
            const children = mapData.nodes.filter(n => n.parentId === parentId);
            if (children.length === 0) return;

            const parent = mapData.nodes.find(n => n.id === parentId);

            // Calculate total height of children stack
            let childrenStackHeight = 0;
            children.forEach((child, index) => {
                childrenStackHeight += getBranchHeight(child.id);
                if (index < children.length - 1) childrenStackHeight += GAP_Y;
            });

            let currentY = parent.y - (childrenStackHeight / 2);

            children.forEach(child => {
                const childBranchHeight = getBranchHeight(child.id);
                const childCenterY = currentY + (childBranchHeight / 2);

                if (!isDraggingNode || activeNodeId !== child.id) {
                    const pW = parent.width || 100;
                    const cW = child.width || 100;
                    const dist = (pW / 2) + GAP_X + (cW / 2);
                    child.x = parent.x + (dist * directionX);
                    child.y = childCenterY;
                }

                layoutBranch(child.id, directionX);
                currentY += childBranchHeight + GAP_Y;
            });
        };

        const rootChildren = mapData.nodes.filter(n => n.parentId === 'root');
        const rightChildren = rootChildren.filter((_, i) => i % 2 === 0);
        const leftChildren = rootChildren.filter((_, i) => i % 2 !== 0);

        // Layout Right Side
        let rTotal = 0;
        rightChildren.forEach((c, i) => {
            rTotal += getBranchHeight(c.id);
            if (i < rightChildren.length - 1) rTotal += GAP_Y;
        });

        let rY = root.y - (rTotal / 2);
        rightChildren.forEach(c => {
            const h = getBranchHeight(c.id);
            if (!isDraggingNode || activeNodeId !== c.id) {
                c.x = root.x + 250; // Fixed distance for root children
                c.y = rY + (h / 2);
            }
            layoutBranch(c.id, 1);
            rY += h + GAP_Y;
        });

        // Layout Left Side
        let lTotal = 0;
        leftChildren.forEach((c, i) => {
            lTotal += getBranchHeight(c.id);
            if (i < leftChildren.length - 1) lTotal += GAP_Y;
        });

        let lY = root.y - (lTotal / 2);
        leftChildren.forEach(c => {
            const h = getBranchHeight(c.id);
            if (!isDraggingNode || activeNodeId !== c.id) {
                c.x = root.x - 250; // Fixed distance for root children
                c.y = lY + (h / 2);
            }
            layoutBranch(c.id, -1);
            lY += h + GAP_Y;
        });
    };

    // Helper to update transform with optional transition
    const updateTransform = (withTransition = true) => {
        if (!withTransition) {
            viewport.style.transition = 'none';
        } else {
            viewport.style.transition = 'transform 0.1s cubic-bezier(0.25, 0.8, 0.25, 1)';
        }
        viewport.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;

        // Restore transition after a brief delay if it was disabled
        if (!withTransition) {
            requestAnimationFrame(() => {
                // We don't immediately restore it to avoid jitter during continuous events
                // The next event will disable it again if needed
            });
        }
    };

    const centerView = () => {
        const rect = rootEl.getBoundingClientRect();
        panX = rect.width / 2;
        panY = rect.height / 2;
        scale = 1;
        updateTransform();
    };

    // Animation Loop
    let animationFrameId;
    const animateLayout = () => {
        let needsUpdate = false;
        const ease = 0.15; // Lerp factor

        mapData.nodes.forEach(node => {
            // Initialize current positions if missing
            if (typeof node.currentX === 'undefined') node.currentX = node.x;
            if (typeof node.currentY === 'undefined') node.currentY = node.y;

            // Lerp towards target
            const dx = node.x - node.currentX;
            const dy = node.y - node.currentY;

            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
                node.currentX += dx * ease;
                node.currentY += dy * ease;
                needsUpdate = true;

                // Update DOM
                const el = nodeLayer.querySelector(`[data-id="${node.id}"]`);
                if (el) {
                    el.style.left = `${node.currentX}px`;
                    el.style.top = `${node.currentY}px`;
                }
            } else {
                // Snap to finish
                node.currentX = node.x;
                node.currentY = node.y;
                const el = nodeLayer.querySelector(`[data-id="${node.id}"]`);
                if (el) {
                    el.style.left = `${node.x}px`;
                    el.style.top = `${node.y}px`;
                }
            }
        });

        // Redraw lines with current positions
        drawLines(true); // Pass true to indicate using currentX/Y

        if (needsUpdate) {
            animationFrameId = requestAnimationFrame(animateLayout);
        }
    };

    const drawLines = (useAnimated = false) => {
        svgLayer.innerHTML = '';
        mapData.nodes.forEach(node => {
            if (!node.parentId) return;
            const parent = mapData.nodes.find(n => n.id === node.parentId);
            if (!parent) return;

            // Use animated positions if available and requested
            const pX = useAnimated && parent.currentX !== undefined ? parent.currentX : parent.x;
            const pY = useAnimated && parent.currentY !== undefined ? parent.currentY : parent.y;
            const nX = useAnimated && node.currentX !== undefined ? node.currentX : node.x;
            const nY = useAnimated && node.currentY !== undefined ? node.currentY : node.y;

            // Create temporary objects for calculation
            const tempParent = { ...parent, x: pX, y: pY };
            const tempNode = { ...node, x: nX, y: nY };

            const color = getNodeColor(node, mapData.nodes);
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            const d = calculateConnectionPath(tempParent, tempNode);
            path.setAttribute('d', d);
            path.setAttribute('class', 'connection-line');
            path.setAttribute('stroke', color);

            // Variable Stroke Width based on Level
            let strokeWidth = 2;
            if (node.level === 1) strokeWidth = 4;
            else if (node.level === 2) strokeWidth = 3;

            path.setAttribute('stroke-width', strokeWidth);

            svgLayer.appendChild(path);
        });
    };

    const updateNodePositions = () => {
        // Start animation loop instead of direct setting
        if (animationFrameId) cancelAnimationFrame(animationFrameId);
        animateLayout();
    };

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

            // Initial position
            if (typeof node.currentX === 'undefined') { node.currentX = node.x; node.currentY = node.y; }
            el.style.left = `${node.currentX}px`; el.style.top = `${node.currentY}px`; el.style.transform = 'translate(-50%, -50%)';

            const observer = new ResizeObserver(entries => {
                for (let entry of entries) {
                    const rect = entry.target.getBoundingClientRect();
                    // CRITICAL FIX: Divide by scale to get world-space dimensions
                    // REMOVED BUFFERS: Lines connect to the visual edge now. Spacing handled by GAP constants.
                    node.width = rect.width / scale;
                    node.height = rect.height / scale;

                    if (layoutTimeout) cancelAnimationFrame(layoutTimeout);
                    layoutTimeout = requestAnimationFrame(() => {
                        if (!isDraggingNode) {
                            layoutTree();
                            updateNodePositions();
                        }
                        // drawLines is handled by animateLayout
                    });
                }
            });
            observer.observe(el);
            nodeLayer.appendChild(el);
        });

        // Initial draw
        drawLines(true);
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

    // --- ZOOM & PAN LOGIC ---

    // Wheel listener for Trackpad Zoom (Pinch) and Pan
    rootEl.addEventListener('wheel', (e) => {
        e.preventDefault();

        // Check for pinch-to-zoom (ctrlKey is standard for trackpad pinch on web)
        if (e.ctrlKey) {
            const zoomSensitivity = 0.01;
            const delta = -e.deltaY * zoomSensitivity;
            const newScale = Math.min(Math.max(0.1, scale + delta), 5); // Limit zoom 0.1x to 5x

            // Calculate cursor position relative to the viewport container
            const rect = rootEl.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            // Calculate the point in the world space that is currently under the mouse
            // worldX = (mouseX - panX) / scale
            const worldX = (mouseX - panX) / scale;
            const worldY = (mouseY - panY) / scale;

            // Update scale
            scale = newScale;

            // Adjust pan so that the world point remains under the mouse
            // mouseX = worldX * newScale + newPanX
            // newPanX = mouseX - worldX * newScale
            panX = mouseX - worldX * scale;
            panY = mouseY - worldY * scale;

            updateTransform(false); // Disable transition for smooth zooming
        } else {
            // Regular Pan
            panX -= e.deltaX;
            panY -= e.deltaY;
            updateTransform(false); // Disable transition for smooth panning
        }
    }, { passive: false });

    // Listeners
    rootEl.addEventListener('mousedown', (e) => {
        if (e.target === rootEl || e.target === viewport || e.target === svgLayer) {
            isPanning = true;
            dragStart = { x: e.clientX - panX, y: e.clientY - panY };
            rootEl.classList.add('panning');
            if (activeNodeId) { const el = nodeLayer.querySelector(`[data-id="${activeNodeId}"]`); if (el) { el.contentEditable = false; el.classList.remove('editing'); } activeNodeId = null; renderNodes(); }
            rootEl.focus({ preventScroll: true });
        }
    });

    nodeLayer.addEventListener('mousedown', (e) => {
        const nodeEl = e.target.closest('.mind-node');
        if (nodeEl) {
            e.stopPropagation();
            const nodeId = nodeEl.dataset.id;
            if (!nodeEl.isContentEditable) { e.preventDefault(); rootEl.focus({ preventScroll: true }); }
            if (activeNodeId !== nodeId) { activeNodeId = nodeId; renderNodes(); }
            if (document.activeElement !== nodeEl) { isDraggingNode = true; const node = mapData.nodes.find(n => n.id === nodeId); dragStart = { x: e.clientX, y: e.clientY, nodeX: node.x, nodeY: node.y }; }
        }
    });

    nodeLayer.addEventListener('dblclick', (e) => { const nodeEl = e.target.closest('.mind-node'); if (nodeEl) { e.stopPropagation(); enterEditMode(nodeEl.dataset.id); } });

    // SAVE ON TEXT CHANGE
    nodeLayer.addEventListener('focusout', (e) => {
        const el = e.target;
        if (el.classList.contains('mind-node')) {
            el.contentEditable = false; el.classList.remove('editing');
            const node = mapData.nodes.find(n => n.id === el.dataset.id);
            if (node && node.text !== el.innerText) {
                node.text = el.innerText;
                renderNodes();
            }
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (isPanning) {
            // Mouse drag panning (fallback or alternative to trackpad)
            panX = e.clientX - dragStart.x;
            panY = e.clientY - dragStart.y;
            updateTransform(false);
        } else if (isDraggingNode && activeNodeId) {
            const node = mapData.nodes.find(n => n.id === activeNodeId);
            if (node) {
                const dx = (e.clientX - dragStart.x) / scale;
                const dy = (e.clientY - dragStart.y) / scale;
                node.x = dragStart.nodeX + dx;
                node.y = dragStart.nodeY + dy;
                const el = nodeLayer.querySelector(`[data-id="${activeNodeId}"]`);
                if (el) { el.style.left = `${node.x}px`; el.style.top = `${node.y}px`; }
                drawLines();
            }
        }
    });

    // SAVE ON DRAG END
    window.addEventListener('mouseup', () => {
        if (isDraggingNode) {
            triggerSave(); // Save new position
        }
        if (isPanning) {
            // Re-enable transitions after panning stops
            viewport.style.transition = '';
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

    nodeLayer.addEventListener('input', (e) => { const el = e.target; const node = mapData.nodes.find(n => n.id === el.dataset.id); if (node) node.text = el.innerText; });

    container.querySelector(`#btn-center-${mapId}`).addEventListener('click', centerView);

    // Updated button zoom to also be smoother or at least consistent
    container.querySelector(`#btn-zoom-in-${mapId}`).addEventListener('click', () => {
        scale *= 1.2;
        updateTransform(true);
    });
    container.querySelector(`#btn-zoom-out-${mapId}`).addEventListener('click', () => {
        scale /= 1.2;
        updateTransform(true);
    });

    const btnAdd = container.querySelector(`#btn-add-node-${mapId}`);
    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            if (activeNodeId) addNode(activeNodeId);
            else if (mapData.nodes.length > 0) addNode('root');
        });
    }

    centerView();
    renderNodes();
    if (window.lucide) window.lucide.createIcons();
    rootEl.focus();

    return () => { };
}

module.exports = { renderMindMapHTML, attachMindMapListeners };