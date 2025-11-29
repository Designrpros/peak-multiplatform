
function renderActiveFileCard(path, content) {
    const cleanContent = content ? content.trim() : '';
    return `
        <div class="tool-block active-file-block">
            <div class="header">
                <i data-lucide="file-code" style="width:12px; height:12px;"></i> Active File: ${path.split('/').pop()}
            </div>
            <div class="content">${cleanContent.slice(0, 500) + (cleanContent.length > 500 ? '...' : '')}</div>
            <div class="footer">
                <span class="meta-info">Context automatically included</span>
            </div>
        </div>
    `;
}

module.exports = { renderActiveFileCard };
