
function renderViewFileCard(path) {
    // Generate unique execution ID for this button instance
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return `
        <div class="file-edit-card-compact" style="border-left: 3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="eye" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">View</span>
                <span class="file-meta-compact" style="margin-left:auto;">${path}</span>
                
                <button class="tool-action-btn-compact tool-view-btn" 
                        title="Open File" 
                        data-path="${encodeURIComponent(path)}"
                        style="margin-left: 8px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.8; transition: opacity 0.2s;">
                    <i data-lucide="external-link" style="width:11px; height:11px;"></i>
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderViewFileCard };
