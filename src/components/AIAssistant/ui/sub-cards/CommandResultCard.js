
function renderCommandResultCard(cmd, output, success = true) {
    const statusIcon = success ? '✓' : '✗';
    // Clean up output
    const cleanOutput = output ? output.trim() : 'No output';
    // Determine status text for the new card structure
    const status = success ? 'Success' : 'Failed';
    const statusColor = success ? 'var(--christmas-green)' : 'var(--christmas-red)';

    return `
    < div class="file-edit-card-compact command-result-card" style = "border-left: 3px solid var(--peak-accent); padding-left: 8px;" >
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="terminal" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">Execution Result: ${status}</span>
                <span class="file-meta-compact" style="margin-left:auto; color:${statusColor};">${statusIcon} ${status}</span>
                
                <button class="toggle-code-btn-compact" title="Toggle Output" style="margin-left: 8px;">
                     <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>
                <button class="copy-btn-compact" title="Copy Output" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(cleanOutput)}'))" style="margin-left: 4px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                    <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
            </div>
            
            <div class="file-code-collapsed" style="display:none;">
                <pre class="file-code-block"><code>${cleanOutput}</code></pre>
            </div>
        </div >
    `;
}

module.exports = { renderCommandResultCard };
