/**
 * StreamProcessor.js
 * 
 * Processes raw AI streams into structured operations.
 * Replaces StreamParser with cleaner architecture.
 * 
 * Responsibilities:
 * - Parse AI stream content
 * - Detect tool calls, thinking blocks, text, phase changes
 * - Sanitize content
 * - Emit structured events (not HTML!)
 */

const StateStore = require('../core/StateStore');

class StreamProcessor {
    constructor() {
        // Subscribe to stream updates
        StateStore.subscribeTo('conversation.currentStream', (stream) => {
            if (stream && stream.status === 'streaming') {
                this.processStream(stream.content);
            }
        });

        this.lastProcessedLength = 0;
        this.operations = []; // Array of parsed operations
    }

    /**
     * Process raw AI stream content
     * @param {string} rawContent - Raw AI response content
     */
    processStream(rawContent) {
        // Only process new content
        if (rawContent.length <= this.lastProcessedLength) {
            return;
        }

        const newContent = rawContent.slice(this.lastProcessedLength);
        this.lastProcessedLength = rawContent.length;

        // Parse new content
        const operations = this._parseContent(newContent);

        // Add to operations list
        this.operations.push(...operations);

        // Emit operations to StateStore for UI consumption
        for (const op of operations) {
            StateStore.emit('stream:operation', op);
        }
    }

    /**
     * Reset processor (for new stream)
     */
    reset() {
        this.lastProcessedLength = 0;
        this.operations = [];
    }

    /**
     * Get all parsed operations
     */
    getOperations() {
        return [...this.operations];
    }

    // ==================== Private Methods ====================

    _parseContent(content) {
        const operations = [];

        // Sanitize content first
        const sanitized = this._sanitize(content);

        // Parse different operation types
        // 1. Tool calls
        const toolCalls = this._extractToolCalls(sanitized);
        operations.push(...toolCalls);

        // 2. Headers (phase changes)
        const headers = this._extractHeaders(sanitized);
        operations.push(...headers);

        // 3. Thinking blocks
        const thinking = this._extractThinkingBlocks(sanitized);
        operations.push(...thinking);

        // 4. Regular text (if not captured above)
        const text = this._extractText(sanitized, [...toolCalls, ...headers, ...thinking]);
        if (text) {
            operations.push(text);
        }

        return operations;
    }

    _sanitize(content) {
        // Remove system noise
        let clean = content;

        // Remove tool_definition blocks
        clean = clean.replace(/<tool_definition>[\s\S]*?<\/tool_definition>/gi, '');

        // Remove common system messages
        clean = clean.replace(/Start working now\. Use tools immediately\./gi, '');

        // Remove internal conversation patterns (if detected)
        if (this._isInternalLog(clean)) {
            console.warn('[StreamProcessor] Detected internal logs, sanitizing...');
            // Extract only the AI's actual response
            const lastAssistant = clean.lastIndexOf('Assistant:');
            if (lastAssistant !== -1) {
                clean = clean.slice(lastAssistant + 'Assistant:'.length);
            }
        }

        return clean.trim();
    }

    _isInternalLog(content) {
        // Detect if content contains internal conversation logs
        const markers = ['User:', 'Assistant:', 'System:'];
        const count = markers.reduce((acc, marker) =>
            acc + (content.match(new RegExp(marker, 'g')) || []).length, 0
        );
        return count > 2; // More than 2 role markers = internal log
    }

    _extractToolCalls(content) {
        const toolCalls = [];
        const regex = /<tool\s+name="([^"]+)"([^>]*)>(.*?)<\/tool>/gis;
        let match;

        while ((match = regex.exec(content)) !== null) {
            const [fullMatch, toolName, attributes, toolContent] = match;

            // Parse attributes
            const attrs = this._parseAttributes(attributes);

            toolCalls.push({
                type: 'tool_call',
                id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                toolName: toolName,
                args: attrs,
                content: toolContent.trim(),
                raw: fullMatch
            });
        }

        return toolCalls;
    }

    _extractHeaders(content) {
        const headers = [];

        // Match markdown headers (## PHASE 1, etc.)
        const headerRegex = /^#{1,6}\s+(.+)$/gm;
        let match;

        while ((match = headerRegex.exec(content)) !== null) {
            const [fullMatch, headerText] = match;

            // Check if it's a phase change
            const isPhase = /PHASE \d+/i.test(headerText) ||
                /PLAN|EXECUTE|REVIEW/i.test(headerText);

            if (isPhase) {
                headers.push({
                    type: 'phase_change',
                    id: `phase-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    title: headerText.trim(),
                    raw: fullMatch
                });
            } else {
                headers.push({
                    type: 'header',
                    id: `header-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    title: headerText.trim(),
                    raw: fullMatch
                });
            }
        }

        return headers;
    }

    _extractThinkingBlocks(content) {
        const thinking = [];
        const regex = /<thinking>(.*?)<\/thinking>/gis;
        let match;

        while ((match = regex.exec(content)) !== null) {
            const [fullMatch, thinkingContent] = match;

            thinking.push({
                type: 'thinking',
                id: `thinking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                content: thinkingContent.trim(),
                raw: fullMatch
            });
        }

        return thinking;
    }

    _extractText(content, existingOperations) {
        // Remove already-parsed content
        let remaining = content;

        for (const op of existingOperations) {
            if (op.raw) {
                remaining = remaining.replace(op.raw, '');
            }
        }

        remaining = remaining.trim();

        if (remaining.length > 0) {
            return {
                type: 'text',
                id: `text-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                content: remaining,
                raw: remaining
            };
        }

        return null;
    }

    _parseAttributes(attrString) {
        const attrs = {};
        const regex = /(\w+)="([^"]*)"/g;
        let match;

        while ((match = regex.exec(attrString)) !== null) {
            const [, key, value] = match;
            attrs[key] = value;
        }

        return attrs;
    }
}

// Singleton instance
const instance = new StreamProcessor();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakStreamProcessor = instance;
}

module.exports = instance;
