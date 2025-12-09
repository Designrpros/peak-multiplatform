const { renderMarkdown } = require('../../../utils/markdown');
const hljs = require('highlight.js');

// Import Card Components
const { renderThinkingCard } = require('../ui/cards/ThinkingCard');
const { renderCodeThinkingCard } = require('../ui/cards/CodeThinkingCard');
const { renderFileEditCard, renderGeneratingFileCard } = require('../ui/sub-cards/FileEditCard');
const { renderCommandCard } = require('../ui/sub-cards/CommandCard');
const { renderDeleteCard } = require('../ui/sub-cards/DeleteCard');
const { renderSearchCard } = require('../ui/sub-cards/SearchCard');
const { renderViewFileCard } = require('../ui/sub-cards/ViewFileCard');
const { renderGetProblemsCard } = require('../ui/sub-cards/ProblemsCard');
const { renderDelegationCard } = require('../ui/cards/DelegationCard');
const { renderSectionCard } = require('../ui/cards/SectionCard');
const { renderActiveFileCard } = require('../ui/sub-cards/ActiveFileCard');
const { renderTodoCard } = require('../ui/cards/TodoCard');
const { renderListDirectoryCard } = require('../ui/sub-cards/ListDirectoryCard');
const { renderAgentCard } = require('../ui/cards/AgentCard');
const { renderClarificationCard } = require('../ui/cards/ClarificationCard');
const { renderWebviewCard } = require('../ui/sub-cards/WebviewCard');
const { renderGenericToolCard } = require('../ui/sub-cards/GenericToolCard');
const { renderStepCard } = require('../ui/cards/StepCard');
const { renderPlanCard } = require('../ui/cards/PlanCard');
const ToolRegistry = require('../tools/ToolRegistry');

class StreamParser {
    constructor() {
        this.buffer = '';
        this.placeholders = new Map();
        this.placeholderCount = 0;
    }

    /**
     * Parses the current accumulated content and returns processed HTML.
     * @param {string} content - The raw content from the AI stream.
     * @returns {string} - The processed HTML with custom tags replaced by UI components.
     */
    parse(content) {
        // Reset placeholders for this parse run
        this.placeholders.clear();
        this.placeholderCount = 0;

        // PRE-NORMALIZE: Unwrap tool calls from AI hallucinations of system prompt formats
        // This must happen BEFORE filterSystemNoise, which blindly removes <usage> tags
        content = this.normalizeToolWrappers(content);

        // 0. AGGRESSIVE PRE-FILTER: Remove system prompts and tool definitions
        // This must happen BEFORE any HTML escaping or processing
        content = this.filterSystemNoise(content);

        // NEW: Hide incomplete tool tags at the end of the stream to prevent leaks
        // Moved AFTER normalization to catch tags exposed by wrapper removal
        content = this.hideIncompleteTags(content);

        // 1. Escape HTML first (to treat everything as text by default)
        let processed = this.escapeHTML(content);

        // 2. Process Thinking Blocks
        processed = this.processThinking(processed);

        // 3. Process Active File Context (New)
        processed = this.processActiveFileContext(processed);

        // 4. Process TODO updates
        processed = this.processTodo(processed);

        // 5. Process Steps (NEW) - Must be before tools so tools inside steps are processed later?
        // Actually, we want to process the CONTENT of the step recursively or simply let the markdown processor handle it?
        // If we create a placeholder for the step, the content inside needs to be fully processed HTML.
        // So we should process steps LAST? No, because we want to capture the structure.
        // We should process steps, and then process the *content* of the step.
        // But `parse` is called on the whole string.
        // If we replace <step>...</step> with a placeholder, the content inside is hidden from subsequent processors.
        // So we must process the content inside the step BEFORE creating the placeholder.
        processed = this.processSteps(processed);

        // 6. Process Tools (Tools might be outside steps too)
        processed = this.processTools(processed);

        // 7. Process Plans (NEW)
        processed = this.processPlans(processed);

        // 8. Final Pass: Render Markdown for non-placeholder text and restore placeholders
        return this.processMarkdownAndBoxing(processed);
    }

