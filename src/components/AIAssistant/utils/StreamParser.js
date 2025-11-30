const { renderMarkdown } = require('../../../utils/markdown');
const hljs = require('highlight.js');

// Import Card Components
const { renderThinkingCard } = require('../ui/cards/ThinkingCard');
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

        // 6. Process Sections
        processed = this.processSections(processed);

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
            .replace(/&lt;\/tool&gt;/g, '</tool>')
            .replace(/&lt;\/tool/g, '</tool>')
            .replace(/&gt;/g, '>')
            // Shorthand normalization
            .replace(/&lt;create_file/g, '<create_file')
            .replace(/&lt;\/create_file&gt;/g, '</create_file>')
            .replace(/&lt;run_command/g, '<run_command')
            .replace(/&lt;\/run_command&gt;/g, '</run_command>')
            .replace(/&lt;delete_file/g, '<delete_file')
            .replace(/&lt;\/delete_file&gt;/g, '</delete_file>')
            .replace(/&lt;search_project/g, '<search_project')
            .replace(/&lt;\/search_project&gt;/g, '</search_project>');

        // Clean up attributes
        processed = processed.replace(/<(tool|create_file|run_command|delete_file|search_project|list_directory)\s+([^>]+)>/g, (match, tag, attrs) => {
            const unescapedAttrs = attrs.replace(/&quot;/g, '"').replace(/&#34;/g, '"').replace(/\\"/g, '"');
            return `<${tag} ${unescapedAttrs}>`;
        });

        // --- Standard Tools ---

        // Create File
        // Robust regex: Match tool with name="create_file", then extract path
        processed = processed.replace(/<tool\s+([^>]*name="create_file"[^>]*)>([\s\S]*?)<\/tool>/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path="([^"]+)"/);
            const path = pathMatch ? pathMatch[1] : null;

            console.log('[StreamParser] Matched create_file (robust). Path:', path);

            if (!path) {
                console.warn('[StreamParser] Skipping create_file without path');
                return match; // Return original if no path
            }

            const rawContent = this.unescapeHTML(content.trim());
            // Skip if no content
            if (!rawContent) {
                console.warn('[StreamParser] Skipping create_file with empty content:', path);
                return '';
            }
            return this.createPlaceholder(renderFileEditCard(path, rawContent, 'create'));
        });

        // Update File Standard (Moved Up)
        // Robust regex: Match tool with name="update_file" (allowing spaces), then extract path
        processed = processed.replace(/<tool\s+([^>]*name\s*=\s*"update_file"[^>]*)>([\s\S]*?)<\/tool>/g, (match, attrs, content) => {
            const pathMatch = attrs.match(/path="([^"]+)"/);
            const path = pathMatch ? pathMatch[1] : null;

            console.log('[StreamParser] Matched update_file (robust). Path:', path);

            if (!path) {
                console.warn('[StreamParser] Skipping update_file without path');
                return match;
            }

            const rawContent = this.unescapeHTML(content.trim());
            // Skip if no content
            if (!rawContent) {
                console.warn('[StreamParser] Skipping update_file with empty content:', path);
                return '';
            }
            return this.createPlaceholder(renderFileEditCard(path, rawContent, 'update'));
        });

        // Run Command
        processed = processed.replace(/<tool\s+name="run_command"[^>]*>([\s\S]*?)<\/tool>/g, (match, cmd) => {
            console.log('[StreamParser] Matched run_command');
            return this.createPlaceholder(renderCommandCard(cmd.trim()));
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

        // --- Shorthand Tools ---

        // Create File Shorthand
        const fileShorthandRegex = /<create_file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/create_file>/g;
        processed = processed.replace(fileShorthandRegex, (match, path, content) => {
            console.log('[StreamParser] Matched create_file (shorthand):', path);
            const rawContent = this.unescapeHTML(content.trim());
            // Skip if no content
            if (!rawContent) {
                console.warn('[StreamParser] Skipping create_file (shorthand) with empty content:', path);
                return '';
            }
            return this.createPlaceholder(renderFileEditCard(path, rawContent, 'create'));
        });

        // Run Command Shorthand
        processed = processed.replace(/<run_command>([\s\S]*?)<\/run_command>/g, (match, cmd) => {
            return this.createPlaceholder(renderCommandCard(cmd.trim()));
        });

        // Delete File Shorthand
        processed = processed.replace(/<delete_file\s+path="([^"]+)"[^>]*>([\s\S]*?)<\/delete_file>/g, (match, path) => {
            return this.createPlaceholder(renderDeleteCard(path));
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
            const pathMatch = attrs.match(/path="([^"]+)"/);
            const recursiveMatch = attrs.match(/recursive="([^"]+)"/);
            const path = pathMatch ? pathMatch[1] : '.';
            const recursive = recursiveMatch ? recursiveMatch[1] : 'false';
            return this.createPlaceholder(renderListDirectoryCard(path, recursive));
        });

        // --- Incomplete Tools ---

        // Incomplete Create File (Standard)
        const incompleteFileRegex = /<tool\s+(?:name="create_file"\s+path="([^"]+)"|path="([^"]+)"\s+name="create_file")[^>]*>([\s\S]*)$/;
        processed = processed.replace(incompleteFileRegex, (match, p1, p2, content) => {
            const path = p1 || p2;
            console.log('[StreamParser] Matched incomplete create_file:', path);
            const rawContent = this.unescapeHTML(content);
            // Allow empty content for generating cards to show immediately
            return this.createPlaceholder(renderGeneratingFileCard(path, rawContent));
        });

        // Incomplete Create File (Shorthand)
        const incompleteFileShorthandRegex = /<create_file\s+path="([^"]+)"[^>]*>([\s\S]*)$/;
        processed = processed.replace(incompleteFileShorthandRegex, (match, path, content) => {
            console.log('[StreamParser] Matched incomplete create_file (shorthand):', path);
            const rawContent = this.unescapeHTML(content);
            // Allow empty content for generating cards to show immediately
            return this.createPlaceholder(renderGeneratingFileCard(path, rawContent));
        });

        // Incomplete Update File (Shorthand)
        const incompleteUpdateShorthandRegex = /<update_file\s+path="([^"]+)"[^>]*>([\s\S]*)$/;
        processed = processed.replace(incompleteUpdateShorthandRegex, (match, path, content) => {
            console.log('[StreamParser] Matched incomplete update_file (shorthand):', path);
            const rawContent = this.unescapeHTML(content);
            // Allow empty content for generating cards to show immediately
            return this.createPlaceholder(renderGeneratingFileCard(path, rawContent));
        });

        // Incomplete Update File (Standard)
        const incompleteUpdateRegex = /<tool\s+name="update_file"\s+path="([^"]+)"[^>]*>([\s\S]*)$/;
        processed = processed.replace(incompleteUpdateRegex, (match, path, content) => {
            console.log('[StreamParser] Matched incomplete update_file:', path);
            const rawContent = this.unescapeHTML(content);
            // Allow empty content for generating cards to show immediately
            return this.createPlaceholder(renderGeneratingFileCard(path, rawContent));
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
