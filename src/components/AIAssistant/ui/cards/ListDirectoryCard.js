const { renderMarkdown } = require('../../../../utils/markdown');

function renderListDirectoryCard(path = 'root', recursive = false) {
    const isRecursive = recursive === true || recursive === 'true';
    const icon = isRecursive ? 'folder-tree' : 'folder-open';
    const title = isRecursive ? 'Recursive Directory Listing' : 'List Directory';

    return `
        <div class="tool-card-compact" style="border-left:3px solid var(--peak-secondary);">
            <div class="tool-line">
                <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="tool-label-compact">${title}</span>
                <code class="tool-content-compact">${path}</code>
                <button class="tool-action-btn-compact tool-list-dir-btn" 
                        data-path="${encodeURIComponent(path)}" 
                        data-recursive="${isRecursive}">
                    <i data-lucide="play" style="width:9px; height:9px;"></i>
                    Run
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderListDirectoryCard };
