const hljs = require('highlight.js');

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderFileEditCard(path, content, type = 'edit', stats = null) {
    const isEdit = type === 'edit_file';

    // Determine language from extension
    const ext = path.split('.').pop().toLowerCase();
    const langMap = {
        'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
        'html': 'html', 'css': 'css', 'py': 'python', 'json': 'json', 'md': 'markdown'
    };
    const lang = langMap[ext] || 'plaintext';

    // Prevent undefined/null content
    if (content === undefined || content === null) {
        content = '';
    }

    // Escape content for attribute
    const encodedContent = encodeURIComponent(content);
    const encodedPath = encodeURIComponent(path);

    // Highlight code
    let highlightedCode = '';
    try {
        if (lang !== 'plaintext' && hljs.getLanguage(lang)) {
            highlightedCode = hljs.highlight(content, { language: lang }).value;
        } else {
            highlightedCode = hljs.highlightAuto(content).value;
        }
    } catch (e) {
        highlightedCode = escapeHTML(content);
    }

    // Icon selection
    let icon = 'file-code';
    if (type === 'create_file') icon = 'file-plus';
    if (type === 'update_file') icon = 'file-edit';
    if (type === 'edit_file') icon = 'file-diff';

    // Stats HTML
    let statsHtml = '';
    if (stats) {
        if (stats.additions > 0) {
            statsHtml += `<span style="color:var(--peak-success, #22c55e); font-family:monospace; font-size:10px; margin-left:6px;">+${stats.additions}</span>`;
        }
        if (stats.deletions > 0) {
            statsHtml += `<span style="color:var(--peak-error-text, #ef4444); font-family:monospace; font-size:10px; margin-left:4px;">-${stats.deletions}</span>`;
        }
    }

    // Ultra-compact single-line design
    return `
        <div class="file-edit-card-compact" style="border-left:3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">${path}</span>
                ${statsHtml}
                <span class="file-meta-compact" style="margin-left:auto;">${lang}</span>
                <button class="toggle-code-btn-compact" title="Toggle Code" style="margin-left:8px;">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>
                <button class="copy-btn-compact" title="Copy Content" onclick="navigator.clipboard.writeText(decodeURIComponent('${encodedContent}'))" style="margin-left:4px; background: transparent; border: none; padding: 4px; cursor: pointer; color: var(--peak-secondary); opacity: 0.6; transition: opacity 0.2s;">
                    <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
            </div>
            <div class="file-code-collapsed" style="display:none;">
                <pre><code class="hljs language-${lang}">${highlightedCode}</code></pre>
            </div>
        </div>
    `;
}

function renderGeneratingFileCard(path, content) {
    // SAFEGUARD: Handle undefined/null content gracefully
    if (content === undefined || content === null) {
        content = '';
    }

    // Detect language
    const ext = path.split('.').pop().toLowerCase();
    const langMap = {
        'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
        'html': 'html', 'css': 'css', 'py': 'python', 'json': 'json', 'md': 'markdown'
    };
    const lang = langMap[ext] || 'plaintext';

    // Highlight Code
    let highlightedCode;
    try {
        if (lang !== 'plaintext' && hljs.getLanguage(lang)) {
            highlightedCode = hljs.highlight(content, { language: lang }).value;
        } else {
            highlightedCode = hljs.highlightAuto(content).value;
        }
    } catch (e) {
        highlightedCode = escapeHTML(content);
    }

    return `
        <div class="file-edit-card-compact generating" style="border-left:3px solid var(--peak-accent);">
            <div class="file-edit-line">
                <i data-lucide="loader-2" class="spin" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent); animation: spin 1s linear infinite;"></i>
                <span class="file-path-compact">Generating: ${path}</span>
                <span class="file-meta-compact" style="margin-left:auto;">
                    <i data-lucide="loader" style="width:8px; height:8px; animation: spin 2s linear infinite;"></i>
                </span>
                <button class="toggle-code-btn-compact" title="Toggle Code" style="margin-left:8px;">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>
            </div>
            <div class="file-code-collapsed" style="display:none;">
                <pre><code class="hljs language-${lang}">${highlightedCode}</code></pre>
            </div>
        </div>
    `;
}

module.exports = { renderFileEditCard, renderGeneratingFileCard };
