
function renderGenericToolCard(toolName, args, serverId) {
    const argsString = JSON.stringify(args, null, 2);
    const encodedArgs = encodeURIComponent(JSON.stringify(args));
    const displayArgs = argsString.length > 50 ? argsString.substring(0, 50) + '...' : argsString;

    return `
        <div class="file-edit-card-compact tool-card-compact" style="width: 100%; box-sizing: border-box; border-left: 3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="box" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="file-path-compact">${toolName}</span>
                <span class="file-meta-compact" style="font-family:monospace; color:var(--peak-secondary); font-size:10px; margin-left:auto;">${serverId}</span>
                
                <button class="toggle-code-btn-compact" title="Toggle Arguments" style="margin-left: 8px;">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>
                <button class="copy-btn-compact" title="Copy Arguments" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodedArgs}'))" style="margin-left: 4px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                    <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
            </div>
            
            <div class="file-code-collapsed" style="display:none;">
                <pre><code class="language-json">${argsString}</code></pre>
            </div>
        </div>
    `;
}

module.exports = { renderGenericToolCard };