    /**
     * Hides incomplete tool tags at the very end of the string.
     * This prevents the parser from treating partial tags as text and leaking them.
     */
    hideIncompleteTags(content) {
        if (!content) return '';

        // Regex to match incomplete tags at the end of the string
        // Matches <tagName ... (without closing >)
        // ONLY matches if the opening tag itself is incomplete (no > found)
        const incompleteTagRegex = /<(?:tool|create_file|update_file|run_command|delete_file|search_project|list_directory|view_file|thinking|think|step|plan)[^>]*$/i;

        if (incompleteTagRegex.test(content)) {
            return content.replace(incompleteTagRegex, '');
        }
        return content;
    }

    /**
     * Unwraps tool calls that the AI has mistakenly wrapped in <tool_code>, <usage>, etc.
     * This rescues the tool call from being deleted by filterSystemNoise.
     */
    normalizeToolWrappers(content) {
        if (!content) return '';
        const originalLength = content.length;
        console.log('[StreamParser] normalizeToolWrappers INPUT:', content.substring(0, 500));

        // 1. Remove <tool_code> wrappers
        content = content.replace(/<\/?tool_code>/gi, '');
        content = content.replace(/&lt;\/?tool_code&gt;/gi, '');

        // 2. Remove <tool_name>...<tool_name> (just the tags and content inside if it's just a name)
        // We assume the actual tool call follows.
        content = content.replace(/<tool_name>.*?<\/tool_name>/gi, '');
        content = content.replace(/&lt;tool_name&gt;.*?&lt;\/tool_name&gt;/gi, '');

        // 3. Unwrap <usage>...<tool>...</tool>...</usage>
        // We only remove <usage> if it contains a <tool> tag.
        // This preserves the filterSystemNoise behavior for actual system prompt leakage (which doesn't have our tool calls inside).

        // Regex explanation:
        // <usage>\s*           : Match opening usage tag and whitespace
        // (<tool[\s\S]*?<\/tool>) : Capture the tool tag and its content (non-greedy)
        // \s*<\/usage>         : Match closing usage tag and whitespace
        content = content.replace(/<usage>\s*(<tool[\s\S]*?<\/tool>)\s*<\/usage>/gi, '$1');
        content = content.replace(/&lt;usage&gt;\s*(&lt;tool[\s\S]*?&lt;\/tool&gt;)\s*&lt;\/usage&gt;/gi, '$1');

        console.log('[StreamParser] normalizeToolWrappers OUTPUT:', content.substring(0, 500));
        console.log('[StreamParser] normalizeToolWrappers changed length:', originalLength, '->', content.length);
        return content;
    }



    processSteps(html) {
        // 1. Completed Steps
        const stepRegex = /(?:&lt;step\s+title="([^"]+)"&gt;|<step\s+title="([^"]+)">)([\s\S]*?)(?:&lt;\/step&gt;|<\/step>)/g;

        html = html.replace(stepRegex, (match, title1, title2, content) => {
            const title = title1 || title2;

            // Recursively process the content inside the step
            // We need to process tools, markdown, etc. inside the step.
            // Since we are inside `parse`, and we want to return a placeholder, 
            // we need to make sure the content is fully rendered HTML.

            // However, `processMarkdownAndBoxing` is called at the very end on the *whole* string.
            // If we return a placeholder now, `processMarkdownAndBoxing` won't touch the content inside.
            // So we must manually process the content here.

            // But wait! `processTools` hasn't run yet on the outer string.
            // If we run `processTools` on the inner content, we are good.
            // But what about `processThinking`? It already ran.

            // Let's refine the order:
            // 1. Escape HTML
            // 2. Process Steps -> Extract content -> Process Tools/Thinking/Markdown on content -> Create Placeholder
            // 3. Process remaining Tools/Thinking (outside steps)

            // Actually, simply calling `this.processTools` and then `this.processMarkdownAndBoxing` on the content is enough?
            // `processMarkdownAndBoxing` expects placeholders to be in `this.placeholders`.
            // If we generate new placeholders inside the step processing, they are added to `this.placeholders`.
            // So `processMarkdownAndBoxing(innerContent)` will work and return HTML with placeholders restored.

            // BUT `processMarkdownAndBoxing` splits by placeholders.

            // Let's do a mini-pipeline for step content:
            let inner = content;
            inner = this.processTools(inner); // Process tools inside
            inner = this.processMarkdownAndBoxing(inner); // Render markdown and restore placeholders

            return this.createPlaceholder(renderStepCard(title, inner, true));
        });

        // 2. Incomplete Step (Streaming)
        const incompleteStepRegex = /(?:&lt;step\s+title="([^"]+)"&gt;|<step\s+title="([^"]+)">)([\s\S]*)$/;
        html = html.replace(incompleteStepRegex, (match, title1, title2, content) => {
            const title = title1 || title2;

            // Same mini-pipeline
            let inner = content;
            inner = this.processTools(inner);
            inner = this.processMarkdownAndBoxing(inner);

            return this.createPlaceholder(renderStepCard(title, inner, false));
        });

        return html;
    }



