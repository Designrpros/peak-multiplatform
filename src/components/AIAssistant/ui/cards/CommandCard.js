
function renderCommandCard(cmd, output = null) {
    const hasOutput = output && output.trim().length > 0;
    const outputHtml = hasOutput ? `
        <div class="command-output-compact" style="display:none; margin-top:4px; padding:6px 8px; background:var(--header-background); border-radius:4px; font-family:monospace; font-size:8px; color:var(--peak-secondary); max-height:150px; overflow-y:auto; border-left:2px solid var(--border-color);">
            <pre style="margin:0; white-space:pre-wrap; word-break:break-all;">${output.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
        </div>
    ` : '';

    return `
        <div class="tool-card-compact">
            <div class="tool-line">
                <i data-lucide="terminal" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="tool-label-compact">Command</span>
                <code class="tool-content-compact">${cmd}</code>
                ${hasOutput ? `
                    <button class="tool-toggle-output-btn" style="padding:2px 6px; font-size:8px; border:1px solid var(--border-color); background:transparent; border-radius:3px; cursor:pointer; margin-left:8px; color:var(--peak-secondary);">
                        <i data-lucide="chevron-down" style="width:8px; height:8px;"></i>
                        Output
                    </button>
                ` : ''}
                <button class="tool-action-btn-compact tool-run-btn" data-cmd="${encodeURIComponent(cmd)}">
                    <i data-lucide="play" style="width:9px; height:9px;"></i>
                    Run
                </button>
            </div>
            ${outputHtml}
        </div>
    `;
}

module.exports = { renderCommandCard };
