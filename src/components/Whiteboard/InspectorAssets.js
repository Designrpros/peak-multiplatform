// src/components/Whiteboard/InspectorAssets.js
const Fabric = require('fabric');
const { CATEGORIZED_SHAPES, NOTE_ASSETS } = require('./shapes/ShapeDefinitions');
const { getSvgString } = require('./InspectorUtils');

// Flatten assets for easy lookup
const ALL_ASSETS = [...NOTE_ASSETS];
Object.values(CATEGORIZED_SHAPES).forEach(list => ALL_ASSETS.push(...list));

function insertAsset(engine, name, type, overrideContent = {}) {
    if (!engine) return;
    const canvas = engine.canvas;
    
    const assetData = ALL_ASSETS.find(a => a.name === name);
    
    if (!assetData && type !== 'icon') {
        console.warn(`Asset not found: ${name}`);
        return;
    }

    const center = canvas.getCenter();
    const vpt = canvas.viewportTransform;
    const x = (center.left - vpt[4]) / vpt[0];
    const y = (center.top - vpt[5]) / vpt[3];

    // 3. TEXT BLOCKS
    if (type === 'text-block') {
        const textObj = new Fabric.IText(overrideContent.text || assetData.text || 'Text', {
            left: x, top: y,
            fontFamily: assetData.fontFamily || 'Inter, sans-serif',
            fontSize: assetData.fontSize || 16,
            fontWeight: assetData.fontWeight || 'normal',
            fill: assetData.fill || '#333333',
            originX: 'center', originY: 'center',
            textAlign: 'left'
        });
        canvas.add(textObj);
        canvas.setActiveObject(textObj);
        textObj.enterEditing();
    } 
    // 4. SHAPES & STICKIES
    else if (type === 'shape') {
        const props = assetData.rectProps;
        let shape;

        if (props.isCircle) {
            shape = new Fabric.Circle({
                radius: props.width / 2,
                left: 0, top: 0,
                fill: props.fill,
                stroke: props.stroke,
                strokeWidth: props.strokeWidth || 0,
                originX: 'center', originY: 'center'
            });
        } else {
            shape = new Fabric.Rect({
                width: props.width, height: props.height,
                left: 0, top: 0,
                fill: props.fill,
                stroke: props.stroke,
                strokeWidth: props.strokeWidth || 0,
                rx: props.rx || 0, ry: props.ry || 0,
                strokeDashArray: props.dashArray || null,
                originX: 'center', originY: 'center'
            });
        }
        
        if (props.shadow) {
            shape.set('shadow', new Fabric.Shadow(props.shadow));
        }

        // If sticky/text group
        if (assetData.text) {
            const textObj = new Fabric.IText(assetData.text, {
                fontSize: 16,
                fontFamily: 'Inter, sans-serif',
                fill: props.fill === '#333333' || props.fill === '#000000' ? '#FFFFFF' : '#333333',
                originX: 'center', originY: 'center',
                textAlign: 'center',
                width: props.width - 20,
                splitByGrapheme: true
            });

            // CRITICAL: subTargetCheck is FALSE so we select the whole sticky by default.
            // interactive is TRUE so we can edit the text when we deep-select.
            const group = new Fabric.Group([shape, textObj], {
                left: x, top: y,
                originX: 'center', originY: 'center',
                subTargetCheck: false, 
                interactive: true      
            });
            
            canvas.add(group);
            canvas.setActiveObject(group);
        } else {
            shape.set({ left: x, top: y });
            canvas.add(shape);
            canvas.setActiveObject(shape);
        }
    }

    canvas.requestRenderAll();
    engine.debouncedSave();
}

module.exports = {
    CATEGORIZED_SHAPES,
    NOTE_ASSETS,
    insertAsset
};