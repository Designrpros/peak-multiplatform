// src/components/Whiteboard/InspectorUtils.js

/**
 * Generates an SVG string for Fabric.js by using the DOM-based Lucide rendering.
 * @param {string} iconName 
 * @param {string} color 
 * @returns {string | null} SVG markup string.
 */
function getSvgString(iconName, color) {
    const lucide = window.lucide;
    
    if (!lucide || !lucide.createIcons) {
        console.error("window.lucide not fully loaded.");
        return null;
    }
    
    // Create a temporary element, call createIcons(), and extract the generated SVG.
    const tempContainer = document.createElement('div');
    // We use the Lucide data-lucide attribute on an <i> tag for rendering
    tempContainer.innerHTML = `<i data-lucide="${iconName}" style="color: ${color || '#007AFF'}; width: 100px; height: 100px;"></i>`;

    // Tell Lucide to find and convert the <i> tag inside our temporary container
    lucide.createIcons({
        container: tempContainer 
    });
    
    const svgElement = tempContainer.querySelector('svg');
    
    if (!svgElement) {
        console.error(`Lucide failed to render SVG for icon: ${iconName}`);
        return null;
    }
    
    // Return the SVG element's outerHTML string for Fabric.js to load
    return svgElement.outerHTML;
}

/** Color Conversion Helpers **/

function componentToHex(c) {
    const hex = c.toString(16);
    return hex.length === 1 ? "0" + hex : hex;
}

function rgbToHex(r, g, b) {
    return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
}

function colorToHex(color) {
    if (typeof color !== 'string') return '#000000';
    if (color.startsWith('#')) return color;
    
    const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (rgbMatch) {
        return rgbToHex(parseInt(rgbMatch[1]), parseInt(rgbMatch[2]), parseInt(rgbMatch[3]));
    }
    
    // Fallback for names like 'transparent'
    return '#000000'; 
}


module.exports = {
    getSvgString,
    colorToHex
};