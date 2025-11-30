/**
 * SummaryExtractor.js
 * Extracts concise summaries from AI response content
 */

class SummaryExtractor {
    /**
     * Extracts a structured summary from AI response content
     * @param {string} content - Full AI response text
     * @returns {Object} Summary object with keyPoints, actions, and stats
     */
    static extract(content) {
        if (!content || typeof content !== 'string') {
            return { keyPoints: [], actions: [], stats: {} };
        }

        const keyPoints = this.extractKeyPoints(content);
        const actions = this.extractActions(content);
        const stats = this.extractStats(content);

        return { keyPoints, actions, stats };
    }

    /**
     * Extract key bullet points from the content
     * @param {string} content - AI response content
     * @returns {Array<string>} Key points
     */
    static extractKeyPoints(content) {
        const points = [];

        // Extract lines starting with bullets, numbers, or checkmarks
        const bulletPattern = /^[\s]*(?:[-*+•]|✅|✓|\d+\.)\s+(.+)$/gm;
        let match;

        while ((match = bulletPattern.exec(content)) !== null) {
            const point = match[1].trim();
            // Skip if it's a code block or tool XML
            if (!point.includes('```') && !point.includes('<tool') && point.length > 10 && point.length < 150) {
                points.push(point);
            }
        }

        // If no bullet points found, extract first meaningful sentences
        if (points.length === 0) {
            const sentences = content
                .replace(/```[\s\S]*?```/g, '') // Remove code blocks
                .replace(/<[^>]+>/g, '') // Remove XML/HTML tags
                .split(/[.!?]\s+/)
                .filter(s => s.trim().length > 20 && s.trim().length < 150)
                .slice(0, 3);

            points.push(...sentences.map(s => s.trim()));
        }

        // Limit to 5 most important points
        return points.slice(0, 5);
    }

    /**
     * Extract actions/tool executions from content
     * @param {string} content - AI response content
     * @returns {Array<Object>} Actions with type and details
     */
    static extractActions(content) {
        const actions = [];

        // Match tool XML tags
        const toolPattern = /<tool\s+name="([^"]+)"[^>]*>|<(create_file|update_file|view_file|delete_file)/g;
        let match;

        while ((match = toolPattern.exec(content)) !== null) {
            const toolName = match[1] || match[2];
            if (toolName && !actions.some(a => a.type === toolName)) {
                actions.push({
                    type: toolName,
                    icon: this.getToolIcon(toolName)
                });
            }
        }

        // Match file paths being created/modified
        const filePattern = /(?:Created|Modified|Updated|Deleted|Fixed)\s+(?:file\s+)?`?([^`\s]+\.(?:js|ts|jsx|tsx|css|html|json|md))`?/gi;
        const files = new Set();

        while ((match = filePattern.exec(content)) !== null) {
            const filePath = match[1];
            if (filePath) {
                files.add(filePath);
            }
        }

        if (files.size > 0) {
            actions.push({
                type: 'file_modifications',
                count: files.size,
                icon: '📝'
            });
        }

        return actions;
    }

    /**
     * Extract statistics from the response
     * @param {string} content - AI response content
     * @returns {Object} Stats object
     */
    static extractStats(content) {
        const stats = {};

        // Count code blocks
        const codeBlocks = (content.match(/```/g) || []).length / 2;
        if (codeBlocks > 0) stats.codeBlocks = Math.floor(codeBlocks);

        // Count tool uses
        const tools = (content.match(/<tool\s+name=/g) || []).length;
        if (tools > 0) stats.tools = tools;

        // Count file references
        const files = new Set();
        const filePattern = /`([^`]+\.(?:js|ts|jsx|tsx|css|html|json|md))`/g;
        let match;
        while ((match = filePattern.exec(content)) !== null) {
            files.add(match[1]);
        }
        if (files.size > 0) stats.filesReferenced = files.size;

        return stats;
    }

    /**
     * Get icon for tool type
     * @param {string} toolName - Tool name
     * @returns {string} Icon character
     */
    static getToolIcon(toolName) {
        const icons = {
            'create_file': '➕',
            'update_file': '✏️',
            'view_file': '👁️',
            'delete_file': '🗑️',
            'run_command': '⚡',
            'search': '🔍',
            'delegate_task': '🤝'
        };
        return icons[toolName] || '🔧';
    }

    /**
     * Generate a one-line summary
     * @param {Object} summary - Full summary object
     * @returns {string} One-line summary
     */
    static generateOneLiner(summary) {
        const parts = [];

        if (summary.actions.length > 0) {
            const actionTypes = summary.actions.map(a => a.type).join(', ');
            parts.push(`Performed: ${actionTypes}`);
        }

        if (summary.stats.filesReferenced) {
            parts.push(`${summary.stats.filesReferenced} file(s)`);
        }

        if (summary.keyPoints.length > 0) {
            parts.push(summary.keyPoints[0].substring(0, 50) + (summary.keyPoints[0].length > 50 ? '...' : ''));
        }

        return parts.join(' • ') || 'AI Response';
    }
}

module.exports = SummaryExtractor;
