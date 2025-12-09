
function renderCommandCard(cmd, output = null, isIncomplete = false) {
    const hasOutput = output && output.trim().length > 0;

    // Truncate command for display
    const displayCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;

    return `
        <div class="file-edit-card-compact command-card ${isIncomplete ? 'incomplete' : ''}" data-tool-name="run_command" style="border-left: 3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="terminal" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">Command</span>
                <code class="file-meta-compact" style="font-family:monospace; color:var(--peak-primary); margin-left:auto; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width: 60%;">${displayCmd}</code>
                
                <button class="toggle-code-btn-compact" title="Toggle Full Command" style="margin-left: 8px;">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>
                <button class="copy-btn-compact" title="Copy Command" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(cmd)}'))" style="margin-left: 4px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                     <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
            </div>
            
            <div class="file-code-collapsed" style="display:none;">
                <pre><code class="language-bash">${cmd}</code></pre>
                ${hasOutput ? `
                <div class="command-output-compact" style="margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color);">
                    <div style="font-size:10px; font-weight:600; margin-bottom:4px; color:var(--peak-secondary);">Output:</div>
                    <pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-size:10px; color:var(--peak-secondary);">${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>
                ` : ''}
            </div>
        </div>
    `;
}

module.exports = { renderCommandCard };
