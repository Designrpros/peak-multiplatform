// src/components/AIAssistant/AIAssistantLogic.js
const { ipcRenderer } = require('electron');
const path = require('path');
// const { renderMarkdown } = require('../../utils/markdown.js'); // Removed for plain text UI
// const { renderMarkdown } = require('../../utils/markdown.js'); // Removed for plain text UI

const AI_ASSIST_SESSION_ID = -999;
let assistStreamingMessageRef = null;
let assistLocalListener = null;
// NEW: Store chat history in global scope to persist across module reloads
if (!window.peakChatHistory) window.peakChatHistory = [];
let chatHistory = window.peakChatHistory;

// CRITICAL: Force AI to use code blocks so the "Apply" button renders
const SYSTEM_PROMPT = `
You are an advanced AI coding assistant embedded in "Peak", a modern IDE.
You have full access to the user's project files and can run terminal commands.

PROJECT CONTEXT:
Root: \${window.currentProjectRoot || 'Current Directory'}
Project Title: \${projectData.title || 'Untitled Project'}

**THE FORMULA (STRICT WORKFLOW):**
You must follow this exact sequence for every request:

1.  **THINK**: Analyze the request and plan the steps.
    *   **PLAIN TEXT ONLY**. No markdown, no code blocks.
    *   Keep it concise.
2.  **UPDATE TODO**: If the request involves multiple steps or changes, create/update \`TODO.md\`.
    *   Skip this ONLY if it's a trivial one-step fix.
3.  **EXECUTE**: Run the necessary tools to complete the task.
    *   Use \`create_file\` to write code.
    *   Use \`run_command\` for shell commands.

**CRITICAL RULES:**
- **NO CODE BLOCKS (\`\`\`) IN THINKING**: Describe code changes in words.
- **TOOLS AFTER THINKING**: Close \`</thinking>\` before using any tools.
- **NO REPETITION**: Do not output the same text or tool multiple times.
- **CHAIN COMMANDS**: \`mkdir app && cd app\`.

RESPONSE STRUCTURE:
<thinking>
Analysis: The user wants to...
Plan: 1. Create component... 2. Update index...
</thinking>

<tool name="create_file" path="TODO.md">
- [ ] Create component
</tool>

<tool name="create_file" path="src/Component.js">
... code ...
</tool>
`;

