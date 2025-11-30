/**
 * ResponseSanitizer.js
 * Filters and cleans AI responses to remove internal conversation logs and metadata
 */

class ResponseSanitizer {
    /**
     * Sanitizes AI response content by removing internal logs, metadata, and conversation dumps
     * @param {string} content - Raw AI response content
     * @returns {string} - Cleaned content safe for display
     */
    static sanitize(content) {
        if (!content || typeof content !== 'string') {
            return content;
        }

        let cleaned = content;

        // 1. Remove JSON conversation dumps (timestamps, error objects, etc.)
        // Pattern: { "content": "...", "error": null, "timestamp": "..." }
        cleaned = cleaned.replace(/\{\s*"content":\s*"[\s\S]*?"\s*,\s*"error":\s*(?:null|"[^"]*")\s*,\s*"timestamp":\s*"[^"]*"\s*\}/g, '');

        // 2. Remove "proceeding automatically" system messages
        cleaned = cleaned.replace(/\(Proceeding automatically\.?\s*Please continue.*?\)/gi, '');
        cleaned = cleaned.replace(/\(Proceeding automatically\.?\)/gi, '');

        // 3. Remove conversation metadata blocks
        // Pattern: USER QUESTION: File Content: `path` followed by code blocks
        cleaned = cleaned.replace(/USER QUESTION:\s*File Content:\s*`[^`]+`\s*```[\s\S]*?```/g, '');
        cleaned = cleaned.replace(/USER QUESTION:\s*Command executed:[\s\S]*?```[\s\S]*?```/g, '');
        cleaned = cleaned.replace(/USER QUESTION:\s*Directory Listing for[\s\S]*?```[\s\S]*?```/g, '');

        // 4. Remove internal conversation markers
        cleaned = cleaned.replace(/Current Active File:.*?\n/g, '');
        cleaned = cleaned.replace(/\[Main\] Starting stream for model:.*?\n/g, '');
        cleaned = cleaned.replace(/\[OpenRouter Service\]:.*?\n/g, '');
        cleaned = cleaned.replace(/\[Renderer\] LLM RESPONSE:.*?\n/g, '');

        // 5. Remove comment annotations like "// ... (implementation remains unchanged)"
        cleaned = cleaned.replace(/\/\/\s*\.\.\.\s*\([^)]*implementation[^)]*\)/gi, '');

        // 6. Remove references to unrelated projects (Secret Santa, etc.)
        // Only remove if it's clearly context bleeding (multiple paragraphs about unrelated code)
        const secretSantaPattern = /(?:secret[\s-]?santa|wishlist\s*manager|group\s*creation)/gi;
        const lines = cleaned.split('\n');
        let consecutiveUnrelatedLines = 0;
        const filteredLines = lines.filter(line => {
            const isUnrelated = secretSantaPattern.test(line) && !line.includes('```');
            if (isUnrelated) {
                consecutiveUnrelatedLines++;
                // Only filter if we see multiple consecutive unrelated lines (context bleeding)
                return consecutiveUnrelatedLines <= 2;
            } else {
                consecutiveUnrelatedLines = 0;
                return true;
            }
        });
        cleaned = filteredLines.join('\n');

        // 7. Remove Step Id markers
        cleaned = cleaned.replace(/Step Id:\s*\d+\s*\n/g, '');

        // 8. Trim excessive newlines (more than 3 consecutive)
        cleaned = cleaned.replace(/\n{4,}/g, '\n\n\n');

        // 9. Trim leading/trailing whitespace
        cleaned = cleaned.trim();

        return cleaned;
    }

    /**
     * Quick check if content appears to be internal conversation logs
     * @param {string} content - Content to check
     * @returns {boolean} - True if content appears to be internal logs
     */
    static isInternalLog(content) {
        if (!content || typeof content !== 'string') {
            return false;
        }

        const internalPatterns = [
            /"content":\s*"[\s\S]*?"\s*,\s*"error":/,  // JSON response format
            /Step Id:\s*\d+/,                           // Step ID markers
            /\(Proceeding automatically/,               // Auto-proceed messages
            /USER QUESTION:\s*File Content:/,           // File content dumps
            /\[Main\] Starting stream/,                 // Internal stream markers
            /Current Active File:/                      // Active file markers
        ];

        // If content matches 2 or more internal patterns, it's likely internal logs
        const matchCount = internalPatterns.filter(pattern => pattern.test(content)).length;
        return matchCount >= 2;
    }
}

module.exports = ResponseSanitizer;
