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

function renderFileEditCard(path, content, type, titleOverride) {
    // Detect language from path extension
    const ext = path.split('.').pop().toLowerCase();
    const langMap = {
        'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
        'html': 'html', 'css': 'css', 'py': 'python', 'json': 'json', 'md': 'markdown'
    };
    const lang = langMap[ext] || 'plaintext';

    // Strip markdown code fences if present
    let rawContent = content;
    const fenceRegex = /^```[a-zA-Z0-9]*\n([\s\S]*?)\n```$/;
    const match = rawContent.trim().match(fenceRegex);
    if (match) {
        rawContent = match[1];
    } else {
        rawContent = rawContent.replace(/^```[a-zA-Z0-9]*\n/, '').replace(/\n```$/, '');
    }

    // Highlight Code
    let highlightedCode;
    try {
        if (lang !== 'plaintext' && hljs.getLanguage(lang)) {
            highlightedCode = hljs.highlight(rawContent, { language: lang }).value;
        } else {
            highlightedCode = hljs.highlightAuto(rawContent).value;
        }
    } catch (e) {
        highlightedCode = escapeHTML(rawContent);
    }

    const lineCount = rawContent.split('\n').length;
    const title = titleOverride || (type === 'create' ? `Create: ${path}` : `Update: ${path}`);
    const icon = type === 'create' ? 'file-plus' : 'file-code';
    const actionLabel = type === 'create' ? 'Create File' : 'Apply Edit';

    return `
        <div class="file-edit-card">
            <div class="file-edit-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div class="icon-wrapper ${type}">
                            <i data-lucide="${icon}" style="width:14px; height:14px;"></i>
                    </div>
                    <span class="file-title">${title}</span>
                </div>
                <button class="icon-btn toggle-code-btn" title="Toggle Content" style="width:auto; padding:0 8px; gap:4px;">
                    <span style="font-size:10px; font-weight:500;">Show Code</span>
                    <i data-lucide="chevron-down" style="width:14px; height:14px;"></i>
                </button>
            </div>
            <div class="file-edit-content" style="display:none;">
                <pre><code class="hljs language-${lang}">${highlightedCode}</code></pre>
            </div>
            <div class="file-edit-footer">
                <span class="meta-info">${lineCount} lines</span>
                <button class="msg-action-btn tool-create-btn" data-type="${type}" data-path="${encodeURIComponent(path)}" data-content="${encodeURIComponent(rawContent)}">
                    <i data-lucide="save" style="width:12px; height:12px;"></i> ${actionLabel}
                </button>
            </div>
        </div>
    `;
}

function renderGeneratingFileCard(path, content) {
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
        // For generating, content might be incomplete, so highlightAuto might be safer or just basic escape if it fails
        if (lang !== 'plaintext' && hljs.getLanguage(lang)) {
            highlightedCode = hljs.highlight(content, { language: lang }).value;
        } else {
            highlightedCode = hljs.highlightAuto(content).value;
        }
    } catch (e) {
        highlightedCode = escapeHTML(content);
    }

    return `
        <div class="file-edit-card generating">
            <div class="file-edit-header">
                <div style="display:flex; align-items:center; gap:8px;">
                    <i data-lucide="loader-2" class="spin" style="width:14px; height:14px; color:var(--peak-accent); animation: spin 1s linear infinite;"></i>
                    <span class="file-title">Generating: ${path}</span>
                </div>
                <button class="icon-btn toggle-code-btn" title="Toggle Content" style="width:auto; padding:0 8px; gap:4px;">
                    <span style="font-size:10px; font-weight:500;">Show Code</span>
                    <i data-lucide="chevron-down" style="width:14px; height:14px;"></i>
                </button>
            </div>
            <div class="file-edit-content" style="display:none;">
                <pre><code class="hljs language-${lang}">${highlightedCode}</code></pre>
            </div>
            <div class="file-edit-footer" style="justify-content: flex-start;">
                <span class="meta-info" style="display:flex; align-items:center; gap:6px;">
                    <i data-lucide="loader" style="width:10px; height:10px; animation: spin 2s linear infinite;"></i> Generating code...
                </span>
            </div>
        </div>
    `;
}

module.exports = { renderFileEditCard, renderGeneratingFileCard };
