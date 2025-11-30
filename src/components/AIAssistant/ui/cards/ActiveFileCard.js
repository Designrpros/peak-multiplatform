
function renderActiveFileCard(path, content) {
    const cleanContent = content ? content.trim() : '';
    const fileName = path.split('/').pop();
    const preview = cleanContent.slice(0, 80) + (cleanContent.length > 80 ? '…' : '');

    return `
        <div class="tool-card-compact">
            <div class="tool-line">
                <i data-lucide="file-code" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent); opacity:0.8;"></i>
                <span class="tool-label-compact">Context</span>
                <span class="tool-content-compact">${fileName}</span>
                <span class="file-meta-compact">Auto-included</span>
            </div>
        </div>
    `;
}

module.exports = { renderActiveFileCard };
