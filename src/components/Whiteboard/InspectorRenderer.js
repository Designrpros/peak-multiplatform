// src/components/Whiteboard/InspectorRenderer.js
const { colorToHex } = require('./InspectorUtils');
const { CATEGORIZED_SHAPES, NOTE_ASSETS } = require('./shapes/ShapeDefinitions');

const ICONS = {
    alignLeft: 'align-horizontal-justify-start',
    alignCenter: 'align-horizontal-justify-center',
    alignRight: 'align-horizontal-justify-end',
    alignTop: 'align-vertical-justify-start',
    alignMiddle: 'align-vertical-justify-center',
    alignBottom: 'align-vertical-justify-end',
};

const isMac = process.platform === 'darwin' || (typeof navigator !== 'undefined' && navigator.platform.toUpperCase().indexOf('MAC') >= 0);
const MOD_KEY = isMac ? 'Cmd' : 'Ctrl';

const KEYBOARD_SHORTCUTS = [
    { label: 'Tools', items: [ { name: 'Select', keys: ['V'] }, { name: 'Pan', keys: ['Space'] }, { name: 'Rectangle', keys: ['R'] }, { name: 'Circle', keys: ['O'] }, { name: 'Text', keys: ['T'] } ]},
    { label: 'Actions', items: [ { name: 'Copy', keys: [MOD_KEY, 'C'] }, { name: 'Paste', keys: [MOD_KEY, 'V'] }, { name: 'Group', keys: [MOD_KEY, 'G'] }, { name: 'Ungroup', keys: [MOD_KEY, 'Shift', 'G'] }, { name: 'Delete', keys: ['Del'] } ]},
    { label: 'Layering', items: [ { name: 'Bring Forward', keys: [MOD_KEY, ']'] }, { name: 'Send Backward', keys: [MOD_KEY, '['] } ]},
    { label: 'View', items: [ { name: 'Zoom In', keys: [MOD_KEY, '+'] }, { name: 'Zoom Out', keys: [MOD_KEY, '-'] }, { name: 'Reset Zoom', keys: [MOD_KEY, '0'] } ]}
];

// --- HELPERS ---
function renderSectionHeader(title) { return `<div class="inspector-section-header">${title}</div>`; }
function renderInput(label, value, prop, type = 'number', options = {}) {
    return `<div class="figma-input-wrapper" title="${label}"><span class="figma-label">${options.icon ? `<i data-lucide="${options.icon}"></i>` : label}</span><input type="${type}" class="figma-input" data-prop="${prop}" value="${value}" ${options.step ? `step="${options.step}"` : ''}></div>`;
}
function renderColorRow(label, prop, value) {
    const hex = colorToHex(value);
    return `<div class="figma-property-row"><div class="figma-color-swatch-wrapper"><div class="figma-color-preview" style="background-color: ${hex};"></div><input type="color" class="figma-color-input" data-prop="${prop}" value="${hex}"></div><input type="text" class="figma-input figma-hex-text" value="${hex.toUpperCase()}" readonly><div class="figma-input-wrapper small"><span class="figma-label">%</span><input type="number" class="figma-input" data-prop="opacity" value="100" max="100"></div></div>`;
}

// --- LAYER TREE ---
function getObjectTitle(obj) {
    if (obj.layerName) return obj.layerName;
    if (obj.customIconName) return `${obj.customIconName}`;
    if (obj.text) return `"${obj.text.slice(0, 15)}${obj.text.length>15?'...':''}"`;
    if (obj.type === 'i-text') return 'Text';
    if (obj.type === 'rect') return 'Rectangle';
    if (obj.type === 'circle') return 'Circle';
    if (obj.type === 'group') return 'Group';
    if (obj.type === 'image') return 'Image';
    return obj.type;
}

function renderLayerItem(obj, pathString, isSelected, depth, expandedGroups) {
    const isGroup = obj.type === 'group' && obj._objects && obj._objects.length > 0;
    const icon = isGroup ? 'folder' : (obj.type === 'i-text' ? 'type' : (obj.type === 'image' ? 'image' : 'square'));
    const title = getObjectTitle(obj);
    const indent = depth * 12;
    const isExpanded = expandedGroups.has(String(pathString));
    const chevron = isGroup ? (isExpanded ? 'chevron-down' : 'chevron-right') : '';

    let html = `
        <li class="layer-item ${isSelected ? 'selected' : ''}" 
            data-path="${pathString}" 
            draggable="true" 
            style="padding-left: ${8 + indent}px;"
        >
            <div class="layer-toggle-btn" style="width:16px; height:16px; display:flex; align-items:center; justify-content:center; cursor:pointer; margin-right:4px;">
                ${isGroup ? `<i data-lucide="${chevron}" style="width:12px; height:12px;"></i>` : ''}
            </div>
            <i data-lucide="${icon}" style="width:12px; height:12px; margin-right:6px; opacity:0.7;"></i>
            <span class="inspector-item-title" contenteditable="true">${title}</span>
            <div class="layer-actions">
                <button class="icon-btn layer-action-btn" data-action="toggle-lock" title="${obj.lockMovementX ? 'Unlock' : 'Lock'}"><i data-lucide="${obj.lockMovementX ? 'lock' : 'unlock'}" style="width:12px; height:12px;"></i></button>
                <button class="icon-btn layer-action-btn" data-action="toggle-visibility" title="${obj.visible === false ? 'Show' : 'Hide'}"><i data-lucide="${obj.visible === false ? 'eye-off' : 'eye'}" style="width:12px; height:12px;"></i></button>
            </div>
        </li>
    `;

    if (isGroup && isExpanded) {
        const children = [...obj._objects].reverse();
        children.forEach((child, i) => {
            const originalIdx = obj._objects.length - 1 - i;
            const childPath = `${pathString}-${originalIdx}`;
            html += renderLayerItem(child, childPath, false, depth + 1, expandedGroups);
        });
    }
    return html;
}

function getLayerListHTML(objects, expandedGroups) {
    if (!objects || objects.length === 0) return `<div class="empty-state-figma">Canvas is empty.</div>`;
    const reversedObjects = [...objects].reverse();
    const listItems = reversedObjects.map((obj, i) => {
        const originalIndex = objects.length - 1 - i;
        const pathString = `${originalIndex}`;
        const isSelected = obj.activeOnCanvas || (obj.canvas && obj.canvas.getActiveObject() === obj);
        return renderLayerItem(obj, pathString, isSelected, 0, expandedGroups);
    }).join('');
    return `<div id="layer-list-scroll" class="layer-list-panel"><ul class="layer-list-tree">${listItems}</ul></div>`;
}

// --- PANELS ---
function getShortcutsPanelHTML() {
    let html = `<div class="figma-inspector-content shortcuts-panel">`;
    KEYBOARD_SHORTCUTS.forEach(section => {
        html += renderSectionHeader(section.label);
        section.items.forEach(item => {
            const keysHtml = item.keys.map(k => `<span class="kbd-key">${k}</span>`).join('');
            html += `<div class="shortcut-row"><span class="shortcut-name">${item.name}</span><div class="shortcut-keys">${keysHtml}</div></div>`;
        });
        html += `<div class="inspector-divider"></div>`;
    });
    html += `</div>`;
    return html;
}

function getAssetPanelHTML() {
    let html = `<div class="figma-assets-panel">`;
    Object.keys(CATEGORIZED_SHAPES).forEach(cat => {
        html += renderSectionHeader(cat);
        html += `<div class="asset-grid">`;
        CATEGORIZED_SHAPES[cat].forEach(asset => {
            const isSticky = cat === 'Stickies';
            const style = isSticky ? `background-color: ${asset.color}; box-shadow: 0 1px 3px rgba(0,0,0,0.1);` : `border: 1px solid var(--border-color); background: var(--control-background-color);`;
            html += `<div class="asset-item ${isSticky ? 'sticky' : ''}" data-name="${asset.name}" data-type="${asset.type}" style="${style}">${!isSticky ? `<i data-lucide="${asset.icon}" style="color:var(--peak-secondary)"></i>` : ''}${isSticky ? '' : `<span class="asset-label">${asset.rectProps.text || asset.name}</span>`}</div>`;
        });
        html += `</div>`;
    });
    html += `</div>`;
    return html;
}

function getInspectorHeader(activeMode) {
    return `<div class="figma-tabs">
        <div class="figma-tab ${activeMode === 'design' ? 'active' : ''}" data-mode="design">Design</div>
        <div class="figma-tab ${activeMode === 'assets' ? 'active' : ''}" data-mode="assets">Assets</div>
        <div class="figma-tab ${activeMode === 'layers' ? 'active' : ''}" data-mode="layers">Layers</div>
        <div class="figma-tab ${activeMode === 'shortcuts' ? 'active' : ''}" data-mode="shortcuts">Help</div>
    </div>`;
}

