
function renderCommandCard(cmd, output = null, isIncomplete = false) {
    const hasOutput = output && output.trim().length > 0;

    // Truncate command for display
    const displayCmd = cmd.length > 50 ? cmd.substring(0, 50) + '...' : cmd;

    return `
        <div class="file-edit-card-compact command-card ${isIncomplete ? 'incomplete' : ''}" data-tool-name="run_command">
            <div class="file-edit-line">
                <i data-lucide="terminal" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="file-path-compact">Command</span>
                <code class="file-meta-compact" style="font-family:monospace; color:var(--peak-primary);">${displayCmd}</code>
                
                <button class="toggle-code-btn-compact" title="Toggle Full Command">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>

                <div style="display:flex; gap:4px; margin-left:auto;">
                    <button class="file-action-btn-compact reject-btn" data-type="reject" data-cmd="${encodeURIComponent(cmd)}" style="background:rgba(220,38,38,0.1); color:#dc2626; border:1px solid rgba(220,38,38,0.2);" ${isIncomplete ? 'disabled' : ''}>
                        <i data-lucide="x" style="width:9px; height:9px;"></i>
                        Reject
                    </button>
                    <button class="file-action-btn-compact tool-run-btn" data-type="run_command" data-cmd="${encodeURIComponent(cmd)}" ${isIncomplete ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                        <i data-lucide="${isIncomplete ? 'loader-2' : 'play'}" style="width:9px; height:9px;" class="${isIncomplete ? 'spin' : ''}"></i>
                        ${isIncomplete ? 'Generating...' : 'Run'}
                    </button>
                </div>
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
