const { renderMarkdown } = require('../../../../utils/markdown');

function renderListDirectoryCard(path = 'root', recursive = false) {
    const isRecursive = recursive === true || recursive === 'true';
    const icon = isRecursive ? 'folder-tree' : 'folder-open';
    const title = isRecursive ? 'Recursive Directory Listing' : 'List Directory';
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    return `
        <div class="file-edit-card-compact list-directory-card" data-tool-name="list_directory" data-path="${encodeURIComponent(path)}">
            <div class="file-edit-line">
                <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="file-path-compact">${title}</span>
                <code class="file-meta-compact" style="font-family:monospace; color:var(--peak-primary);">${path}</code>
                <button class="file-action-btn-compact tool-list-dir-btn" 
                        data-path="${encodeURIComponent(path)}" 
                        data-recursive="${isRecursive}"
                        data-execution-id="${executionId}">
                    <i data-lucide="play" style="width:9px; height:9px;"></i>
                    Run
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
