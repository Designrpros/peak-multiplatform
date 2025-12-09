
function renderViewFileCard(path) {
    // Generate unique execution ID for this button instance
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return `
        <div class="tool-card-compact" data-tool-name="view_file" data-path="${encodeURIComponent(path)}">
            <div class="tool-line">
                <i data-lucide="eye" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="tool-label-compact">View</span>
                <span class="tool-content-compact">${path}</span>
                <button class="tool-action-btn-compact tool-view-btn" 
                        data-path="${encodeURIComponent(path)}"
                        data-execution-id="${executionId}">
                    <i data-lucide="external-link" style="width:9px; height:9px;"></i>
                    Open
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderViewFileCard };
