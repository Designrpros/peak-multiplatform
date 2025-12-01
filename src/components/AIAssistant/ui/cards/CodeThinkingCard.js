/**
 * Renders a collapsed "code thinking" card that hides tool content
 * Used when agents are writing code with create_file/update_file/etc
 */

function renderCodeThinkingCard(toolName, filePath, codeContent = '', isComplete = true) {
    const actionVerb = toolName === 'create_file' ? 'Creating' :
        toolName === 'update_file' ? 'Updating' :
            toolName === 'delete_file' ? 'Deleting' :
                'Modifying';

    const fileName = filePath ? filePath.split('/').pop() : 'file';
    const summary = `${actionVerb} \`${fileName}\``;

    // Get file extension for syntax highlighting
    const ext = fileName.includes('.') ? fileName.split('.').pop() : 'text';
    const language = ext === 'js' ? 'javascript' :
        ext === 'ts' ? 'typescript' :
            ext === 'css' ? 'css' :
                ext === 'html' ? 'html' :
                    ext === 'json' ? 'json' :
                        ext === 'tsx' || ext === 'jsx' ? 'javascript' :
                            ext;

    // Determine action type
    const type = toolName === 'create_file' ? 'create' :
        toolName === 'update_file' ? 'update' :
            'modify';
    const actionLabel = type === 'create' ? 'Create' : 'Apply';
    const icon = type === 'create' ? 'file-plus' : 'pencil';

    // Encode for data attributes
    const encodedPath = encodeURIComponent(filePath || '');
    const encodedContent = encodeURIComponent(codeContent);

    if (isComplete) {
        return `
            <div class="file-edit-card-compact" style="border-left:3px solid var(--peak-accent);">
                <div class="file-edit-line">
                    <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                    <span class="file-path-compact">${filePath || 'file'}</span>
                    <span class="file-meta-compact" style="margin-left:auto;">${language}</span>
                    <button class="toggle-code-btn-compact" title="Toggle Code" style="margin-left:8px;">
                        <i data-lucide="code" style="width:9px; height:9px;"></i>
                    </button>
                    <div style="width:1px; height:10px; background:var(--border-color); margin:0 4px;"></div>
                    <button class="file-action-btn-compact tool-create-btn"
                            data-path="${encodedPath}"
                            data-content="${encodedContent}"
                            data-type="${type}"
                            title="Apply Changes">
                        <i data-lucide="check" style="width:9px; height:9px;"></i>
                        ${actionLabel}
                    </button>
                    <button class="file-action-btn-compact tool-create-btn"
                            data-path="${encodedPath}"
                            data-content=""
                            data-type="reject"
                            title="Reject Changes"
                            style="background:rgba(220,38,38,0.1); color:#dc2626; border:1px solid rgba(220,38,38,0.2);">
                        <i data-lucide="x" style="width:9px; height:9px;"></i>
                        Reject
                    </button>
                </div>
                <div class="file-code-collapsed" style="display:none;">
                    <pre><code class="language-${language}">${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                </div>
            </div>
        `;
    } else {
        return `
            <details class="code-thinking-block">
                <summary class="code-thinking-summary">
                    <i data-lucide="loader-2" class="spin" style="width:12px; height:12px; animation: spin 1s linear infinite;"></i>
                    <span class="code-thinking-text">Writing code...</span>
                </summary>
                <div class="code-thinking-hint">Generating...</div>
            </details>
        `;
    }
}

module.exports = { renderCodeThinkingCard };