// --- MAIN UPDATE ---
function updateInspector(objects, container, mode = 'design', engine = null, expandedGroups = new Set()) {
    let targetMode = mode;
    if (objects.length > 0 && (mode === 'assets' || mode === 'shortcuts')) {
        targetMode = 'design';
    }

    let html = getInspectorHeader(targetMode);
    
    if (targetMode === 'assets') html += getAssetPanelHTML();
    else if (targetMode === 'shortcuts') html += getShortcutsPanelHTML();
    else if (targetMode === 'layers') {
        const targetEngine = engine || container.engine;
        const canvasObjects = targetEngine ? targetEngine.canvas.getObjects() : [];
        html += getLayerListHTML(canvasObjects, expandedGroups);
    } else {
        if (objects.length === 0) html += `<div class="empty-state-figma">Select an object to edit properties.</div>`;
        else if (objects.length === 1) html += getSingleObjectHTML(objects[0]);
        else html += getMultiObjectHTML(objects);
    }
    container.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

// (Re-export other sections for completeness if needed by other modules)
function renderAlignmentSection() { return `<div class="inspector-row alignment-row"><button class="icon-btn" data-action="align-left"><i data-lucide="${ICONS.alignLeft}"></i></button><button class="icon-btn" data-action="align-center"><i data-lucide="${ICONS.alignCenter}"></i></button><button class="icon-btn" data-action="align-right"><i data-lucide="${ICONS.alignRight}"></i></button><button class="icon-btn" data-action="align-top"><i data-lucide="${ICONS.alignTop}"></i></button><button class="icon-btn" data-action="align-middle"><i data-lucide="${ICONS.alignMiddle}"></i></button><button class="icon-btn" data-action="align-bottom"><i data-lucide="${ICONS.alignBottom}"></i></button></div><div class="inspector-divider"></div>`; }
function getSingleObjectHTML(obj) { const groupBtn = obj.type === 'group' ? `<div class="inspector-row"><button class="export-btn" id="btn-ungroup-object">Ungroup</button></div><div class="inspector-divider"></div>` : ''; return `<div class="figma-inspector-content">${renderAlignmentSection()}${groupBtn}${renderTransformSection(obj)}${renderLayerSection(obj)}${renderTextSection(obj)}${renderFillStrokeSection(obj)}${renderSectionHeader('Export')}<div class="inspector-row"><button class="export-btn" id="btn-copy-png">Export PNG</button></div></div>`; }
function getMultiObjectHTML(objects) { return `<div class="figma-inspector-content">${renderAlignmentSection()}<div class="multi-select-label">${objects.length} objects selected</div><div class="inspector-divider"></div>${renderSectionHeader('Actions')}<div class="inspector-row"><button class="export-btn" id="btn-group-object">Group Selection</button></div></div>`; }
function renderTransformSection(obj) { return `<div class="inspector-row grid-2">${renderInput('X', Math.round(obj.left), 'left')}${renderInput('Y', Math.round(obj.top), 'top')}</div><div class="inspector-row grid-2">${renderInput('W', Math.round(obj.getScaledWidth()), 'width')}${renderInput('H', Math.round(obj.getScaledHeight()), 'height')}</div><div class="inspector-row grid-2">${renderInput('R', Math.round(obj.angle), 'angle', 'number', { icon: 'rotate-cw' })}${renderInput('CR', obj.rx || 0, 'rx', 'number', { icon: 'corner-up-left' })}</div><div class="inspector-divider"></div>`; }
function renderLayerSection(obj) { return `${renderSectionHeader('Layer')}<div class="inspector-row">${renderInput('Op', Math.round(obj.opacity * 100), 'opacity', 'number', { icon: 'droplet' })}<div class="figma-select-wrapper"><select class="figma-select" disabled><option>Pass Through</option></select></div></div><div class="inspector-divider"></div>`; }
function renderFillStrokeSection(obj) { const isText = obj.isType('i-text'); let html = ''; if (!isText) { html += renderSectionHeader('Fill'); html += renderColorRow('Fill', 'fill', obj.fill); html += `<div class="inspector-divider"></div>`; } html += renderSectionHeader(isText ? 'Color' : 'Stroke'); html += renderColorRow('Stroke', 'stroke', obj.stroke || obj.fill); if (!isText) { html += `<div class="inspector-row" style="margin-top: 8px;">${renderInput('W', obj.strokeWidth, 'strokeWidth', 'number', { icon: 'minus' })}<div class="figma-select-wrapper"><select class="figma-select" data-prop="strokeDashArray"><option value="" ${!obj.strokeDashArray ? 'selected' : ''}>Solid</option><option value="5,5" ${obj.strokeDashArray ? 'selected' : ''}>Dashed</option></select></div></div>`; } html += `<div class="inspector-divider"></div>`; return html; }
function renderTextSection(obj) { if (!obj.isType('i-text')) return ''; return `${renderSectionHeader('Text')}<div class="inspector-row"><div class="figma-select-wrapper full"><select class="figma-select" data-prop="fontFamily"><option value="Inter, sans-serif" ${obj.fontFamily.includes('Inter') ? 'selected' : ''}>Inter</option><option value="Arial, sans-serif" ${obj.fontFamily.includes('Arial') ? 'selected' : ''}>Arial</option><option value="Times New Roman, serif" ${obj.fontFamily.includes('Times') ? 'selected' : ''}>Times New Roman</option><option value="Courier New, monospace" ${obj.fontFamily.includes('Courier') ? 'selected' : ''}>Courier New</option></select></div></div><div class="inspector-row grid-2"><div class="figma-select-wrapper"><select class="figma-select" data-prop="fontWeight"><option value="normal" ${obj.fontWeight === 'normal' ? 'selected' : ''}>Regular</option><option value="bold" ${obj.fontWeight === 'bold' ? 'selected' : ''}>Bold</option></select></div>${renderInput('Size', obj.fontSize, 'fontSize')}</div><div class="inspector-divider"></div>`; }

module.exports = { updateInspector };