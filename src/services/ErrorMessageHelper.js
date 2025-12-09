const fs = require('fs');
const path = require('path');

/**
 * Utility for generating helpful error messages with path suggestions
 */
class ErrorMessageHelper {
    /**
     * Find similar paths in the project for "did you mean?" suggestions
     * @param {string} projectRoot - Project root path
     * @param {string} attemptedPath - The path that wasn't found
     * @param {number} maxSuggestions - Max number of suggestions (default: 3)
     * @returns {string[]} Array of similar paths
     */
    findSimilarPaths(projectRoot, attemptedPath, maxSuggestions = 3) {
        if (!projectRoot || !attemptedPath) return [];

        const basename = path.basename(attemptedPath);
        const suggestions = [];

        try {
            // Recursively search for files with the same name
            this._searchForFile(projectRoot, basename, suggestions, 0, 4); // max depth 4

            // Sort by similarity (prefer shorter paths)
            suggestions.sort((a, b) => a.length - b.length);

            return suggestions.slice(0, maxSuggestions);
        } catch (err) {
            console.error('[ErrorMessageHelper] Error finding similar paths:', err);
            return [];
        }
    }

    /**
     * Recursively search for files
     * @private
     */
    _searchForFile(dir, filename, results, currentDepth, maxDepth) {
        if (currentDepth >= maxDepth || results.length >= 10) {
            return;
        }

        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });

            for (const entry of entries) {
                // Skip excluded directories
                if (entry.isDirectory()) {
                    const excluded = ['node_modules', '.git', '.next', 'build', 'dist', 'out'];
                    if (excluded.includes(entry.name)) continue;

                    const subdir = path.join(dir, entry.name);
                    this._searchForFile(subdir, filename, results, currentDepth + 1, maxDepth);
                } else if (entry.name === filename) {
                    const fullPath = path.join(dir, entry.name);
                    results.push(fullPath);
                }
            }
        } catch (err) {
            // Ignore permission errors
        }
    }

    /**
     * Create an enhanced error message for file not found
     * @param {string} projectRoot - Project root path
     * @param {string} attemptedPath - The path that wasn't found
     * @param {string} errorType - Type of operation (e.g., "Write", "Read")
     * @returns {string} Enhanced error message
     */
    fileNotFoundMessage(projectRoot, attemptedPath, errorType = 'File operation') {
        const suggestions = this.findSimilarPaths(projectRoot, attemptedPath);

        let message = `${errorType} failed: File not found at '${attemptedPath}'`;

        if (suggestions.length > 0) {
            message += '\n\nDid you mean one of these?';
            suggestions.forEach(suggestion => {
                const relativePath = path.relative(projectRoot, suggestion);
                message += `\n  • ${relativePath}`;
            });

            message += '\n\nTip: Check the project structure in the PROJECT CONTEXT section above.';
        } else {
            message += '\n\nThe file does not exist in the project. Check the project structure and ensure the path is correct.';
        }

        return message;
    }

    /**
     * Create an enhanced error message for command failures
     * @param {string} command - Command that failed
     * @param {string} error - Error output
     * @param {number} exitCode - Exit code
     * @returns {string} Enhanced error message
     */
    commandFailureMessage(command, error, exitCode) {
        let message = `Command failed with exit code ${exitCode}: ${command}\n\n`;
        message += `Error output:\n${error}`;

        // Add common troubleshooting tips
        if (error.includes('ENOENT') || error.includes('command not found')) {
            message += '\n\nTip: The command or file was not found. Make sure it exists and is in PATH.';
        } else if (error.includes('EACCES') || error.includes('permission denied')) {
            message += '\n\nTip: Permission denied. You may need to run with appropriate permissions.';
        } else if (error.includes('EADDRINUSE') || error.includes('port') && error.includes('use')) {
            message += '\n\nTip: Port is already in use. Stop the other process or use a different port.';
        }

        return message;
    }
}

module.exports = new ErrorMessageHelper();
