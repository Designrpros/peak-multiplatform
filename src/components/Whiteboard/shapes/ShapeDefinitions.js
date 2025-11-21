// src/components/Whiteboard/shapes/ShapeDefinitions.js

// FigJam-inspired Palette
const PALETTE = {
    red: { fill: '#FFC7C2', stroke: '#F24822' },
    orange: { fill: '#FCD19C', stroke: '#FF8800' },
    yellow: { fill: '#FFF0C0', stroke: '#FFC700' },
    green: { fill: '#AFF4C6', stroke: '#14AE5C' },
    blue: { fill: '#BDE3FF', stroke: '#0091FF' },
    purple: { fill: '#E4CCFF', stroke: '#9747FF' },
    gray: { fill: '#F3F3F3', stroke: '#888888' },
    white: { fill: '#FFFFFF', stroke: '#E6E6E6' },
    slate: { fill: '#1E1E1E', stroke: '#000000' } // For dark UI elements
};

const CATEGORIZED_SHAPES = {
    'Stickies': [
        { name: 'sticky-yellow', icon: 'sticky-note', color: PALETTE.yellow.fill, type: 'shape', text: "Idea...", 
            rectProps: { width: 160, height: 160, fill: PALETTE.yellow.fill, stroke: 'transparent', rx: 0, ry: 0, shadow: { color: 'rgba(0,0,0,0.1)', blur: 4, offsetX: 0, offsetY: 2 } } },
        { name: 'sticky-red', icon: 'sticky-note', color: PALETTE.red.fill, type: 'shape', text: "Urgent", 
            rectProps: { width: 160, height: 160, fill: PALETTE.red.fill, stroke: 'transparent', rx: 0, ry: 0, shadow: { color: 'rgba(0,0,0,0.1)', blur: 4, offsetX: 0, offsetY: 2 } } },
        { name: 'sticky-blue', icon: 'sticky-note', color: PALETTE.blue.fill, type: 'shape', text: "Task", 
            rectProps: { width: 160, height: 160, fill: PALETTE.blue.fill, stroke: 'transparent', rx: 0, ry: 0, shadow: { color: 'rgba(0,0,0,0.1)', blur: 4, offsetX: 0, offsetY: 2 } } },
        { name: 'sticky-green', icon: 'sticky-note', color: PALETTE.green.fill, type: 'shape', text: "Done", 
            rectProps: { width: 160, height: 160, fill: PALETTE.green.fill, stroke: 'transparent', rx: 0, ry: 0, shadow: { color: 'rgba(0,0,0,0.1)', blur: 4, offsetX: 0, offsetY: 2 } } },
    ],
    'Shapes': [
        { name: 'square-outline', icon: 'square', color: '#333', type: 'shape', text: "", 
            rectProps: { width: 100, height: 100, fill: 'transparent', stroke: '#333333', strokeWidth: 2, rx: 4, ry: 4 } },
        { name: 'circle-outline', icon: 'circle', color: '#333', type: 'shape', text: "", 
            rectProps: { width: 100, height: 100, fill: 'transparent', stroke: '#333333', strokeWidth: 2, isCircle: true } },
        { name: 'rounded-rect', icon: 'square', color: '#333', type: 'shape', text: "Label", 
            rectProps: { width: 120, height: 60, fill: '#FFFFFF', stroke: '#333333', strokeWidth: 2, rx: 30, ry: 30 } },
        { name: 'diamond', icon: 'diamond', color: '#333', type: 'shape', text: "Decision", 
            rectProps: { width: 100, height: 100, fill: '#FFFFFF', stroke: '#333333', strokeWidth: 2, angle: 45, rx: 2, ry: 2 } },
    ],
    'Components': [
        { name: 'button-primary', icon: 'mouse-pointer-2', color: PALETTE.blue.stroke, type: 'shape', text: "Button", 
            rectProps: { width: 100, height: 36, fill: PALETTE.blue.stroke, stroke: 'transparent', rx: 6, ry: 6, shadow: { color: 'rgba(0,0,0,0.15)', blur: 2, offsetX: 0, offsetY: 1 } } },
        { name: 'card', icon: 'layout', color: '#FFF', type: 'shape', text: "Card Title\nSubtitle", 
            rectProps: { width: 200, height: 120, fill: '#FFFFFF', stroke: '#E6E6E6', strokeWidth: 1, rx: 8, ry: 8, shadow: { color: 'rgba(0,0,0,0.05)', blur: 8, offsetX: 0, offsetY: 4 } } },
        { name: 'input-field', icon: 'text-cursor', color: '#FFF', type: 'shape', text: "Input...", 
            rectProps: { width: 180, height: 40, fill: '#FFFFFF', stroke: '#CCCCCC', strokeWidth: 1, rx: 4, ry: 4 } },
    ],
    'Sections': [
         { name: 'section-gray', icon: 'maximize', color: PALETTE.gray.fill, type: 'shape', text: "Section", 
            rectProps: { width: 300, height: 300, fill: 'transparent', stroke: '#CCCCCC', strokeWidth: 2, dashArray: [8, 8], rx: 8, ry: 8 } },
    ]
};

const NOTE_ASSETS = [
    { name: 'h1', icon: 'heading-1', text: "Heading 1", type: 'text-block', fontSize: 32, fontWeight: '700' },
    { name: 'h2', icon: 'heading-2', text: "Heading 2", type: 'text-block', fontSize: 24, fontWeight: '600' },
    { name: 'paragraph', icon: 'pilcrow', text: "Type something...", type: 'text-block', fontSize: 16, fontWeight: '400' },
    { name: 'code', icon: 'code', text: "const code = true;", type: 'text-block', fontSize: 14, fontFamily: 'monospace', fill: '#E04F5F' },
];

module.exports = {
    CATEGORIZED_SHAPES,
    NOTE_ASSETS
};