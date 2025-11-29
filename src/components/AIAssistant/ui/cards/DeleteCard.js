
function renderDeleteCard(path) {
    return `
        <div class="tool-block delete-block">
            <div class="header delete-header">
                <i data-lucide="trash-2" style="width:12px; height:12px;"></i> Delete File: ${path}
            </div>
            <div class="footer">
                <button class="msg-action-btn tool-delete-btn" data-path="${encodeURIComponent(path)}">
                    <i data-lucide="trash" style="width:12px; height:12px;"></i> Delete File
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderDeleteCard };
