
function renderTerminalCard(cmd, output, success = true) {
    const statusIcon = success ? '✓' : '✗';
    const statusColor = success ? 'var(--christmas-green)' : 'var(--christmas-red)';

    // Clean up output
    const cleanOutput = output ? output.trim() : 'No output';

    return `
        <div class="file-edit-card-compact terminal-card" style="border-left:3px solid var(--peak-accent); padding-left: 8px; background:#1e1e1e;">
            <div class="tool-line" style="align-items:center; padding:8px; border-bottom:1px solid #333; display: flex; gap: 8px;">
                <i data-lucide="terminal" style="width:12px; height:12px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span style="font-size:11px; font-weight:600; color:#e0e0e0;">Terminal</span>
                <div style="flex:1; overflow:hidden;">
                    <code style="font-family:monospace; font-size:10px; color:#a0a0a0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:block;">${cmd}</code>
                </div>
                <div style="display:flex; align-items:center; gap:6px;">
                    <span style="font-size:10px; color:${statusColor};">${statusIcon}</span>
                    <button class="toggle-terminal-btn" style="background:none; border:none; color:#a0a0a0; cursor:pointer; padding:4px; display:flex; align-items:center;">
                        <i data-lucide="chevron-down" style="width:12px; height:12px;"></i>
                    </button>
                    <button class="copy-btn-compact" title="Copy Output" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(cleanOutput)}'))" style="margin-left: 4px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                        <i data-lucide="copy" style="width:9px; height:9px;"></i>
                    </button>
                </div>
            </div>
            <div class="terminal-output-block" style="padding:12px; display:block;">
                <pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-family:'Menlo', 'Monaco', 'Courier New', monospace; font-size:11px; line-height:1.5; color:#e0e0e0; max-height:400px; overflow-y:auto;">${cleanOutput.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
            </div>
        </div>
    `;
}

module.exports = { renderTerminalCard };
