const { renderMarkdown } = require('../../../../utils/markdown');

function renderListDirectoryCard(path = 'root', recursive = false) {
    const isRecursive = recursive === true || recursive === 'true';
    const icon = isRecursive ? 'folder-tree' : 'folder-open';
    const title = isRecursive ? 'Recursive Directory Listing' : 'List Directory';
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return `
        <div class="file-edit-card-compact list-directory-card" data-tool-name="list_directory" data-path="${encodeURIComponent(path)}" style="border-left: 3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">${title}</span>
                <code class="file-meta-compact" style="font-family:monospace; color:var(--peak-primary); margin-left:auto;">${path}</code>
                
                <button class="copy-btn-compact" title="Copy Path" onclick="navigator.clipboard.writeText('${path}')" style="margin-left: 8px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                    <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
            </div>
            <div class="list-dir-output" style="display:none; margin-top:8px; padding:10px; border-top:1px solid var(--border-color);">
                <div style="font-size:10px; font-weight:600; margin-bottom:4px; color:var(--peak-secondary);">Output:</div>
                <pre style="margin:0; white-space:pre-wrap; word-break:break-all; font-size:10px; color:var(--peak-secondary); max-height:200px; overflow-y:auto;"></pre>
            </div>
        </div>
    `;
}

module.exports = { renderListDirectoryCard };
