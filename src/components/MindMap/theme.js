// src/components/MindMap/theme.js

const BRANCH_PALETTE = [
    '#FF6B6B', // Red/Coral
    '#4ECDC4', // Teal
    '#FFE66D', // Yellow
    '#FF9F43', // Orange
    '#54A0FF', // Blue
    '#5F27CD', // Purple
    '#FF9FF3', // Pink
    '#00D2D3'  // Cyan
];

/**
 * Determines the color of a node based on its branch.
 * 1. Root is always neutral (e.g., White/Gray).
 * 2. Level 1 nodes pick a color from the palette based on their index.
 * 3. Level 2+ nodes inherit their parent's color.
 */
function getNodeColor(node, allNodes) {
    if (node.level === 0) return '#FFFFFF'; // Root is white
    
    // If Level 1, pick based on index among siblings
    if (node.level === 1) {
        // Find index among Level 1 nodes
        const level1Nodes = allNodes.filter(n => n.level === 1);
        const index = level1Nodes.findIndex(n => n.id === node.id);
        return BRANCH_PALETTE[index % BRANCH_PALETTE.length];
    }

    // If Level 2+, recurse up to find the Level 1 ancestor
    let current = node;
    while (current.parentId && current.level > 1) {
        const parent = allNodes.find(n => n.id === current.parentId);
        if (!parent) return '#CCCCCC'; // Fallback
        current = parent;
    }
    
    // Now current is Level 1, get its color
    return getNodeColor(current, allNodes);
}

module.exports = { getNodeColor, BRANCH_PALETTE };