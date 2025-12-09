
function renderCommandResultCard(cmd, output, success = true) {
    const statusIcon = success ? '✓' : '✗';
    const statusColor = success ? 'var(--christmas-green)' : 'var(--christmas-red)';

    // Clean up output
    const cleanOutput = output ? output.trim() : 'No output';
    const hasOutput = cleanOutput.length > 0 && cleanOutput !== 'No output';

    return `
        <div class="tool-card-compact command-result-card" style="border-left:3px solid ${statusColor};">
            <div class="tool-line" style="align-items:flex-start;">
                <div style="display:flex; align-items:center; gap:6px; flex:1;">
                    <i data-lucide="terminal" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                    <span class="tool-label-compact">Command Executed</span>
                    <div style="flex:1; min-width:0;">
                        <code class="tool-content-compact" style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${cmd}</code>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px; margin-left:8px;">
                        <span style="font-size:10px; color:${statusColor};">${statusIcon}</span>
                        <span style="font-size:8px; color:var(--peak-secondary);">${success ? 'Success' : 'Failed'}</span>
                    </div>
                </div>
            </div>
            ${hasOutput ? `
                <div class="command-output-block" style="margin-top:8px; margin-left:-12px; margin-right:-12px; margin-bottom:-8px; padding:12px; background:#1e1e1e; border-top:1px solid var(--border-color); border-radius:0 0 4px 4px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <span style="font-size:9px; color:#a0a0a0; font-weight:600; letter-spacing:0.5px;">TERMINAL OUTPUT</span>
                        <button class="toggle-output-btn" style="padding:4px 8px; font-size:9px; border:1px solid #333; background:#2d2d2d; border-radius:3px; cursor:pointer; color:#ccc; display:flex; align-items:center; gap:4px;">
                            <i data-lucide="chevron-up" style="width:10px; height:10px;"></i>
                            Collapse
                        </button>
                    </div>
                    <pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-family:'Menlo', 'Monaco', 'Courier New', monospace; font-size:10px; line-height:1.5; color:#e0e0e0; max-height:300px; overflow-y:auto; padding:4px 0; width:100%; box-sizing:border-box;">${cleanOutput.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>
            ` : ''}
        </div>
    `;
}

module.exports = { renderCommandResultCard };
