// src/components/Whiteboard/tools/ImageTool.js
const { ipcRenderer } = require('electron');
const Fabric = require('fabric'); 
const path = require('path'); 
const { TOOL_MODES } = require('../utils');

class ImageTool {
    constructor(engine) {
        this.engine = engine;
        this.canvas = engine.canvas;
        this.handleMouseDown = this.handleMouseDown.bind(this);
        
        // Expose the load function to the instance for the global listener
        this.loadAndPlaceImage = this.loadAndPlaceImage.bind(this); 
    }
    
    activate() {
        this.canvas.on('mouse:down', this.handleMouseDown);
    }

    deactivate() {
        this.canvas.off('mouse:down', this.handleMouseDown);
    }

    // Handles the Image Tool Button Click Flow
    async handleMouseDown(options) {
        if (this.engine.toolMode !== TOOL_MODES.IMAGE) return;

        const filePaths = await ipcRenderer.invoke('select-image');
        const filePath = filePaths ? filePaths[0] : null;

        if (filePath) {
            const pointer = this.canvas.getPointer(options.e);
            this.loadAndPlaceImage(filePath, pointer.x, pointer.y);
        }

        this.engine.setToolMode(TOOL_MODES.SELECT); 
    }
    
    // Shared logic for loading image from local file path
    async loadAndPlaceImage(filePath, x, y) {
        
        // 1. Get the file data (Buffer + MimeType) from the Main Process
        const fileData = await ipcRenderer.invoke('read-file-as-data-url', filePath);

        if (fileData && fileData.error) {
             console.error(`[ImageTool] IPC Error: ${fileData.error}`);
             alert(`Failed to load image: ${fileData.error}`);
             return;
        }
        
        const rawBufferData = fileData?.buffer?.data;
        
        if (!fileData || fileData.buffer?.type !== 'Buffer' || !Array.isArray(rawBufferData) || rawBufferData.length === 0) {
            console.error(`[ImageTool] Error: Empty data for ${filePath}`);
            return;
        }

        try {
            // 2. Create Blob from buffer
            const buffer = new Uint8Array(rawBufferData);
            const blob = new Blob([buffer], { type: fileData.mimeType });
            
            // 3. CRITICAL FIX: Convert Blob to Base64 Data URL
            // This ensures the image data is embedded in the object and persists 
            // across saves, reloads, and copy/paste operations.
            const reader = new FileReader();
            
            reader.onload = () => {
                const dataUrl = reader.result;
                
                // 4. Load into HTML Image to verify dimensions
                const htmlImage = new Image();
                htmlImage.onload = () => {
                    // 5. Create Fabric Object
                    const img = new Fabric.Image(htmlImage, {
                        left: x, 
                        top: y, 
                        originX: 'center', 
                        originY: 'center', 
                        selectable: true, 
                        hasControls: true, 
                        hasBorders: true
                    });

                    // Scale down if huge
                    let scaleFactor = 1;
                    const maxDimension = 300;
                    if (img.width > maxDimension || img.height > maxDimension) {
                        scaleFactor = Math.min(maxDimension / img.width, maxDimension / img.height);
                    }
                    img.set({ scaleX: scaleFactor, scaleY: scaleFactor });
                    
                    this.canvas.add(img);
                    this.canvas.setActiveObject(img);
                    this.canvas.renderAll();
                    this.engine.debouncedSave();
                    
                    console.log("[ImageTool] Image added successfully (Data URL).");
                };
                
                htmlImage.onerror = (err) => {
                    console.error("[ImageTool] HTML Image load failed:", err);
                };
                
                htmlImage.src = dataUrl;
            };
            
            reader.onerror = (err) => {
                console.error("[ImageTool] FileReader failed:", err);
            };
            
            reader.readAsDataURL(blob);

        } catch (e) {
            console.error(`[ImageTool] Error processing image:`, e);
        }
    }
}

// --- GLOBAL IPC LISTENER SETUP ---
let isDropListenerInitialized = false;
if (!isDropListenerInitialized) {
    ipcRenderer.on('dropped-whiteboard-file', (event, filePath, x, y) => {
        const activeEngine = window.activeWhiteboardEngine; 
        if (activeEngine) {
            const imageTool = activeEngine.toolManager.toolInstances[TOOL_MODES.IMAGE];
            if (imageTool && typeof imageTool.loadAndPlaceImage === 'function') {
                imageTool.loadAndPlaceImage(filePath, x, y);
                activeEngine.setToolMode(TOOL_MODES.SELECT);
            }
        }
    });
    isDropListenerInitialized = true;
}

module.exports = ImageTool;