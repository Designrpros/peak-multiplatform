
function renderViewFileCard(path) {
    return `
        <div class="tool-card-compact">
            <div class="tool-line">
                <i data-lucide="eye" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="tool-label-compact">View</span>
                <span class="tool-content-compact">${path}</span>
                <button class="tool-action-btn-compact tool-view-btn" data-path="${encodeURIComponent(path)}">
                    <i data-lucide="external-link" style="width:9px; height:9px;"></i>
                    Open
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderViewFileCard };
