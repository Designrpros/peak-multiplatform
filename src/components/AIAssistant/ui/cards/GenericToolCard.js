
function renderGenericToolCard(toolName, args, serverId) {
    const argsString = JSON.stringify(args, null, 2);
    const encodedArgs = encodeURIComponent(JSON.stringify(args));
    const displayArgs = argsString.length > 50 ? argsString.substring(0, 50) + '...' : argsString;

    return `
        <div class="file-edit-card-compact tool-card-compact">
            <div class="file-edit-line">
                <i data-lucide="box" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="file-path-compact">${toolName}</span>
                <span class="file-meta-compact" style="font-family:monospace; color:var(--peak-secondary); font-size:10px;">${serverId}</span>
                
                <button class="toggle-code-btn-compact" title="Toggle Arguments">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>

                <div style="display:flex; gap:4px; margin-left:auto;">
                    <button class="file-action-btn-compact reject-btn" data-type="reject" style="background:rgba(220,38,38,0.1); color:#dc2626; border:1px solid rgba(220,38,38,0.2);">
                        <i data-lucide="x" style="width:9px; height:9px;"></i>
                        Reject
                    </button>
                    <button class="file-action-btn-compact tool-run-btn" 
                        data-tool="${toolName}" 
                        data-server-id="${serverId}" 
                        data-args="${encodedArgs}">
                        <i data-lucide="play" style="width:9px; height:9px;"></i>
                        Run
                    </button>
                </div>
            </div>
            
            <div class="file-code-collapsed" style="display:none;">
                <pre><code class="language-json">${argsString}</code></pre>
            </div>
        </div>
    `;
}

module.exports = { renderGenericToolCard };
