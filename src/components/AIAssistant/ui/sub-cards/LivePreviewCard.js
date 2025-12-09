/**
 * LivePreviewCard.js
 * 
 * Renders an embedded Electron <webview> for live application preview.
 */

function renderLivePreviewCard(url = 'http://localhost:3000') {
    // Generate a unique ID for the webview to avoid collisions if multiple are rendered
    const viewId = 'webview-' + Date.now() + Math.random().toString(36).substr(2, 5);

    return `
        <div class="live-preview-card" style="
            width: 100%;
            box-sizing: border-box;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            background: var(--card-background);
            margin: 8px 0;
            display: flex;
            flex-direction: column;
        ">
            <!-- Toolbar -->
            <div style="
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 6px 12px;
                border-bottom: 1px solid var(--border-color);
                background: var(--background-subtle);
            ">
                <div style="
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    color: var(--peak-secondary);
                    font-size: 11px;
                ">
                    <i data-lucide="globe" style="width: 12px; height: 12px;"></i>
                    <span style="font-family: monospace;">${url}</span>
                </div>
                
                <div style="flex: 1;"></div>
                
                <button onclick="document.getElementById('${viewId}').reload()" title="Refresh" style="
                    background: none;
                    border: none;
                    color: var(--peak-secondary);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    border-radius: 4px;
                " onmouseover="this.style.background='var(--control-background-color)'" onmouseout="this.style.background='none'">
                    <i data-lucide="rotate-cw" style="width: 12px; height: 12px;"></i>
                </button>
                
                <button onclick="require('electron').shell.openExternal('${url}')" title="Open in Browser" style="
                    background: none;
                    border: none;
                    color: var(--peak-secondary);
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    border-radius: 4px;
                " onmouseover="this.style.background='var(--control-background-color)'" onmouseout="this.style.background='none'">
                    <i data-lucide="external-link" style="width: 12px; height: 12px;"></i>
                </button>
            </div>

            <!-- Webview Container -->
            <div style="height: 350px; position: relative; background: white;">
                <webview 
                    id="${viewId}" 
                    src="${url}" 
                    style="width: 100%; height: 100%; display: flex;"
                    partition="persist:live-preview"
                ></webview>
            </div>
        </div>
    `;
}

module.exports = { renderLivePreviewCard };