// Helper to render tools and code blocks as cards
function renderTools(html) {
    let processed = html;

    // 1. AGGRESSIVE UNWRAP & UNESCAPE
    // First, force unescape any <tool> tags that might have been escaped by markdown rendering
    // We handle mixed escaping (e.g. &lt;tool ... >) by doing this globally for tool tags
    processed = processed
        .replace(/&lt;tool/g, '<tool')
        .replace(/&lt;\/tool&gt;/g, '</tool>')
        .replace(/&lt;\/tool/g, '</tool>') // Handle &lt;/tool>
        .replace(/&gt;/g, '>'); // Unescape all > to be safe for attributes

    // Now clean up attributes that might still be escaped quotes
    const toolTagRegex = /<tool\s+([\s\S]*?)<\/tool>/g;
    processed = processed.replace(toolTagRegex, (match, inner) => {
        // inner is the content + attributes. Wait, regex above captures content too.
        // We need to be careful not to unescape content that SHOULD be escaped (like code).
        // But we DO need to unescape the OPENING tag attributes.

        // Let's use a specific regex for the opening tag
        return match.replace(/^<tool\s+([^>]+)>/, (tagMatch, attrs) => {
            const unescapedAttrs = attrs.replace(/&quot;/g, '"').replace(/&#34;/g, '"');
            return `<tool ${unescapedAttrs}>`;
        });
    });

    // Handle the case where the AI outputs <create_file path="..."> instead of <tool name="create_file" ...>
    // We normalize it to <tool name="create_file" ...> for the downstream regexes
    // We also handle &lt;create_file if it wasn't caught above (though it should have been)
    const rawCreateFileRegex = /<create_file\s+([\s\S]*?)<\/create_file>/g;
    processed = processed.replace(rawCreateFileRegex, (match, content) => {
        // We need to extract attributes from the opening tag, but the regex captured the whole thing including content
        // This is getting tricky. Let's rely on the simpler normalization:
        return match.replace(/^<create_file\s+/, '<tool name="create_file" ').replace(/<\/create_file>$/, '</tool>');
    });


    // Regex for Thinking Block (Complete) - Supports <thinking> and <think>
    const thinkingRegex = /(&lt;thinking&gt;|<thinking>|&lt;think&gt;|<think>)([\s\S]*?)(&lt;\/thinking&gt;| வரும்<\/thinking>|&lt;\/think&gt;| வரும்<\/think>)/g;
    // Note: The closing tag regex above is a bit messy due to potential encoding. 
    // Let's simplify: Match start tag, content, end tag.
    const thinkingBlockRegex = /(?:&lt;thinking&gt;|<thinking>|&lt;think&gt;|<think>)([\s\S]*?)(?:&lt;\/thinking&gt;| வரும்<\/thinking>|<\/thinking>|&lt;\/think&gt;| வரும்<\/think>|<\/think>)/g;

    processed = processed.replace(thinkingBlockRegex, (match, content) => {
        // FAILSAFE: Strip any markdown code blocks from the thinking content
        const cleanContent = content.replace(/```[\s\S]*?```/g, '').replace(/```/g, '').trim();

        return `
            <details class="thinking-block" open>
                <summary class="thinking-summary">
                    <i data-lucide="brain-circuit" style="width:14px; height:14px;"></i> 
                    <span>Thinking Process</span>
                </summary>
                <div class="thinking-content">
                    ${cleanContent}
                </div>
            </details>
        `;
    });

    // Regex for INCOMPLETE Thinking Block (Streaming)
    const incompleteThinkingRegex = /(?:&lt;thinking&gt;|<thinking>|&lt;think&gt;|<think>)([\s\S]*)$/;
    processed = processed.replace(incompleteThinkingRegex, (match, content) => {
        return `
            <details class="thinking-block" open>
                <summary class="thinking-summary">
                    <i data-lucide="loader-2" class="spin" style="width:14px; height:14px; animation: spin 1s linear infinite;"></i> 
                    <span>Thinking...</span>
                </summary>
                <div class="thinking-content">
                    ${content.trim()}
                </div>
            </details>
        `;
    });

    // --- SIMPLIFIED TOOL REGEXES (Now that we have clean <tool> tags) ---

    // Regex for Run Command - Handles encoded tags from renderMarkdown
    const cmdRegex = /(?:&lt;tool|&lt;tool\s+name="run_command"|<tool\s+name="run_command")[^>]*>(?:[\s\S]*?)(?:&lt;\/tool&gt;| வரும்<\/tool>|<\/tool>)/g;
    // Actually, let's use a more robust approach for all tools:
    // We match the tag start, attributes, content, and tag end.

    // Run Command
    processed = processed.replace(/(?:&lt;|<)tool\s+name="run_command"(?:.*?)&gt;([\s\S]*?)(?:&lt;|<)\/tool&gt;/g, (match, cmd) => {
        return `
            <div class="tool-block command-block">
                <div class="header">
                    <i data-lucide="terminal" style="width:12px; height:12px;"></i> Suggested Command
                </div>
                <div class="content">${cmd.trim()}</div>
                <div class="footer">
                    <button class="msg-action-btn tool-run-btn" data-cmd="${encodeURIComponent(cmd.trim())}">
                        <i data-lucide="play" style="width:10px; height:10px;"></i> Run
                    </button>
                </div>
            </div>
        `;
    });
    // Also handle unencoded (if markdown didn't escape it for some reason)
    processed = processed.replace(/<tool\s+name="run_command"[^>]*>([\s\S]*?)<\/tool>/g, (match, cmd) => {
        return `
            <div class="tool-block command-block">
                <div class="header">
                    <i data-lucide="terminal" style="width:12px; height:12px;"></i> Suggested Command
                </div>
                <div class="content">${cmd.trim()}</div>
                <div class="footer">
                    <button class="msg-action-btn tool-run-btn" data-cmd="${encodeURIComponent(cmd.trim())}">
                        <i data-lucide="play" style="width:10px; height:10px;"></i> Run
                    </button>
                </div>
            </div>
        `;
    });

    // Regex for Create File
    // Matches <tool name="create_file" path="..."> OR <tool path="..." name="create_file">
    // We need to handle &lt; and &quot;
    const fileRegex = /(?:&lt;|<)tool\s+(?:name="create_file"|name=&quot;create_file&quot;)\s+(?:path="([^"]+)"|path=&quot;([^"]+)&quot;)|(?:&lt;|<)tool\s+(?:path="([^"]+)"|path=&quot;([^"]+)&quot;)\s+(?:name="create_file"|name=&quot;create_file&quot;)[^>]*&gt;([\s\S]*?)(?:&lt;|<)\/tool&gt;/g;

    // This regex is getting too complex to maintain reliably for both encoded/unencoded.
    // Better strategy: Decode the string *temporarily* to find tools? No, that breaks the markdown rendering.
    // Let's stick to the primary issue: renderMarkdown escapes <tool>.
    // So we should look for &lt;tool ... &gt; ... &lt;/tool&gt;

    const escapedFileRegex = /&lt;tool\s+(?:name=&quot;create_file&quot;\s+path=&quot;([^&]+)&quot;|path=&quot;([^&]+)&quot;\s+name=&quot;create_file&quot;)[^&]*&gt;([\s\S]*?)&lt;\/tool&gt;/g;
    processed = processed.replace(escapedFileRegex, (match, p1, p2, content) => {
        const path = p1 || p2;
        const trimmedContent = content.trim();
        const lineCount = trimmedContent.split('\n').length;

        return `
            <div class="file-edit-card" style="border: 1px solid var(--peak-border); border-radius: 6px; margin-bottom: 10px; overflow: hidden;">
                <div class="file-edit-header" style="background: var(--peak-bg-secondary); padding: 8px 12px; border-bottom: 1px solid var(--peak-border); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="file-plus" style="width:14px; height:14px; color:var(--peak-accent);"></i>
                        <span style="font-weight:600; color:var(--peak-primary);">Create: ${path}</span>
                    </div>
                    <button class="icon-btn toggle-code-btn" title="Toggle Content">
                        <i data-lucide="chevron-down" style="width:14px; height:14px;"></i>
                    </button>
                </div>
                <div class="file-edit-content" style="display:none; padding: 0;">
                    <pre style="margin:0; padding:12px;"><code class="language-plaintext">${trimmedContent}</code></pre>
                </div>
                <div class="file-edit-footer" style="padding: 8px 12px; background: var(--peak-bg-tertiary); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; color:var(--peak-secondary);">${lineCount} lines</span>
                    <button class="msg-action-btn tool-create-btn" data-path="${encodeURIComponent(path)}" data-content="${encodeURIComponent(trimmedContent)}">
                        <i data-lucide="save" style="width:10px; height:10px;"></i> Create File
                    </button>
                </div>
            </div>
        `;
    });

    // Original unescaped regex (fallback)
    const unescapedFileRegex = /<tool\s+(?:name="create_file"\s+path="([^"]+)"|path="([^"]+)"\s+name="create_file")[^>]*>([\s\S]*?)<\/tool>/g;
    processed = processed.replace(unescapedFileRegex, (match, p1, p2, content) => {
        const path = p1 || p2;
        const trimmedContent = content.trim();
        const lineCount = trimmedContent.split('\n').length;

        return `
            <div class="file-edit-card" style="border: 1px solid var(--peak-border); border-radius: 6px; margin-bottom: 10px; overflow: hidden;">
                <div class="file-edit-header" style="background: var(--peak-bg-secondary); padding: 8px 12px; border-bottom: 1px solid var(--peak-border); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="file-plus" style="width:14px; height:14px; color:var(--peak-accent);"></i>
                        <span style="font-weight:600; color:var(--peak-primary);">Create: ${path}</span>
                    </div>
                    <button class="icon-btn toggle-code-btn" title="Toggle Content">
                        <i data-lucide="chevron-down" style="width:14px; height:14px;"></i>
                    </button>
                </div>
                <div class="file-edit-content" style="display:none; padding: 0;">
                    <pre style="margin:0; padding:12px;"><code class="language-plaintext">${trimmedContent}</code></pre>
                </div>
                <div class="file-edit-footer" style="padding: 8px 12px; background: var(--peak-bg-tertiary); display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; color:var(--peak-secondary);">${lineCount} lines</span>
                    <button class="msg-action-btn tool-create-btn" data-path="${encodeURIComponent(path)}" data-content="${encodeURIComponent(trimmedContent)}">
                        <i data-lucide="save" style="width:10px; height:10px;"></i> Create File
                    </button>
                </div>
            </div>
        `;
    });

    // Regex for INCOMPLETE Create File (Streaming) - Handles both
    const incompleteFileRegex = /(?:&lt;|<)tool\s+(?:name="create_file"\s+path="([^"]+)"|path="([^"]+)"\s+name="create_file"|name=&quot;create_file&quot;\s+path=&quot;([^&]+)&quot;|path=&quot;([^&]+)&quot;\s+name=&quot;create_file&quot;)[^>]*&gt;([\s\S]*)$/;
    processed = processed.replace(incompleteFileRegex, (match, p1, p2, p3, p4, content) => {
        const path = p1 || p2 || p3 || p4;
        return `
            <div class="file-edit-card generating">
                <div class="file-edit-header">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="loader-2" class="spin" style="width:14px; height:14px; color:var(--peak-accent); animation: spin 1s linear infinite;"></i>
                        <span style="font-weight:600; color:var(--peak-primary);">Generating: ${path}</span>
                    </div>
                </div>
                <div class="file-edit-content">
                    <pre><code class="language-plaintext">${content}</code></pre>
                </div>
            </div>
        `;
    });



    // Regex for Delete File
    const deleteRegex = /<tool name="delete_file" path="(.*?)">([\s\S]*?)<\/tool>/g;
    processed = processed.replace(deleteRegex, (match, path) => {
        return `
            <div class="tool-block delete-block" style="border-color:var(--error-color);">
                <div class="header" style="background:rgba(255,0,0,0.1);">
                    <i data-lucide="trash-2" style="width:12px; height:12px; color:var(--error-color);"></i> Delete File: ${path}
                </div>
                <div class="footer">
                    <button class="msg-action-btn tool-delete-btn" data-path="${encodeURIComponent(path)}" style="border-color:var(--error-color); color:var(--error-color);">
                        <i data-lucide="trash" style="width:10px; height:10px;"></i> Delete File
                    </button>
                </div>
            </div>
        `;
    });

    // Regex for Search Project
    const searchRegex = /<tool name="search_project">([\s\S]*?)<\/tool>/g;
    processed = processed.replace(searchRegex, (match, query) => {
        return `
            <div class="tool-block search-block">
                <div class="header">
                    <i data-lucide="search" style="width:12px; height:12px;"></i> Suggested Search
                </div>
                <div class="content">${query.trim()}</div>
                <div class="footer">
                    <button class="msg-action-btn tool-search-btn" data-query="${encodeURIComponent(query.trim())}">
                        <i data-lucide="search" style="width:10px; height:10px;"></i> Search Project
                    </button>
                </div>
            </div>
        `;
    });

    // NEW: Regex for Code Blocks -> File Edit Cards (Fallback)
    // Matches ```language ... ``` (Complete blocks)
    // We try to infer if it's a file edit based on the content or if it's just a code snippet
    const codeBlockRegex = /<pre><code class="language-(\w+)">([\s\S]*?)<\/code><\/pre>/g;
    processed = processed.replace(codeBlockRegex, (match, lang, content) => {
        // Only convert to card if it looks like a file edit (e.g., has a filename comment or is TODO.md)
        // Or if we are in the "Plan" phase and it's a markdown block (likely TODO.md)
        let title = `Update ${lang} file`;
        let isFileEdit = false;
        let path = `file.${lang}`;

        const lines = content.split('\n');
        const firstLine = lines[0].trim();

        // Heuristic: Check for filename in first line
        if (firstLine.match(/^(\/\/|#|<!--)\s*[\w./-]+/)) {
            path = firstLine.replace(/^(\/\/|#|<!--)\s*/, '').replace(/(-->)$/, '').trim();
            title = `Update: ${path}`;
            isFileEdit = true;
        } else if (lang === 'markdown' && content.includes('# TODO')) {
            // Heuristic: Markdown block with # TODO is likely TODO.md
            path = 'TODO.md';
            title = 'Update: TODO.md';
            isFileEdit = true;
        }

        if (isFileEdit) {
            const lineCount = lines.length;
            return `
                <div class="file-edit-card">
                    <div class="file-edit-header">
                        <div style="display:flex; align-items:center; gap:6px;">
                            <i data-lucide="file-code" style="width:14px; height:14px; color:var(--peak-accent);"></i>
                            <span style="font-weight:600; color:var(--peak-primary);">${title}</span>
                        </div>
                        <button class="icon-btn toggle-code-btn" title="Toggle Code">
                            <i data-lucide="chevron-down" style="width:14px; height:14px;"></i>
                        </button>
                    </div>
                    <div class="file-edit-content" style="display:none;">
                        <pre><code class="language-${lang}">${content}</code></pre>
                    </div>
                    <div class="file-edit-footer" style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:11px; color:var(--peak-secondary);">${lineCount} lines</span>
                        <!-- User requested removal of Apply/Save button for code blocks -->
                    </div>
                </div>
            `;
        }

        return match; // Return original code block if not identified as a file edit
    });

    // NEW: Convert H2 sections into collapsible cards
    // We look for <h2>...</h2> followed by content, until the next <h2> or end of string
    // We exclude the "Thinking" block which we already handled
    const sectionRegex = /(<h2.*?>.*?<\/h2>)([\s\S]*?)(?=(<h2|$))/g;
    processed = processed.replace(sectionRegex, (match, header, content) => {
        // Extract text from header for the summary
        const title = header.replace(/<[^>]+>/g, '').trim();

        // If content is empty or just whitespace, don't wrap
        if (!content.trim()) return match;

        return `
            <details class="section-card" open style="border: 1px solid var(--peak-border); border-radius: 8px; margin-bottom: 12px; background: var(--peak-bg-secondary); overflow: hidden;">
                <summary style="padding: 10px 12px; cursor: pointer; font-weight: 600; color: var(--peak-primary); display: flex; align-items: center; gap: 8px; list-style: none; background: var(--peak-bg-tertiary);">
                    <i data-lucide="chevron-right" class="arrow" style="width: 14px; height: 14px; transition: transform 0.2s;"></i>
                    ${title}
                </summary>
                <div class="section-content" style="padding: 12px; border-top: 1px solid var(--peak-border);">
                    ${content}
                </div>
            </details>
        `;
    });

    // NEW: Handle INCOMPLETE Code Blocks (Streaming)
    // Matches <pre><code class="language-...">... (without closing tags)
    // This is a bit tricky because regex is greedy. We look for the START but NO END.
    // However, since we already replaced the COMPLETE blocks above, any remaining <pre><code...> is incomplete!
    const incompleteRegex = /<pre><code class="language-(\w+)">([\s\S]*)$/;
    processed = processed.replace(incompleteRegex, (match, lang, content) => {
        let title = `Generating ${lang} file...`;
        const lines = content.split('\n');
        const firstLine = lines[0].trim();
        if (firstLine.match(/^(\/\/|#|<!--)\s*[\w./-]+/)) {
            title = firstLine.replace(/^(\/\/|#|<!--)\s*/, '').replace(/(-->)$/, '').trim();
        }

        return `
            <div class="file-edit-card generating">
                <div class="file-edit-header">
                    <div style="display:flex; align-items:center; gap:6px;">
                        <i data-lucide="loader-2" class="spin" style="width:14px; height:14px; color:var(--peak-accent); animation: spin 1s linear infinite;"></i>
                        <span style="font-weight:600; color:var(--peak-primary);">${title}</span>
                    </div>
                </div>
                <div class="file-edit-content" style="display:none;">
                    <pre><code class="language-${lang}">${content}</code></pre>
                </div>
                <div class="file-edit-footer">
                    <span style="font-size:11px; color:var(--peak-secondary);">Generating...</span>
                </div>
            </div>
        `;
    });

    return processed;
}

function handleAssistStreamData(event, id, data) {
    if (id !== AI_ASSIST_SESSION_ID || !assistStreamingMessageRef) return;
    const assistContentArea = document.getElementById('streaming-message-container-assist');
    const assistScroller = document.getElementById('ai-assist-scroller');
    const assistMessageDiv = assistContentArea?.querySelector('.term-chat-msg.ai');

    if (data.type === 'data' && assistMessageDiv) {
        assistStreamingMessageRef.content += data.content;

        // DEBUG: Log stream progress (throttled or small chunks)
        // window.ipcRenderer.send('log:info', `[AI Stream] Chunk received (${data.content.length} chars)`);

        // Render Markdown AND Tools
        try {
            assistMessageDiv.innerHTML = renderTools(escapeHTML(assistStreamingMessageRef.content));
            if (window.lucide) window.lucide.createIcons();
        } catch (err) {
            console.error("[AI Assist] Render error:", err);
            // Fallback: Show raw content if rendering fails
            assistMessageDiv.innerText = assistStreamingMessageRef.content;
        }
        if (assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;

    } else if (data.type === 'end' || data.type === 'error') {
        console.log("[AI Assist] Stream Ended:", data.type);
        window.ipcRenderer.send('log:info', "[AI Assist] Stream Ended:", data.type, data.message || '');

        // DEBUG: Log the full generated response
        if (assistStreamingMessageRef) {
            window.ipcRenderer.send('log:info', "========== AI RESPONSE ==========");
            window.ipcRenderer.send('log:info', assistStreamingMessageRef.content || "(Empty Content)");
            window.ipcRenderer.send('log:info', "=================================");
        }

        stopAssistStream();
    }
}

// Helper for plain text rendering
function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

async function stopAssistStream() {
    if (!assistStreamingMessageRef) return;

    const finalContent = assistStreamingMessageRef.dataset.fullContent || '';
    const assistContentArea = document.getElementById('ai-assist-chat-thread');
    const chatThread = document.getElementById('ai-assist-chat-thread');

    // Remove streaming cursor/indicator
    const streamContainer = document.getElementById('streaming-message-container-assist');
    if (streamContainer) streamContainer.innerHTML = '';
    assistStreamingMessageRef = null;

    // Helper to escape HTML for plain text
    const escapeRaw = (str) => str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

    if (assistContentArea && chatThread) {
        // USE PLAIN TEXT (escapeHTML) instead of Markdown
        let renderedHtml = renderTools(escapeHTML(finalContent));

        // Auto-collapse thinking bubble when finished
        renderedHtml = renderedHtml.replace(/<details class="thinking-block" open/g, '<details class="thinking-block"');

        // Check if we have multiple actions to show "Accept All"
        // Count File Edits AND Tool Blocks
        // We need to match the specific buttons we render in renderTools
        const createCount = (renderedHtml.match(/class="[^"]*tool-create-btn/g) || []).length;
        const deleteCount = (renderedHtml.match(/class="[^"]*tool-delete-btn/g) || []).length;
        const runCount = (renderedHtml.match(/class="[^"]*tool-run-btn/g) || []).length;
        const applyCount = (renderedHtml.match(/class="[^"]*apply-msg-btn/g) || []).length;
        const searchCount = (renderedHtml.match(/class="[^"]*tool-search-btn/g) || []).length;

        const totalActions = createCount + deleteCount + runCount + applyCount + searchCount;

        console.log("[AI Assist] Stop Stream. Actions found:", { createCount, deleteCount, runCount, applyCount, searchCount, totalActions });
        window.ipcRenderer.send('log:info', "[AI Assist] Stop Stream. Actions found:", { createCount, deleteCount, runCount, applyCount, searchCount, totalActions });

        let acceptAllHtml = '';
        if (totalActions > 1) {
            acceptAllHtml = `
                <div style="margin-top:12px; display:flex; justify-content:flex-end;">
                    <button class="msg-action-btn accept-all-btn" style="background:var(--peak-accent); color:white; border:none;">
                        <i data-lucide="check-check" style="width:12px;"></i> Accept All (${totalActions})
                    </button>
                </div>
            `;
        }

        const finalMessageHtml = `
            <div class="term-chat-msg ai markdown-content">
                ${renderedHtml}
                
                <div class="raw-content" style="display:none;">${escapeRaw(finalContent)}</div>

                ${acceptAllHtml}

                <div class="message-actions" style="display:flex; gap:4px; margin-top:8px; opacity:0.7;">
                    <button class="msg-action-btn copy-msg-btn" title="Copy Entire Message">
                        <i data-lucide="copy" style="width:12px;"></i> Copy
                    </button>
                </div>
            </div>
        `;
        if (finalContent.trim() !== '') {
            chatThread.innerHTML += finalMessageHtml;
            chatHistory.push(finalMessageHtml); // NEW: Save to history
        }
        assistContentArea.innerHTML = '';
        assistContentArea.innerHTML = '';
        if (window.lucide) window.lucide.createIcons();
        setTimeout(() => { if (window.lucide) window.lucide.createIcons(); }, 100); // Double check
    }

    const submitButton = document.getElementById('ai-assist-submit-button');
    const stopButton = document.getElementById('ai-assist-stop-button');
    if (submitButton) submitButton.style.display = 'flex';
    if (stopButton) stopButton.style.display = 'none';

    const textarea = document.getElementById('ai-assist-input-textarea');
    if (textarea) {
        textarea.disabled = false;
        textarea.focus();
    }
    assistStreamingMessageRef = null;
}

function attachAIAssistListeners(currentFileContent, currentFilePath) {
    const container = document.getElementById('ai-assist-content');
    const parentContainer = container ? container.parentNode : document;

    // --- Tabs Logic ---
    const tabs = parentContainer.querySelectorAll('.tab-btn');
    const panels = parentContainer.querySelectorAll('.term-panel');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
            const target = parentContainer.querySelector(`#panel-${tab.dataset.target}`);
            if (target) {
                target.style.display = 'flex';
                target.classList.add('active');
                if (tab.dataset.target === 'tasks') loadTasks(); // Load tasks on click
            }
        });
    });

    // --- TASKS LOGIC ---
    const tasksContent = parentContainer.querySelector('#tasks-content');
    const btnRefreshTasks = parentContainer.querySelector('#btn-refresh-tasks');

    const loadTasks = async () => {
        if (!tasksContent) return;

        // Determine root path
        const freshContext = window.getProjectFileContext ? window.getProjectFileContext() : {};
        const activePath = freshContext.currentFilePath || currentFilePath;
        const root = window.currentProjectRoot || (activePath ? path.dirname(activePath) : null);

        if (!root) {
            tasksContent.innerHTML = '<div style="padding:20px; color:var(--peak-secondary); text-align:center;">Project root not found.<br>Open a file to initialize context.</div>';
            return;
        }

        try {
            const todoPath = path.join(root, 'TODO.md');
            const content = await ipcRenderer.invoke('project:read-file', todoPath);
            const timestamp = new Date().toLocaleTimeString();

            if (content && !content.error) {
                tasksContent.innerHTML = `
                    <div style="font-size:10px; color:var(--peak-secondary); text-align:right; margin-bottom:8px; opacity:0.6;">
                        Updated: ${timestamp}
                    </div>
                    ${escapeHTML(content)}
                `;
            } else {
                tasksContent.innerHTML = `
                    <div style="padding:30px 20px; text-align:center; color:var(--peak-secondary);">
                        <i data-lucide="clipboard-list" style="width:32px; height:32px; margin-bottom:12px; opacity:0.5;"></i>
                        <p style="margin-bottom:16px;">No Project Plan found.</p>
                        <div style="font-size:10px; opacity:0.5; margin-bottom:12px;">Looking in: ${todoPath}</div>
                        <button id="btn-generate-plan" style="padding:8px 16px; background:var(--peak-accent); color:white; border:none; border-radius:6px; cursor:pointer; font-size:12px; display:inline-flex; align-items:center; gap:6px;">
                            <i data-lucide="sparkles" style="width:14px; height:14px;"></i> Generate Plan
                        </button>
                    </div>
                `;
                if (window.lucide) window.lucide.createIcons();

                const btnGenerate = tasksContent.querySelector('#btn-generate-plan');
                if (btnGenerate) {
                    btnGenerate.addEventListener('click', async () => {
                        // Switch to Chat tab to show generation progress
                        const chatTab = parentContainer.querySelector('.tab-btn[data-target="ai"]');
                        if (chatTab) chatTab.click();

                        // Trigger AI generation
                        const textarea = document.getElementById('ai-assist-input-textarea');
                        const submitBtn = document.getElementById('ai-assist-submit-button');
                        if (textarea && submitBtn) {
                            textarea.value = "Please analyze the project structure and create a comprehensive `TODO.md` file with a prioritized implementation plan. Use the `create_file` tool.";
                            textarea.dispatchEvent(new Event('input')); // Trigger resize/validation
                            submitBtn.click();
                        }
                    });
                }
            }
        } catch (e) {
            tasksContent.innerHTML = `<div style="color:var(--error-color); padding:20px; text-align:center;">Error loading tasks: ${e.message}</div>`;
        }
    };

    if (btnRefreshTasks) btnRefreshTasks.addEventListener('click', loadTasks);
    // -------------------

    // --- Event Delegation for Chat Actions ---
    const onChatAction = async (e) => {
        // Handle Toggle Code Button
        const toggleBtn = e.target.closest('.toggle-code-btn');
        if (toggleBtn) {
            const card = toggleBtn.closest('.file-edit-card');
            const content = card.querySelector('.file-edit-content');
            const icon = toggleBtn.querySelector('svg');
            if (content.style.display === 'none') {
                content.style.display = 'block';
                toggleBtn.innerHTML = '<i data-lucide="chevron-up" style="width:14px; height:14px;"></i>';
            } else {
                content.style.display = 'none';
                toggleBtn.innerHTML = '<i data-lucide="chevron-down" style="width:14px; height:14px;"></i>';
            }
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Handle Accept All Button
        const acceptAllBtn = e.target.closest('.accept-all-btn');
        if (acceptAllBtn) {
            const msgDiv = acceptAllBtn.closest('.term-chat-msg');

            // Gather all actionable buttons
            const allActions = msgDiv.querySelectorAll('.apply-msg-btn, .tool-create-btn, .tool-run-btn');

            console.log("[AI Assist] Accept All triggered. Found actions:", allActions.length);
            window.ipcRenderer.send('log:info', "[AI Assist] Accept All triggered. Found actions:", allActions.length);

            allActions.forEach((btn, index) => {
                console.log(`[AI Assist] Triggering action ${index + 1}/${allActions.length}:`, btn.className);
                window.ipcRenderer.send('log:info', `[AI Assist] Triggering action ${index + 1}/${allActions.length}:`, btn.className);

                if (btn.classList.contains('apply-msg-btn')) {
                    const content = decodeURIComponent(btn.dataset.content);
                    window.dispatchEvent(new CustomEvent('peak-apply-file', { detail: content }));
                    btn.innerHTML = '<i data-lucide="check"></i> Applied';
                } else if (btn.classList.contains('tool-create-btn')) {
                    const path = decodeURIComponent(btn.dataset.path);
                    const content = decodeURIComponent(btn.dataset.content);
                    window.dispatchEvent(new CustomEvent('peak-create-file', { detail: { path, content } }));
                    btn.innerHTML = '<i data-lucide="check"></i> Created';
                } else if (btn.classList.contains('tool-run-btn')) {
                    const cmd = decodeURIComponent(btn.dataset.cmd);
                    window.dispatchEvent(new CustomEvent('peak-run-command', { detail: cmd }));
                    btn.innerHTML = '<i data-lucide="check"></i> Sent';
                }
                btn.disabled = true;
            });

            acceptAllBtn.innerHTML = '<i data-lucide="check-check"></i> All Actions Started';
            acceptAllBtn.disabled = true;

            // Force refresh tasks in case TODO.md was updated
            setTimeout(loadTasks, 1000);
            return;
        }

        const btn = e.target.closest('.msg-action-btn');
        if (!btn) return;

        const msgDiv = btn.closest('.term-chat-msg');
        if (!msgDiv && !btn.classList.contains('tool-run-btn') && !btn.classList.contains('tool-create-btn') && !btn.classList.contains('tool-search-btn')) return;

        // Extract content: Try to find the first code block, otherwise use raw content
        let contentToUse = '';
        if (msgDiv) {
            const rawContentDiv = msgDiv.querySelector('.raw-content');
            contentToUse = rawContentDiv ? rawContentDiv.textContent : msgDiv.innerText;
        }

        // Helper to extract code block
        const extractCode = (text) => {
            const match = text.match(/```[\w]*\n([\s\S]*?)```/);
            return match ? match[1] : text;
        };

        if (btn.classList.contains('copy-msg-btn')) {
            const { clipboard } = require('electron');
            clipboard.writeText(extractCode(contentToUse));
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="check"></i> Copied`;
            setTimeout(() => btn.innerHTML = originalHTML, 2000);
        } else if (btn.classList.contains('insert-msg-btn')) {
            window.dispatchEvent(new CustomEvent('peak-insert-code', { detail: extractCode(contentToUse) }));
        } else if (btn.classList.contains('apply-msg-btn')) {
            // NEW: Apply to File (Replace All)
            // If button has data-content (from File Edit Card), use it.
            const content = btn.dataset.content ? decodeURIComponent(btn.dataset.content) : extractCode(contentToUse);
            window.dispatchEvent(new CustomEvent('peak-apply-file', { detail: content }));

            // Visual Feedback
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="check"></i> Applied`;
            setTimeout(() => btn.innerHTML = originalHTML, 2000);

        } else if (btn.classList.contains('tool-run-btn')) {
            // TOOL: Run Command
            const cmd = decodeURIComponent(btn.dataset.cmd);
            window.dispatchEvent(new CustomEvent('peak-run-command', { detail: cmd }));
        } else if (btn.classList.contains('tool-create-btn')) {
            // TOOL: Create File
            const path = decodeURIComponent(btn.dataset.path);
            const content = decodeURIComponent(btn.dataset.content);
            window.dispatchEvent(new CustomEvent('peak-create-file', { detail: { path, content } }));
        } else if (btn.classList.contains('tool-delete-btn')) {
            // TOOL: Delete File
            const path = decodeURIComponent(btn.dataset.path);
            if (confirm(`Are you sure you want to delete ${path}?`)) {
                // We need a delete event or IPC. Let's use a new event.
                window.dispatchEvent(new CustomEvent('peak-delete-file', { detail: { path } }));
                btn.innerHTML = '<i data-lucide="trash"></i> Deleted';
                btn.disabled = true;
            }
        } else if (btn.classList.contains('tool-search-btn')) {
            // TOOL: Search Project
            const query = decodeURIComponent(btn.dataset.query);
            const chatThread = document.getElementById('ai-assist-chat-thread');

            // Show "Searching..." indicator
            const loadingId = 'search-loading-' + Date.now();
            chatThread.innerHTML += `<div id="${loadingId}" class="term-chat-msg system" style="font-size:12px; color:var(--peak-secondary); padding:8px 12px; text-align:center;">Searching for "${query}"...</div>`;

            try {
                const root = window.currentProjectRoot || (currentFilePath ? path.dirname(currentFilePath) : null);
                if (root) {
                    const results = await ipcRenderer.invoke('project:search-text', root, query);
                    const loadingEl = document.getElementById(loadingId);
                    if (loadingEl) loadingEl.remove();

                    let resultMsg = '';
                    if (results && results.length > 0) {
                        const snippets = results.map(r => `File: ${r.filePath} (Line ${r.line})\n${r.content}`).join('\n\n');
                        resultMsg = `**Search Results for "${query}":**\n\`\`\`\n${snippets}\n\`\`\``;
                    } else {
                        resultMsg = `**Search Results for "${query}":**\nNo matches found.`;
                    }

                    // Append System Message
                    const sysHtml = `
                        <div class="term-chat-msg system markdown-content" style="padding: 10px 14px; border-radius: 10px; font-size: 12px; background: var(--control-background-color); color: var(--peak-primary); margin-bottom: 12px; border: 1px solid var(--border-color);">
                            ${escapeHTML(resultMsg)}
                        </div>
                    `;
                    chatThread.innerHTML += sysHtml;
                    chatHistory.push(sysHtml);
                    const scroller = document.getElementById('ai-assist-scroller');
                    if (scroller) scroller.scrollTop = scroller.scrollHeight;
                }
            } catch (err) {
                console.error("Search failed:", err);
            }
        }
    };

    const chatThread = document.getElementById('ai-assist-chat-thread');
    if (chatThread) {
        chatThread.addEventListener('click', onChatAction);
        // NEW: Restore History
        if (chatHistory.length > 0) {
            chatThread.innerHTML = chatHistory.join('');
            setTimeout(() => {
                const scroller = document.getElementById('ai-assist-scroller');
                if (scroller) scroller.scrollTop = scroller.scrollHeight;
            }, 10);
        }
    }
    // -----------------------------------------

    // --- Live Preview Logic ---
    const liveInput = document.getElementById('live-url-input');
    const liveWebview = document.getElementById('inspector-live-view');
    const btnRefresh = document.getElementById('btn-live-refresh');
    const btnPopout = document.getElementById('btn-live-popout');

    if (liveInput && liveWebview) {
        const loadUrl = () => {
            let url = liveInput.value.trim();
            if (!url.startsWith('http')) url = 'http://' + url;
            liveWebview.src = url;
        };
        liveInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') loadUrl(); });
        if (btnRefresh) btnRefresh.addEventListener('click', () => liveWebview.reload());
        if (btnPopout) btnPopout.addEventListener('click', () => {
            if (window.tabManager) window.tabManager.handlePerformAction({ mode: 'Search', query: liveInput.value, engine: 'google' });
        });
    }

    const { currentFileContentError } = window.getProjectFileContext ? window.getProjectFileContext() : {};
    const isError = !!currentFileContentError;
    // Allow chat even if no file is open, as we now have project context
    const isFileContextUsable = true;

    const textarea = document.getElementById('ai-assist-input-textarea');
    const submitButton = document.getElementById('ai-assist-submit-button');
    const stopButton = document.getElementById('ai-assist-stop-button');
    const modelSelect = document.getElementById('ai-assist-model-select');
    const assistScroller = document.getElementById('ai-assist-scroller');

    // --- MODEL PERSISTENCE ---
    if (modelSelect) {
        // Restore saved model
        const savedModel = localStorage.getItem('peak-ai-model');
        if (savedModel) {
            // Verify if the saved model still exists in options
            const options = Array.from(modelSelect.options).map(o => o.value);
            if (options.includes(savedModel)) {
                modelSelect.value = savedModel;
            }
        }

        // Save on change
        modelSelect.addEventListener('change', () => {
            localStorage.setItem('peak-ai-model', modelSelect.value);
        });
    }
    // -------------------------

    // --- PROJECT CONTEXT FETCHING ---
    let projectFiles = [];
    const rootPath = window.currentProjectRoot || (currentFilePath ? path.dirname(currentFilePath) : null); // Fallback

    // Attempt to get the real project root from the renderer if available, otherwise guess
    // Ideally, the renderer should expose the project root. For now, we'll try to deduce it or ask main.
    // Since we don't have a direct "getProjectRoot" on window, we rely on where the current file is.
    // A better approach: The main process knows the open folder. 
    // Let's assume for now we can get it via IPC or just use the current file's dir as a starting point.
    // Actually, `window.fileExplorer` might have the root.

    // Let's try to fetch project files if we have a path
    if (rootPath) {
        ipcRenderer.invoke('get-project-files', rootPath).then(files => {
            projectFiles = files || [];
            console.log("[AI Assist] Loaded project files:", projectFiles.length);
        }).catch(e => console.error("[AI Assist] Failed to load project files:", e));
    }
    // --------------------------------

    assistLocalListener = handleAssistStreamData;
    ipcRenderer.on('llm-stream-data', assistLocalListener);

    const onInput = () => {
        if (!textarea) return;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
        const isValid = textarea.value.trim().length > 0 && !assistStreamingMessageRef;
        if (submitButton) {
            submitButton.disabled = !isValid;
            submitButton.style.opacity = isValid ? '1' : '0.3';
        }
    };

    if (textarea) {
        textarea.addEventListener('input', onInput);
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    const onSubmit = async (e) => {
        e?.preventDefault();
        const userPrompt = textarea.value;
        const model = modelSelect.value;
        if (userPrompt.trim().length === 0 || !!assistStreamingMessageRef) return;

        textarea.value = '';
        onInput();
        textarea.disabled = true;
        submitButton.style.display = 'none';
        stopButton.style.display = 'flex';

        const chatThread = document.getElementById('ai-assist-chat-thread');

        const userMsgHtml = `
            <div class="term-chat-msg user markdown-content" style="padding: 10px 14px; border-radius: 10px; font-size: 13px; line-height: 1.5; max-width: 95%; width: fit-content; overflow-wrap: anywhere; white-space: normal; box-sizing: border-box; background: var(--peak-accent); color: white; align-self: flex-end; margin-bottom: 12px;">
                ${escapeHTML(userPrompt)}
            </div>
        `;
        chatThread.innerHTML += userMsgHtml;
        chatHistory.push(userMsgHtml); // NEW: Save to history

        assistStreamingMessageRef = { role: 'assistant', content: '' };
        const assistContentArea = document.getElementById('streaming-message-container-assist');
        if (assistContentArea) {
            assistContentArea.innerHTML = `
                <div class="term-chat-msg ai markdown-content" style="padding: 0; font-size: 13px; line-height: 1.6; width: 100%; max-width: 100%; overflow-wrap: anywhere; background: transparent; color: var(--peak-primary); align-self: flex-start; margin-bottom: 12px;">
                    <details class="thinking-block" open style="border:none; background:transparent; padding:0;">
                        <summary style="list-style:none; cursor:pointer; display:flex; align-items:center; gap:8px; font-size:12px; color:var(--peak-primary);">
                            <i data-lucide="loader-2" class="spin" style="width:12px; height:12px; animation: spin 1s linear infinite;"></i> 
                            <span>Thinking...</span>
                        </summary>
                        <div class="thinking-content" style="padding-left:20px; margin-top:4px; font-size:13px; color:var(--peak-secondary); border-left: 1px solid var(--peak-border); margin-left: 5px;">

                        </div>
                    </details>
                </div>
                <style>
                    details.thinking-block > summary::-webkit-details-marker { display: none; }
                    details.thinking-block[open] > summary .arrow { transform: rotate(90deg); }
                </style>
            `;
            if (window.lucide) window.lucide.createIcons();
        }
        // Auto-run removed to prevent loops.
        if (assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;
        if (assistScroller) assistScroller.scrollTop = assistScroller.scrollHeight;

        // --- CONTEXT CONSTRUCTION ---
        let contextMsg = `CONTEXT:\n`;

        // Fetch FRESH context
        const freshContext = window.getProjectFileContext ? window.getProjectFileContext() : {};
        const activePath = freshContext.currentFilePath || currentFilePath;
        const activeContent = freshContext.currentFileContent !== undefined ? freshContext.currentFileContent : currentFileContent;

        // 1. Active File
        if (activePath) {
            const contentToUse = (activeContent && activeContent.trim().length > 0) ? activeContent : '(Empty File)';
            contextMsg += `Active File: "${path.basename(activePath)}"\nContent:\n\`\`\`${path.extname(activePath).substring(1)}\n${contentToUse}\n\`\`\`\n\n`;
        }

        // 2. Project Structure (Truncated if too large)
        if (projectFiles.length > 0) {
            const tree = projectFiles.slice(0, 500).join('\n'); // Limit to 500 files to avoid token limits
            contextMsg += `Project Structure (Top 500 files):\n${tree}\n\n`;
        }

        // 3. Smart File Fetching
        // Check if user mentioned any specific files in the prompt
        const mentionedFiles = projectFiles.filter(f => userPrompt.includes(path.basename(f)) || userPrompt.includes(f));
        if (mentionedFiles.length > 0) {
            contextMsg += `Referenced Files:\n`;
            for (const file of mentionedFiles.slice(0, 3)) { // Limit to 3 referenced files
                try {
                    const content = await ipcRenderer.invoke('project:read-file', path.join(rootPath, file));
                    if (content && !content.error) {
                        contextMsg += `File: "${file}"\nContent:\n\`\`\`\n${content}\n\`\`\`\n\n`;
                    }
                } catch (e) {
                    console.error("Failed to read referenced file:", file, e);
                }
            }
        }

        // --- SLASH COMMANDS ---
        // /terminal: Add last 20 lines of terminal output
        if (userPrompt.includes('/terminal')) {
            try {
                const terms = window.terminalInstances ? Object.values(window.terminalInstances) : [];
                if (terms.length > 0) {
                    // Use the last active terminal or just the first one
                    const term = terms[terms.length - 1];
                    if (term && term.buffer && term.buffer.active) {
                        const buffer = term.buffer.active;
                        const lines = [];
                        const start = Math.max(0, buffer.baseY + buffer.cursorY - 20);
                        const end = buffer.baseY + buffer.cursorY;
                        for (let i = start; i <= end; i++) {
                            const line = buffer.getLine(i);
                            if (line) lines.push(line.translateToString(true));
                        }
                        contextMsg += `Terminal Output (Last 20 lines):\n\`\`\`\n${lines.join('\n')}\n\`\`\`\n\n`;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch terminal output:", e);
            }
        }

        // /add @filename: Explicitly add a file
        const addMatch = userPrompt.match(/\/add\s+@?(\S+)/);
        if (addMatch) {
            const requestedFile = addMatch[1];
            // Try to find it in projectFiles to get full relative path
            const foundFile = projectFiles.find(f => f.endsWith(requestedFile));
            if (foundFile) {
                try {
                    const content = await ipcRenderer.invoke('project:read-file', path.join(rootPath, foundFile));
                    if (content && !content.error) {
                        contextMsg += `Explicitly Added File: "${foundFile}"\nContent:\n\`\`\`\n${content}\n\`\`\`\n\n`;
                    }
                } catch (e) {
                    console.error("Failed to read added file:", foundFile, e);
                }
            }
        }
        // ----------------------

        const fullPrompt = `${contextMsg}USER QUESTION: ${userPrompt}`;
        // ----------------------------

        const messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: fullPrompt }
        ];

        // DEBUG: Log the full conversation context
        const logData = {
            model,
            messageCount: messages.length,
            systemPromptLength: SYSTEM_PROMPT.length,
            userPromptLength: fullPrompt.length
        };
        console.log("[AI Assist] Sending Request:", logData);
        window.ipcRenderer.send('log:info', "========== AI REQUEST START ==========");
        window.ipcRenderer.send('log:info', "[AI Assist] Sending Request:", logData);

        window.ipcRenderer.send('llm-stream-request', AI_ASSIST_SESSION_ID, model, messages);
    };

    if (submitButton) submitButton.addEventListener('click', onSubmit);
    if (textarea) textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) onSubmit(e); });
    if (stopButton) stopButton.addEventListener('click', () => stopAssistStream('User aborted stream.'));

    // --- TERMINAL FEEDBACK LISTENER ---
    const onTerminalResponse = (e) => {
        const { cmd, output } = e.detail;
        const chatThread = document.getElementById('ai-assist-chat-thread');
        if (chatThread) {
            const sysHtml = `
                <div class="terminal-output-block">
                    <div class="header">
                        <i data-lucide="terminal" style="width:12px; height:12px;"></i>
                        <span>Output for \`${cmd}\`</span>
                    </div>
                    <div class="content">
                        <pre style="margin:0; font-family:monospace;">${output}</pre>
                    </div>
                </div>
            `;
            chatThread.innerHTML += sysHtml;
            chatHistory.push(sysHtml);
            const scroller = document.getElementById('ai-assist-scroller');
            if (scroller) scroller.scrollTop = scroller.scrollHeight;
        }
    };
    window.addEventListener('peak-terminal-response', onTerminalResponse);

    // Auto-refresh tasks when a file is created (likely TODO.md)
    const onFileCreated = (e) => {
        if (e.detail && e.detail.path && e.detail.path.includes('TODO.md')) {
            setTimeout(loadTasks, 500); // Keep as fallback
        }
    };
    window.addEventListener('peak-create-file', onFileCreated);

    // NEW: Listen for file system changes via IPC (More reliable)
    const onFileChanged = (e, { filename }) => {
        if (filename && filename.includes('TODO.md')) {
            console.log("[AI Assist] TODO.md changed, refreshing tasks...");
            loadTasks();
        }
    };
    ipcRenderer.on('project:files-changed', onFileChanged);

    // Fallback: Poll for task updates every 2 seconds (to handle edge cases where watch fails)
    // Task poller removed in favor of IPC events.
    // ----------------------------------

    if (window.lucide) window.lucide.createIcons();

    return () => {
        stopAssistStream();
        clearInterval(taskPoller); // Cleanup poller
        if (textarea) textarea.removeEventListener('input', onInput);
        if (submitButton) submitButton.removeEventListener('click', onSubmit);
        if (assistLocalListener) ipcRenderer.removeListener('llm-stream-data', assistLocalListener);
        window.removeEventListener('peak-terminal-response', onTerminalResponse);
        window.removeEventListener('peak-create-file', onFileCreated);
        ipcRenderer.removeListener('project:files-changed', onFileChanged);
    };
}

module.exports = { attachAIAssistListeners };