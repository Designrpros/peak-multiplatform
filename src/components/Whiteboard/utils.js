// src/components/Whiteboard/utils.js

const DEFAULT_STROKE = '#6688AA';
const DEFAULT_WIDTH = 5;

const TOOL_MODES = {
    SELECT: 'select',
    DRAW: 'draw',
    RECTANGLE: 'rectangle',
    CIRCLE: 'circle',
    LINE: 'line',
    ARROW: 'arrow',
    TEXT: 'text',
    ERASER: 'eraser',
    IMAGE: 'image', // NEW
};

const CURSORS = {
    SELECT: 'default',
    DRAW: 'crosshair',
    RECTANGLE: 'crosshair',
    CIRCLE: 'crosshair',
    LINE: 'crosshair',
    ARROW: 'crosshair',
    TEXT: 'text',
    ERASER: 'crosshair',
    IMAGE: 'copy', // Use copy cursor to indicate placing a copy
    PANNING: 'grabbing'
};

module.exports = {
    DEFAULT_STROKE,
    DEFAULT_WIDTH,
    TOOL_MODES,
    CURSORS
};