
function renderDeleteCard(path) {
    return `
        <div class="file-edit-card-compact" style="border-left: 3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="trash-2" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">Delete File</span>
                <span class="file-meta-compact" style="margin-left:auto;">${path}</span>
                
                <button class="copy-btn-compact" title="Copy Path" onclick="navigator.clipboard.writeText('${path}')" style="margin-left: 8px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                    <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderDeleteCard };
