// src/components/MindMap/geometry.js

/**
 * Calculates the path for a smooth Bezier curve between two nodes.
 * Connects the closest edges of the nodes (Border-to-Border).
 */
function calculateConnectionPath(parent, child) {
    // Dimensions (Fallbacks to avoid NaN)
    const pW = parent.width || 100;
    const pH = parent.height || 40;
    const cW = child.width || 100;
    const cH = child.height || 40;

    // Center Coordinates
    const pCx = parent.x;
    const pCy = parent.y;
    const cCx = child.x;
    const cCy = child.y;

    let startX, startY, endX, endY;

    // Determine orientation
    // 1. Child is to the RIGHT
    if (cCx > pCx + (pW / 2)) {
        startX = pCx + (pW / 2); // Right edge of parent
        endX = cCx - (cW / 2);   // Left edge of child
        startY = pCy;
        endY = cCy;
    }
    // 2. Child is to the LEFT
    else if (cCx < pCx - (pW / 2)) {
        startX = pCx - (pW / 2); // Left edge of parent
        endX = cCx + (cW / 2);   // Right edge of child
        startY = pCy;
        endY = cCy;
    }
    // 3. Vertical Fallback (Rare in this layout, but good for robustness)
    else {
        startX = pCx;
        endX = cCx;
        if (cCy > pCy) { // Below
            startY = pCy + (pH / 2);
            endY = cCy - (cH / 2);
        } else { // Above
            startY = pCy - (pH / 2);
            endY = cCy + (cH / 2);
        }
        // Vertical Curve
        const cp1y = startY + (endY - startY) / 2;
        const cp2y = endY - (endY - startY) / 2;
        return `M ${startX} ${startY} C ${startX} ${cp1y}, ${endX} ${cp2y}, ${endX} ${endY}`;
    }

    // Horizontal S-Curve (MindNode Style)
    const dist = Math.abs(endX - startX);
    const tension = 0.6; // Controls how "tight" the curve is

    // Control Points: Pull out horizontally from the start/end points
    const cp1x = startX + (dist * tension * (endX > startX ? 1 : -1));
    const cp1y = startY;
    const cp2x = endX - (dist * tension * (endX > startX ? 1 : -1));
    const cp2y = endY;

    return `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
}

module.exports = { calculateConnectionPath };