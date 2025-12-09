/**
 * Renders a collapsed "code thinking" card that hides tool content
 * Used when agents are writing code with create_file/update_file/etc
 */

function renderCodeThinkingCard(toolName, filePath, codeContent = '', isComplete = true) {
    const actionVerb = toolName === 'create_file' ? 'Creating' :
        toolName === 'update_file' ? 'Updating' :
            toolName === 'edit_file' ? 'Editing' :
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
            toolName === 'edit_file' ? 'update' : // Changed from 'modify' to 'update' to match auto-accept logic
                'modify';
    const actionLabel = type === 'create' ? 'Create' : 'Apply';
    const icon = type === 'create' ? 'file-plus' : 'pencil';

    // Encode for data attributes
    const encodedPath = encodeURIComponent(filePath || '');
    const encodedContent = encodeURIComponent(codeContent);

    if (isComplete) {
        return `
            <div class="file-edit-card-compact" style="border-left:3px solid var(--peak-accent); background: transparent; padding-left: 8px;" data-tool-name="${toolName}" data-path="${encodedPath}">
                <div class="file-edit-line" style="display: flex; align-items: center; gap: 6px; font-size: 11px;">
                    <i data-lucide="${icon}" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                    <span class="file-path-compact" style="font-weight: 500; color: var(--peak-primary); cursor: pointer;" onclick="window.dispatchEvent(new CustomEvent('peak-open-file', { detail: { path: '${filePath}' } }))">${filePath || 'file'}</span>
                    <span class="file-meta-compact" style="margin-left:auto; color: var(--text-muted); font-size: 10px;">${language}</span>
                    <button class="toggle-code-btn-compact" data-target-path="${encodedPath}" title="Toggle Code" style="margin-left:8px; background: none; border: none; cursor: pointer; color: var(--text-muted);">
                        <i data-lucide="code" style="width:10px; height:10px;"></i>
                    </button>
                    <div style="width:1px; height:10px; background:var(--border-color); margin:0 4px;"></div>
                    <button class="file-action-btn-compact tool-create-btn"
                            data-path="${encodedPath}"
                            data-content="${encodedContent}"
                            data-type="${type}"
                            title="Apply Changes"
                            style="background: transparent; border: 1px solid var(--border-color); border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer; color: var(--peak-primary); display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="check" style="width:9px; height:9px;"></i>
                        ${actionLabel}
                    </button>
                    <button class="file-action-btn-compact tool-create-btn"
                            data-path="${encodedPath}"
                            data-content=""
                            data-type="reject"
                            title="Reject Changes"
                            style="background:rgba(220,38,38,0.1); color:#dc2626; border:1px solid rgba(220,38,38,0.2); border-radius: 3px; padding: 2px 6px; font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                        <i data-lucide="x" style="width:9px; height:9px;"></i>
                        Reject
                    </button>
                </div>
                <div class="file-code-collapsed" data-path="${encodedPath}" style="display:none; margin-top: 6px; margin-left: 18px; text-align: left; border-left: 2px solid var(--border-color); padding-left: 8px;">
                    <pre style="margin: 0; padding: 8px; background: var(--bg-secondary); border-radius: 4px; overflow-x: auto; border: 1px solid var(--border-color);"><code class="language-${language}" style="font-family: monospace; font-size: 11px;">${codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
                </div>
            </div>
        `;
    } else {
        return `
            <details class="code-thinking-block" open data-tool-name="${toolName}" data-path="${encodedPath}" style="background: transparent; border: none; padding: 0;">
                <summary class="code-thinking-summary" style="list-style: none; cursor: pointer; display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 11px;">
                    <i data-lucide="loader-2" class="code-thinking-spinner" style="width:12px; height:12px; animation: spin 1s linear infinite;"></i>
                    <span class="code-thinking-text">Writing code for <code style="font-family:monospace; background:rgba(127,127,127,0.1); padding:2px 4px; border-radius:3px; color: var(--peak-primary);">${filePath || 'file'}</code>...</span>
                </summary>
                <div class="code-thinking-hint" style="font-family:monospace; font-size:11px; white-space:pre-wrap; opacity:0.8; max-height:300px; overflow-y:auto; margin-top:4px; padding-left: 18px; color: var(--text-muted); text-align: left;">${codeContent ? codeContent.replace(/</g, '&lt;').replace(/>/g, '&gt;') : 'Generating content...'}</div>
            </details>
        `;
    }
}

module.exports = { renderCodeThinkingCard };
