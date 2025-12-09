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
    // SAFEGUARD: Prevent undefined or null content from being encoded
    if (content === undefined || content === null) {
        console.warn('[FileEditCard] Received undefined/null content for path:', path);
        content = '';  // Use empty string as fallback
    }

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
    const icon = type === 'create' ? 'file-plus' : 'pencil';
    const actionLabel = type === 'create' ? 'Create' : 'Apply';

    const encodedPath = encodeURIComponent(path);
    const encodedContent = encodeURIComponent(rawContent);

    // Ultra-compact single-line design
    return `
        <div class="file-edit-card-compact" style="border-left:3px solid var(--peak-accent);">
            <div class="file-edit-line">
                <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">${path}</span>
                <span class="file-meta-compact" style="margin-left:auto;">${lang}</span>
                <button class="toggle-code-btn-compact" title="Toggle Code" style="margin-left:8px;">
                    <i data-lucide="code" style="width:9px; height:9px;"></i>
                </button>
                <button class="copy-btn-compact" title="Copy Content" onclick="navigator.clipboard.writeText(decodeURIComponent(this.dataset.content))" data-content="${encodedContent}" style="margin-left:4px;">
                    <i data-lucide="copy" style="width:9px; height:9px;"></i>
                </button>
                <div style="width:1px; height:10px; background:var(--border-color); margin:0 4px;"></div>
                <button class="file-action-btn-compact tool-create-btn" 
                        data-path="${encodedPath}" 
                        data-content="${encodedContent}" 
                        data-type="${type}"
                        title="Apply Changes">
                    <i data-lucide="check" style="width:9px; height:9px;"></i>
                    Apply
                </button>
                <button class="file-action-btn-compact reject-btn" 
                        data-path="${encodedPath}" 
                        data-content="" 
                        data-type="reject"
                        title="Reject Changes"
                        style="color:var(--peak-error-text);">
                    <i data-lucide="x" style="width:9px; height:9px;"></i>
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