    /**
     * Filters out system noise like tool definitions, mandatory rules, etc.
     * This prevents accidental leakage of system prompts into the UI.
     */
    filterSystemNoise(content) {
        if (!content) return '';
        const originalLength = content.length;
        console.log('[StreamParser] filterSystemNoise INPUT:', content.substring(0, 500));

        // Remove tool_definition blocks (both escaped and unescaped)
        content = content.replace(/\u003ctool_definition\u003e[\s\S]*?\u003c\/tool_definition\u003e/gi, '');
        content = content.replace(/\u0026lt;tool_definition\u0026gt;[\s\S]*?\u0026lt;\/tool_definition\u0026gt;/gi, '');

        // Remove MANDATORY RULES sections
        content = content.replace(/# MANDATORY RULES[\s\S]*?(?=\n#{1,2}\s|\n\n|$)/gi, '');

        // Remove "Start working now" instructions
        content = content.replace(/Start working now\. Use tools immediately\./gi, '');

        // Remove "Do not output code blocks for files" instructions
        content = content.replace(/Do not output code blocks for files\./gi, '');

        // Remove tool usage examples that might leak
        content = content.replace(/\u003cusage\u003e[\s\S]*?\u003c\/usage\u003e/gi, '');
        content = content.replace(/\u0026lt;usage\u0026gt;[\s\S]*?\u0026lt;\/usage\u0026gt;/gi, '');

        console.log('[StreamParser] filterSystemNoise OUTPUT:', content.substring(0, 500));
        console.log('[StreamParser] filterSystemNoise changed length:', originalLength, '->', content.length);
        return content;
    }

    createPlaceholder(html) {
        const id = `___BLOCK_PLACEHOLDER_${this.placeholderCount++}___`;
        this.placeholders.set(id, html);
        return id;
    }

    processActiveFileContext(html) {
        // Match: Current Active File: "path" [newline] Content: [newline] ``` [newline] content [newline] ``` [newline] [newline]
        const contextRegex = /Current Active File: "([^"]+)"\n(?:Content:\n```\n([\s\S]*?)\n```\n\n)?/g;

        return html.replace(contextRegex, (match, path, content) => {
            return this.createPlaceholder(renderActiveFileCard(path, content));
        });
    }

    processMarkdownAndBoxing(text) {
        // Regex to match our specific placeholder format
        const placeholderRegex = /(___BLOCK_PLACEHOLDER_\d+___)/g;

        const parts = text.split(placeholderRegex);

        return parts.map(part => {
            if (!part) return '';

            if (this.placeholders.has(part)) {
                // It's a placeholder, return the stored HTML
                return this.placeholders.get(part) || '';
            } else {
                // It's loose text. Unescape and render markdown.
                if (!part.trim()) return '';
                const unescaped = this.unescapeHTML(part);
                const rendered = renderMarkdown(unescaped);

                // Check if rendered content is effectively empty (e.g. just <p></p> or whitespace)
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rendered;
                const textContent = tempDiv.textContent || '';
                if (!textContent.trim() && !tempDiv.querySelector('img') && !tempDiv.querySelector('hr')) {
                    return '';
                }

                return `<div class="response-card markdown-content">${rendered}</div>`;
            }
        }).join('');
    }

    escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    unescapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/>/g, ">") // &gt; is handled by regex usually but let's be safe
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'");
    }

    processThinking(html) {
        const thinkingBlockRegex = /(?:&lt;thinking&gt;|<thinking>|&lt;think&gt;|<think>)([\s\S]*?)(?:&lt;\/thinking&gt;| வரும்<\/thinking>|<\/thinking>|&lt;\/think&gt;| வரும்<\/think>|<\/think>)/g;

        html = html.replace(thinkingBlockRegex, (match, content) => {
            // Remove code blocks first
            let cleanContent = content.replace(/```[\s\S]*?```/g, '').replace(/```/g, '');

            // Trim common indentation if possible, or just trim lines
            cleanContent = cleanContent.split('\n').map(line => line.trim()).join('\n').trim();

            return this.createPlaceholder(renderThinkingCard(cleanContent, true));
        });

        // Incomplete
        const incompleteThinkingRegex = /(?:&lt;thinking&gt;|<thinking>|&lt;think&gt;|<think>)([\s\S]*)$/;
        html = html.replace(incompleteThinkingRegex, (match, content) => {
            if (!content || !content.trim()) return match; // Don't create placeholder for empty thinking
            return this.createPlaceholder(renderThinkingCard(content.trim(), false));
        });

        return html;
    }

    processTodo(html) {
        const todoRegex = /(?:&lt;update_todo&gt;|<update_todo>)([\s\S]*?)(?:&lt;\/update_todo&gt;|<\/update_todo>)/g;
        return html.replace(todoRegex, (match, content) => {
            return this.createPlaceholder(renderTodoCard(content));
        });
    }
    processTools(html) {
        console.log('[StreamParser] processTools input length:', html.length);
        // Normalize tool tags
        let processed = html
            // NEW: Remove <tool_code> wrapper tags (sometimes output by AI)
            .replace(/<tool_code>([\s\S]*?)<\/tool_code>/g, '$1')
            .replace(/&lt;tool_code&gt;([\s\S]*?)&lt;\/tool_code&gt;/g, '$1')

            // NEW: Normalize self-closing tool tags first (Handle both unescaped and escaped)
            .replace(/&lt;tool\s+([\s\S]*?)\/&gt;/g, '<tool $1></tool>')
            .replace(/&lt;tool\s+([\s\S]*?)\/>/g, '<tool $1></tool>')

            .replace(/&lt;tool/g, '<tool')
            .replace(/&lt;\/tool>/g, '</tool>')
            .replace(/&lt;\/tool/g, '</tool>')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')  // Decode quotes for tool tag matching

            // Shorthand normalization
            .replace(/&lt;create_file/g, '<create_file')
            .replace(/&lt;\/create_file>/g, '</create_file>')
            .replace(/&lt;\/create_file&gt;/g, '</create_file>')

            .replace(/&lt;update_file/g, '<update_file')
            .replace(/&lt;\/update_file>/g, '</update_file>')
            .replace(/&lt;\/update_file&gt;/g, '</update_file>')

            .replace(/&lt;run_command/g, '<run_command')
            .replace(/&lt;\/run_command>/g, '</run_command>')
            .replace(/&lt;\/run_command&gt;/g, '</run_command>')

            .replace(/&lt;delete_file/g, '<delete_file')
            .replace(/&lt;\/delete_file>/g, '</delete_file>')
            .replace(/&lt;\/delete_file&gt;/g, '</delete_file>')

            .replace(/&lt;search_project/g, '<search_project')
            .replace(/&lt;\/search_project>/g, '</search_project>')
            .replace(/&lt;\/search_project&gt;/g, '</search_project>')

            .replace(/&lt;list_directory/g, '<list_directory')
            .replace(/&lt;\/list_directory>/g, '</list_directory>')
            .replace(/&lt;\/list_directory&gt;/g, '</list_directory>')

            .replace(/&lt;view_file/g, '<view_file')
            .replace(/&lt;\/view_file>/g, '</view_file>')
            .replace(/&lt;\/view_file&gt;/g, '</view_file>')

            .replace(/&lt;get_problems/g, '<get_problems')
            .replace(/&lt;\/get_problems>/g, '</get_problems>')
            .replace(/&lt;\/get_problems&gt;/g, '</get_problems>')

            .replace(/&lt;delegate_task/g, '<delegate_task')
            .replace(/&lt;\/delegate_task>/g, '</delegate_task>')
            .replace(/&lt;\/delegate_task&gt;/g, '</delegate_task>');

        // Ensure self-closing shorthands are expanded (e.g. <view_file ... /> -> <view_file ...></view_file>)
        // This must run AFTER the &lt; -> < replacements above
        processed = processed.replace(/<(create_file|update_file|run_command|delete_file|search_project|list_directory|view_file|get_problems|delegate_task)([^>]*?)\/>/g, '<$1$2></$1>')
            .replace(/<(create_file|update_file|run_command|delete_file|search_project|list_directory|view_file|get_problems|delegate_task)([^>]*?)\/&gt;/g, '<$1$2></$1>');

        console.log('[StreamParser] Processed HTML (normalized):', processed.substring(0, 500));

        // Clean up attributes
        processed = processed.replace(/<(tool|create_file|run_command|delete_file|search_project|list_directory)\s+([^>]+)>/g, (match, tag, attrs) => {
            const unescapedAttrs = attrs.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/\\"/g, '"');

            // Log Tool Intent
            try {
                const AgentLogger = require('../core/AgentLogger');
                AgentLogger.tool(`Tool Proposed: ${tag}`, {
                    tool: tag,
                    attributes: unescapedAttrs
                });
            } catch (e) { console.error('Logger error:', e); }

            return `<${tag} ${unescapedAttrs}>`;
        });

        // --- Standard Tools ---

        // Create File
        // Robust regex: Match tool with name="create_file", then extract path
        processed = processed.replace(/\u003ctool\s+([^\u003e]*name\s*=\s*["']create_file["'][^\u003e]*)\u003e([\s\S]*?)\u003c\/tool\u003e/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path=["']([^"']+)["']/);
            const path = pathMatch ? decodeURIComponent(pathMatch[1]) : null; // FIX: Decode path

            console.log('[StreamParser] Matched create_file (robust). Path:', path);

            if (!path) {
                console.warn('[StreamParser] Skipping create_file without path');
                return match; // Return original if no path
            }

            // Use code thinking card WITH the code content so it can be expanded
            // FIX: Unescape HTML content before passing to card, as parse() escapes it globally first
            return this.createPlaceholder(renderCodeThinkingCard('create_file', path, this.unescapeHTML(content.trim()), true));
        });

        // Update File Standard (Moved Up)
        // Robust regex: Match tool with name="update_file" (allowing spaces), then extract path
        processed = processed.replace(/\u003ctool\s+([^\u003e]*name\s*=\s*["']update_file["'][^\u003e]*)\u003e([\s\S]*?)\u003c\/tool\u003e/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path=["']([^"']+)["']/);
            const path = pathMatch ? decodeURIComponent(pathMatch[1]) : null; // FIX: Decode path

            console.log('[StreamParser] Matched update_file (robust). Path:', path);

            if (!path) {
                console.warn('[StreamParser] Skipping update_file without path');
                return match;
            }

            // Use code thinking card WITH the code content so it can be expanded
            // FIX: Unescape HTML content before passing to card
            return this.createPlaceholder(renderCodeThinkingCard('update_file', path, this.unescapeHTML(content.trim()), true));
        });

        // Edit File (Partial)
        processed = processed.replace(/\u003ctool\s+([^\u003e]*name\s*=\s*["']edit_file["'][^\u003e]*)\u003e([\s\S]*?)\u003c\/tool\u003e/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path=["']([^"']+)["']/);
            const path = pathMatch ? decodeURIComponent(pathMatch[1]) : null; // FIX: Decode path

            console.log('[StreamParser] Matched edit_file. Path:', path);

            if (!path) {
                console.warn('[StreamParser] Skipping edit_file without path');
                return match;
            }

            // FIX: Unescape HTML BEFORE passing to CodeThinkingCard 
            // Otherwise <<<<<<<< SEARCH becomes &lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt; SEARCH
            const unescapedContent = this.unescapeHTML(content.trim());
            return this.createPlaceholder(renderCodeThinkingCard('edit_file', path, unescapedContent, true));
        });

        // Unified Run Command Parsing (Standard + Shorthand)
        // Matches <tool name="run_command">...</tool> OR <run_command>...</run_command>
        const runCommandUnifiedRegex = /(?:<tool\s+[^>]*name=["']run_command["'][^>]*>|<run_command\s*[^>]*>)([\s\S]*?)(?:<\/tool>|<\/run_command>)/gi;

        processed = processed.replace(runCommandUnifiedRegex, (match, content) => {
            console.log('[StreamParser] Matched run_command (Unified). Content length:', content?.length);

            let cmd = content ? content.trim() : '';

            // If content is empty, check if it was passed as attribute
            if (!cmd) {
                const cmdAttrMatch = match.match(/cmd=["']([^"']+)["']/) || match.match(/command=["']([^"']+)["']/);
                if (cmdAttrMatch) {
                    cmd = cmdAttrMatch[1];
                }
            }

            if (!cmd) {
                console.warn('[StreamParser] Skipping run_command without command content');
                return match; // Return original if no command found
            }

            // Decode HTML entities in the command (e.g. &amp; -> &)
            cmd = this.unescapeHTML(cmd);

            // FIX: Remove </step> leakage if present (prevents bad parsing artifacts)
            cmd = cmd.replace(/<\/step>/gi, '').replace(/&lt;\/step&gt;/gi, '');

            console.log('[StreamParser] Rendering CommandCard for:', cmd.substring(0, 50));
            return this.createPlaceholder(renderCommandCard(cmd));
        });

        // Delete File
        processed = processed.replace(/<tool name="delete_file" path="(.*?)">([\s\S]*?)<\/tool>/g, (match, path) => {
            path = decodeURIComponent(path); // FIX: Decode path
            console.log('[StreamParser] Matched delete_file:', path);
            return this.createPlaceholder(renderDeleteCard(path));
        });

        // Search Project
        processed = processed.replace(/<tool name="search_project">([\s\S]*?)<\/tool>/g, (match, query) => {
            return this.createPlaceholder(renderSearchCard(query.trim()));
        });

        // Get Problems
        processed = processed.replace(/&lt;tool name="get_problems"&gt;([\s\S]*?)&lt;\/tool&gt;/g, (match) => {
            console.log('[StreamParser] Matched get_problems tool');
            return this.createPlaceholder(renderGetProblemsCard());
        });
        // Delete File Shorthand
        processed = processed.replace(/<delete_file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/delete_file>/g, (match, path) => {
            path = decodeURIComponent(path); // FIX: Decode path
            return this.createPlaceholder(renderDeleteCard(path));
        });

        // Delegate Task
        processed = processed.replace(/<tool name="delegate_task" agent_id="(.*?)" instruction="(.*?)">([\s\S]*?)<\/tool>/g, (match, agentId, instruction) => {
            return this.createPlaceholder(renderDelegationCard(agentId, instruction));
        });

        // List Directory
        processed = processed.replace(/<tool name="list_directory"([^>]*)>([\s\S]*?)<\/tool>/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path="([^"]+)"/);
            const recursiveMatch = attrs.match(/recursive="([^"]+)"/);
            const path = pathMatch ? decodeURIComponent(pathMatch[1]) : '.'; // FIX: Decode path
            const recursive = recursiveMatch ? recursiveMatch[1] : 'false';
            return this.createPlaceholder(renderListDirectoryCard(path, recursive));
        });

        // Agent Activity
        processed = processed.replace(/<agent name="([^"]+)" status="([^"]+)">/g, (match, name, status) => {
            return this.createPlaceholder(renderAgentCard(name, status));
        });

        // Clarification Request
        processed = processed.replace(/<clarification>([\s\S]*?)<\/clarification>/g, (match, content) => {
            return this.createPlaceholder(renderClarificationCard(content.trim()));
        });

        // Preview URL (Webview)
        processed = processed.replace(/<preview_url\s+url="([^"]+)"\s*\/>/g, (match, url) => {
            return this.createPlaceholder(renderWebviewCard(url));
        });
        // Handle self-closing or full tag
        processed = processed.replace(/<preview_url\s+url="([^"]+)">([\s\S]*?)<\/preview_url>/g, (match, url) => {
            return this.createPlaceholder(renderWebviewCard(url));
        });

        // --- Shorthand Tools ---

        // Create File Shorthand
        // Robust regex to handle quoted or unquoted paths
        const fileShorthandRegex = /<create_file\s+path=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/create_file>/g;
        processed = processed.replace(fileShorthandRegex, (match, path, content) => {
            path = decodeURIComponent(path); // FIX: Decode path
            console.log('[StreamParser] Matched create_file (shorthand):', path);
            // Use code thinking card instead of showing full content
            // FIX: Pass actual unescaped content instead of 'true'
            return this.createPlaceholder(renderCodeThinkingCard('create_file', path, this.unescapeHTML(content.trim()), true));
        });

        // Search Project Shorthand (Robust)
        processed = processed.replace(/<search_project>(?:([\s\S]*?)<\/search_project>)?/g, (match, query) => {
            return this.createPlaceholder(renderSearchCard(query ? query.trim() : ''));
        });

        // Delegate Task Shorthand
        processed = processed.replace(/<delegate_task agent_id="(.*?)" instruction="(.*?)">([\s\S]*?)<\/delegate_task>/g, (match, agentId, instruction) => {
            return this.createPlaceholder(renderDelegationCard(agentId, instruction));
        });

        // List Directory Shorthand (Robust: self-closing, single/double quotes)
        const listDirRegex = /<list_directory([^>]*?)>(?:([\s\S]*?)<\/list_directory>)?/g;
        processed = processed.replace(listDirRegex, (match, attrs, content) => {
            const pathMatch = attrs.match(/path=["']([^"']+)["']/) || attrs.match(/path=([^"'\s>]+)/);
            const recursiveMatch = attrs.match(/recursive=["']([^"']+)["']/) || attrs.match(/recursive=([^"'\s>]+)/);
            const path = pathMatch ? decodeURIComponent(pathMatch[1]) : '.'; // FIX: Decode path
            const recursive = recursiveMatch ? recursiveMatch[1] : 'false';
            return this.createPlaceholder(renderListDirectoryCard(path, recursive));
        });

        // --- Incomplete Tools ---

        // --- Incomplete Tools (Robust Generic Handlers) ---

        // View File Shorthand (Robust: self-closing, single/double quotes)
        const viewFileRegex = /<view_file\s+path=["']?([^"'\s>]+)["']?[^>]*>(?:[\s\S]*?<\/view_file>)?/g;
        processed = processed.replace(viewFileRegex, (match, path) => {
            path = decodeURIComponent(path); // FIX: Decode path
            console.log('[StreamParser] Matched view_file (shorthand):', path);
            return this.createPlaceholder(renderViewFileCard(path));
        });

        // View File Standard
        processed = processed.replace(/<tool\s+name="view_file"\s+path=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/tool>/g, (match, path, content) => {
            path = decodeURIComponent(path); // FIX: Decode path
            console.log('[StreamParser] Matched view_file (standard):', path);
            const cardHTML = renderViewFileCard(path);
            return this.createPlaceholder(cardHTML);
        });

        // Update File Shorthand
        // Robust regex to handle quoted or unquoted paths
        processed = processed.replace(/<update_file\s+path=["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/update_file>/g, (match, path, content) => {
            path = decodeURIComponent(path); // FIX: Decode path
            console.log('[StreamParser] Matched update_file (shorthand):', path);
            const rawContent = this.unescapeHTML(content.trim());
            // Skip if no content
            if (!rawContent) {
                console.warn('[StreamParser] Skipping update_file (shorthand) with empty content:', path);
                return '';
            }
            return this.createPlaceholder(renderFileEditCard(path, rawContent, 'update'));
        });

        // --- Incomplete Tools (Robust Generic Handlers) ---
        // MOVED TO END to avoid matching complete tools

        // 1. Generic Incomplete Standard Tool (<tool name="...">)
        const incompleteToolRegex = /<tool\s+([^>]+)>([\s\S]*)$/;
        processed = processed.replace(incompleteToolRegex, (match, attrs, content) => {
            // Parse attributes
            const args = {};
            let attrMatch;
            const attrRegex = /(\w+)="([^"]*)"/g;
            while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                args[attrMatch[1]] = this.unescapeHTML(attrMatch[2]);
            }

            const toolName = args.name;
            const path = args.path;

            if (toolName === 'create_file' && path) {
                console.log('[StreamParser] Matched incomplete create_file:', path);
                return this.createPlaceholder(renderCodeThinkingCard('create_file', path, content || '', false));
            }
            if (toolName === 'update_file' && path) {
                console.log('[StreamParser] Matched incomplete update_file:', path);
                return this.createPlaceholder(renderCodeThinkingCard('update_file', path, content || '', false));
            }
            if (toolName === 'run_command') {
                console.log('[StreamParser] Matched incomplete run_command');
                return this.createPlaceholder(renderCommandCard(content.trim(), null, true));
            }

            return match;
        });

        // 2. Generic Incomplete Shorthand Tool (<create_file ...>)
        const incompleteShorthandRegex = /<(create_file|update_file|run_command)\s*([^>]*)>([\s\S]*)$/;
        processed = processed.replace(incompleteShorthandRegex, (match, tagName, attrs, content) => {
            // Parse attributes
            const args = {};
            let attrMatch;
            const attrRegex = /(\w+)="([^"]*)"/g;
            while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                args[attrMatch[1]] = this.unescapeHTML(attrMatch[2]);
            }

            const path = args.path;

            if (tagName === 'create_file' && path) {
                console.log('[StreamParser] Matched incomplete create_file (shorthand):', path);
                return this.createPlaceholder(renderCodeThinkingCard('create_file', path, content || '', false));
            }
            if (tagName === 'update_file' && path) {
                console.log('[StreamParser] Matched incomplete update_file (shorthand):', path);
                return this.createPlaceholder(renderCodeThinkingCard('update_file', path, content || '', false));
            }
            if (tagName === 'run_command') {
                console.log('[StreamParser] Matched incomplete run_command (shorthand)');
                return this.createPlaceholder(renderCommandCard(content.trim(), null, true));
            }
            return match;
        });

        // Command Execution Result (System Message)
        // Format: [System] Command Execution Result:\nCommand: ...\nExit Code: ...\n\nOutput:\n```\n...\n```
        const commandResultRegex = /\[System\] Command Execution Result:\nCommand: (.*?)\nExit Code: (\d+)\n\nOutput:\n```\n([\s\S]*?)\n```/g;
        processed = processed.replace(commandResultRegex, (match, cmd, exitCode, output) => {
            console.log('[StreamParser] Matched Command Execution Result:', cmd);
            // Use renderCommandCard but with output pre-filled
            // We might need to adjust renderCommandCard to accept output as a second arg if it doesn't already
            // Checking CommandCard.js... yes, it accepts (cmd, output)
            return this.createPlaceholder(renderCommandCard(cmd.trim(), output));
        });

        // Get Problems Tool (Robust)
        processed = processed.replace(/<tool\s+[^>]*name=["']get_problems["'][^>]*>([\s\S]*?)<\/tool>/g, (match) => {
            console.log('[StreamParser] Matched get_problems tool (specific)');
            return this.createPlaceholder(renderGetProblemsCard());
        });

        // Generic MCP Tool Parser (Catch-all for unknown tools)
        // Matches <tool name="foo" arg1="bar">...</tool>
        processed = processed.replace(/<tool\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/tool>/g, (match, toolName, attrs, content) => {
            console.log(`[StreamParser] Matched generic tool: ${toolName}`);

            // Parse attributes into args object
            const args = {};
            const attrRegex = /(\w+)="([^"]*)"/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                args[attrMatch[1]] = this.unescapeHTML(attrMatch[2]);
            }

            // If content exists, it might be an argument too
            if (content && content.trim()) {
                if (!args.content && !args.code) {
                    args.content = this.unescapeHTML(content.trim());
                }
            }

            // FALLBACK: Check for known local tools that might have been missed by specific regexes
            if (toolName === 'get_problems') {
                console.log('[StreamParser] Generic handler caught get_problems - redirecting to specific card');
                return this.createPlaceholder(renderGetProblemsCard());
            }
            if (toolName === 'search_project') {
                return this.createPlaceholder(renderSearchCard(args.query || args.content || ''));
            }

            // Look up Server ID
            const cachedTools = ToolRegistry.getCachedTools();
            const toolDef = cachedTools.find(t => t.name === toolName);
            const serverId = toolDef ? toolDef.serverId : null;

            if (serverId) {
                return this.createPlaceholder(renderGenericToolCard(toolName, args, serverId));
            } else {
                // If no server ID found, render as generic with 'unknown' (or handle gracefully)
                console.warn(`[StreamParser] No server ID found for tool: ${toolName}`);
                return this.createPlaceholder(renderGenericToolCard(toolName, args, 'unknown'));
            }
        });

        return processed;
    }

    processSections(html) {
        const sectionRegex = /(<h2.*?>.*?<\/h2>)([\s\S]*?)(?=(<h2|$))/g;
        return html.replace(sectionRegex, (match, header, content) => {
            const title = header.replace(/<[^>]+>/g, '').trim();
            if (!content.trim()) return match;
            return this.createPlaceholder(renderSectionCard(title, content));
        });
    }

    processPlans(html) {
        // Match <plan>...</plan>
        const planRegex = /<plan>([\s\S]*?)<\/plan>/g;
        return html.replace(planRegex, (match, content) => {
            // Reconstruct the full XML for the card renderer
            const fullXml = `<plan>${content}</plan>`;
            return this.createPlaceholder(renderPlanCard(fullXml));
        });
    }
}

module.exports = StreamParser;
