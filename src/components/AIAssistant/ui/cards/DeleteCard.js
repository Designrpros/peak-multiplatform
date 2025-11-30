
function renderDeleteCard(path) {
    return `
        <div class="tool-card-compact delete-card">
            <div class="tool-line">
                <i data-lucide="trash-2" style="width:10px; height:10px; flex-shrink:0; color:#ef4444; opacity:0.8;"></i>
                <span class="tool-label-compact" style="color:#ef4444;">Delete</span>
                <span class="tool-content-compact">${path}</span>
                <button class="tool-action-btn-compact tool-delete-btn" data-path="${encodeURIComponent(path)}" style="color:#ef4444; border-color:#ef4444;">
                    <i data-lucide="trash" style="width:9px; height:9px;"></i>
                    Delete
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderDeleteCard };
