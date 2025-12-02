const { renderMarkdown } = require('../../../utils/markdown');
const hljs = require('highlight.js');

// Import Card Components
const { renderThinkingCard } = require('../ui/cards/ThinkingCard');
const { renderCodeThinkingCard } = require('../ui/cards/CodeThinkingCard');
const { renderFileEditCard, renderGeneratingFileCard } = require('../ui/cards/FileEditCard');
const { renderCommandCard } = require('../ui/cards/CommandCard');
const { renderDeleteCard } = require('../ui/cards/DeleteCard');
const { renderSearchCard } = require('../ui/cards/SearchCard');
const { renderViewFileCard } = require('../ui/cards/ViewFileCard');
const { renderGetProblemsCard } = require('../ui/cards/ProblemsCard');
const { renderDelegationCard } = require('../ui/cards/DelegationCard');
const { renderSectionCard } = require('../ui/cards/SectionCard');
const { renderActiveFileCard } = require('../ui/cards/ActiveFileCard');
const { renderTodoCard } = require('../ui/cards/TodoCard');
const { renderListDirectoryCard } = require('../ui/cards/ListDirectoryCard');
const { renderAgentCard } = require('../ui/cards/AgentCard');
const { renderClarificationCard } = require('../ui/cards/ClarificationCard');
const { renderWebviewCard } = require('../ui/cards/WebviewCard');
const { renderGenericToolCard } = require('../ui/cards/GenericToolCard');
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

        // 1. Escape HTML first (to treat everything as text by default)
        let processed = this.escapeHTML(content);

        // 2. Process Thinking Blocks
        processed = this.processThinking(processed);

        // 3. Process Active File Context (New)
        processed = this.processActiveFileContext(processed);

        // 4. Process TODO updates
        processed = this.processTodo(processed);

        // 5. Process Tools
        processed = this.processTools(processed);

        // 6. Process Sections (Disabled: TaskCard handles phase grouping now)
        // processed = this.processSections(processed);

        // 7. Final Pass: Render Markdown for non-placeholder text and restore placeholders
        return this.processMarkdownAndBoxing(processed);
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
                if (!tempDiv.textContent.trim() && !tempDiv.querySelector('img') && !tempDiv.querySelector('hr')) {
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
            .replace(/&lt;tool/g, '<tool')
            .replace(/&lt;\/tool>/g, '</tool>')
            .replace(/&lt;\/tool/g, '</tool>')
            .replace(/&gt;/g, '>')
            // Shorthand normalization
            .replace(/&lt;create_file/g, '<create_file')
            .replace(/&lt;\/create_file>/g, '</create_file>')
            .replace(/&lt;run_command/g, '<run_command')
            .replace(/&lt;\/run_command>/g, '</run_command>')
            .replace(/&lt;delete_file/g, '<delete_file')
            .replace(/&lt;\/delete_file>/g, '</delete_file>')
            .replace(/&lt;search_project/g, '<search_project')
            .replace(/&lt;\/search_project>/g, '</search_project>');
        // Move > replacement to end to avoid breaking regexes expecting &gt;
        // .replace(/&gt;/g, '>') 
        ;

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
            const path = pathMatch ? pathMatch[1] : null;

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
            const path = pathMatch ? pathMatch[1] : null;

            console.log('[StreamParser] Matched update_file (robust). Path:', path);

            if (!path) {
                console.warn('[StreamParser] Skipping update_file without path');
                return match;
            }

            // Use code thinking card WITH the code content so it can be expanded
            // FIX: Unescape HTML content before passing to card
            return this.createPlaceholder(renderCodeThinkingCard('update_file', path, this.unescapeHTML(content.trim()), true));
        });

        // Unified Run Command Parsing (Standard + Shorthand)
        // Matches <tool name="run_command">...</tool> OR <run_command>...</run_command>
        const runCommandUnifiedRegex = /(?:<tool\s+[^>]*name=["']run_command["'][^>]*>|<run_command\s*[^>]*>)([\s\S]*?)(?:<\/tool>|<\/run_command>)/gi;

        processed = processed.replace(runCommandUnifiedRegex, (match, content) => {
            console.log('[StreamParser] Matched run_command (Unified). Content length:', content?.length);

            let cmd = content ? content.trim() : '';

            // If content is empty, check if it was passed as an attribute in the opening tag (rare but possible)
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

            console.log('[StreamParser] Rendering CommandCard for:', cmd.substring(0, 50));
            return this.createPlaceholder(renderCommandCard(cmd));
        });

        // Delete File
        processed = processed.replace(/<tool name="delete_file" path="(.*?)">([\s\S]*?)<\/tool>/g, (match, path) => {
            console.log('[StreamParser] Matched delete_file:', path);
            return this.createPlaceholder(renderDeleteCard(path));
        });

        // Search Project
        processed = processed.replace(/<tool name="search_project">([\s\S]*?)<\/tool>/g, (match, query) => {
            return this.createPlaceholder(renderSearchCard(query.trim()));
        });

        // Get Problems
        processed = processed.replace(/<tool name="get_problems">([\s\S]*?)<\/tool>/g, (match) => {
            return this.createPlaceholder(renderGetProblemsCard());
        });
        // Delete File Shorthand
        processed = processed.replace(/<delete_file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/delete_file>/g, (match, path) => {
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
            const path = pathMatch ? pathMatch[1] : '.';
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
        const fileShorthandRegex = /\u003ccreate_file\s+path="([^"]+)"[^\u003e]*\u003e([\s\S]*?)\u003c\/create_file\u003e/g;
        processed = processed.replace(fileShorthandRegex, (match, path, content) => {
            console.log('[StreamParser] Matched create_file (shorthand):', path);
            // Use code thinking card instead of showing full content
            // FIX: Pass actual unescaped content instead of 'true'
            return this.createPlaceholder(renderCodeThinkingCard('create_file', path, this.unescapeHTML(content.trim()), true));
        });

        // Search Project Shorthand
        processed = processed.replace(/<search_project>([\s\S]*?)<\/search_project>/g, (match, query) => {
            return this.createPlaceholder(renderSearchCard(query.trim()));
        });

        // Delegate Task Shorthand
        processed = processed.replace(/<delegate_task agent_id="(.*?)" instruction="(.*?)">([\s\S]*?)<\/delegate_task>/g, (match, agentId, instruction) => {
            return this.createPlaceholder(renderDelegationCard(agentId, instruction));
        });

        // List Directory Shorthand
        processed = processed.replace(/<list_directory([^>]*)>([\s\S]*?)<\/list_directory>/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path=["']([^"']+)["']/);
            const recursiveMatch = attrs.match(/recursive=["']([^"']+)["']/);
            const path = pathMatch ? pathMatch[1] : '.';
            const recursive = recursiveMatch ? recursiveMatch[1] : 'false';
            return this.createPlaceholder(renderListDirectoryCard(path, recursive));
        });

        // --- Incomplete Tools ---

        // Incomplete Create File (Standard)
        const incompleteFileRegex = /\u003ctool\s+(?:name="create_file"\s+path="([^"]+)"|path="([^"]+)"\s+name="create_file")[^\u003e]*\u003e([\s\S]*)$/;
        processed = processed.replace(incompleteFileRegex, (match, p1, p2, content) => {
            const path = p1 || p2;
            console.log('[StreamParser] Matched incomplete create_file:', path);
            // Only show generating card if we have a path
            if (!path) return match;
            // FIX: Pass empty content and false for isComplete
            return this.createPlaceholder(renderCodeThinkingCard('create_file', path, '', false));
        });

        // Incomplete Create File (Shorthand)
        const incompleteFileShorthandRegex = /\u003ccreate_file\s+path="([^"]+)"[^\u003e]*\u003e([\s\S]*)$/;
        processed = processed.replace(incompleteFileShorthandRegex, (match, path, content) => {
            console.log('[StreamParser] Matched incomplete create_file (shorthand):', path);
            // FIX: Pass empty content and false for isComplete
            return this.createPlaceholder(renderCodeThinkingCard('create_file', path, '', false));
        });

        // Incomplete Update File (Shorthand)
        const incompleteUpdateShorthandRegex = /\u003cupdate_file\s+path="([^"]+)"[^\u003e]*\u003e([\s\S]*)$/;
        processed = processed.replace(incompleteUpdateShorthandRegex, (match, path, content) => {
            console.log('[StreamParser] Matched incomplete update_file (shorthand):', path);
            // FIX: Pass empty content and false for isComplete
            return this.createPlaceholder(renderCodeThinkingCard('update_file', path, '', false));
        });

        // Incomplete Update File (Standard)
        const incompleteUpdateRegex = /\u003ctool\s+name="update_file"\s+path="([^"]+)"[^\u003e]*\u003e([\s\S]*)$/;
        processed = processed.replace(incompleteUpdateRegex, (match, path, content) => {
            console.log('[StreamParser] Matched incomplete update_file:', path);
            // FIX: Pass empty content and false for isComplete
            return this.createPlaceholder(renderCodeThinkingCard('update_file', path, '', false));
        });

        // Incomplete Run Command (Shorthand)
        const incompleteRunCommandRegex = /<run_command>([\s\S]*)$/;
        processed = processed.replace(incompleteRunCommandRegex, (match, content) => {
            console.log('[StreamParser] Matched incomplete run_command:', content);
            // Render command card with partial content
            return this.createPlaceholder(renderCommandCard(content.trim()));
        });

        // Incomplete Run Command (Standard)
        const incompleteStandardRunCommandRegex = /<tool\s+[^>]*name="run_command"[^>]*>([\s\S]*)$/;
        processed = processed.replace(incompleteStandardRunCommandRegex, (match, content) => {
            console.log('[StreamParser] Matched incomplete standard run_command:', content);
            // Render command card with partial content
            return this.createPlaceholder(renderCommandCard(content.trim()));
        });

        // View File Shorthand
        processed = processed.replace(/<view_file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/view_file>/g, (match, path) => {
            return this.createPlaceholder(renderViewFileCard(path));
        });

        // View File Standard
        processed = processed.replace(/<tool\s+name="view_file"\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/tool>/g, (match, path) => {
            return this.createPlaceholder(renderViewFileCard(path));
        });

        // Update File Shorthand
        processed = processed.replace(/<update_file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/update_file>/g, (match, path, content) => {
            console.log('[StreamParser] Matched update_file (shorthand):', path);
            const rawContent = this.unescapeHTML(content.trim());
            // Skip if no content
            if (!rawContent) {
                console.warn('[StreamParser] Skipping update_file (shorthand) with empty content:', path);
                return '';
            }
            return this.createPlaceholder(renderFileEditCard(path, rawContent, 'update'));
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

        // Generic MCP Tool Parser (Catch-all for unknown tools)
        // Matches <tool name="foo" arg1="bar">...</tool>
        processed = processed.replace(/<tool\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/tool>/g, (match, toolName, attrs, content) => {
            // Check if this tool was already handled by specific parsers
            // We do this by checking if the match was already replaced by a placeholder
            // But since we are iterating, we can't easily check that.
            // Instead, we rely on the order. Specific parsers run first.
            // However, regexes run on the *current* string.
            // If specific parsers replaced the tag with a placeholder, this regex won't match it.
            // BUT, specific parsers use specific regexes (e.g. name="create_file").
            // This regex matches ANY name. So it WILL match "create_file" if it wasn't replaced.
            // Wait, specific parsers replace with placeholders (IDs).
            // So if create_file was replaced, it's now ___BLOCK_PLACEHOLDER_X___.
            // This regex won't match that.
            // So we are safe to catch remaining tools here.

            console.log(`[StreamParser] Matched generic tool: ${toolName}`);

            // Parse attributes into args object
            const args = {};
            const attrRegex = /(\w+)="([^"]*)"/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                args[attrMatch[1]] = this.unescapeHTML(attrMatch[2]);
            }

            // If content exists, it might be an argument too (like 'content' or 'code')
            // But usually MCP tools put args in attributes.
            // If content is non-empty, we might want to treat it as a specific arg if we knew the schema.
            // For now, we ignore content for args unless it's explicitly mapped?
            // Or maybe we put it in a 'content' arg if not present?
            if (content && content.trim()) {
                // Heuristic: if 'content' arg is missing, use the body
                if (!args.content && !args.code) {
                    args.content = this.unescapeHTML(content.trim());
                }
            }

            // Look up Server ID
            const cachedTools = ToolRegistry.getCachedTools();
            const toolDef = cachedTools.find(t => t.name === toolName);
            const serverId = toolDef ? toolDef.serverId : null;

            if (serverId) {
                return this.createPlaceholder(renderGenericToolCard(toolName, args, serverId));
            } else {
                // If no server ID found, it might be a local tool that wasn't handled specifically?
                // Or an unknown tool.
                // We render it as a generic card anyway, maybe with 'unknown' server?
                // Or fallback to text?
                // Let's render it, maybe user knows what to do.
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
}

module.exports = StreamParser;
