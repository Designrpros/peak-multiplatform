
function renderViewFileCard(path) {
    return `
        <div class="tool-block view-block">
            <div class="header">
                <i data-lucide="eye" style="width:12px; height:12px;"></i> View File
            </div>
            <div class="content">${path}</div>
            <div class="footer">
                <button class="msg-action-btn tool-view-btn" data-path="${encodeURIComponent(path)}">
                    <i data-lucide="file-text" style="width:10px; height:10px;"></i> Open File
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderViewFileCard };
