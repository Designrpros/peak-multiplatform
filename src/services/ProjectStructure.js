const fs = require('fs');
const path = require('path');

/**
 * Service for generating project structure trees for AI context
 */
class ProjectStructure {
    constructor() {
        this.cache = new Map();
        this.excludeDirs = new Set([
            'node_modules',
            '.git',
            '.next',
            'build',
            'dist',
            'out',
            '.cache',
            'coverage',
            '.vscode',
            '.idea',
            '__pycache__',
            '.pytest_cache',
            'vendor'
        ]);
    }

    /**
     * Generate a concise directory tree
     * @param {string} rootPath - Project root path
     * @param {number} maxDepth - Maximum depth to traverse (default: 3)
     * @returns {string} Markdown formatted tree
     */
    generateTree(rootPath, maxDepth = 3) {
        const cacheKey = `${rootPath}:${maxDepth}`;

        // Check cache
        if (this.cache.has(cacheKey)) {
            const cached = this.cache.get(cacheKey);
            if (Date.now() - cached.timestamp < 30000) { // 30s cache
                return cached.tree;
            }
        }

        const tree = this._buildTree(rootPath, '', 0, maxDepth);
        const result = `\`\`\`\n${tree}\`\`\``;

        // Cache result
        this.cache.set(cacheKey, {
            tree: result,
            timestamp: Date.now()
        });

        return result;
    }

    /**
     * Recursively build directory tree
     * @private
     */
    _buildTree(dirPath, prefix, currentDepth, maxDepth) {
        if (currentDepth >= maxDepth) {
            return '';
        }

        let output = '';

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            // Sort: directories first, then files
            const sorted = entries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            // Filter out excluded directories and hidden files (except important ones)
            const filtered = sorted.filter(entry => {
                if (entry.name.startsWith('.') &&
                    !['..gitignore', '.env.example', '.peak'].includes(entry.name)) {
                    return false;
                }
                if (entry.isDirectory() && this.excludeDirs.has(entry.name)) {
                    return false;
                }
                return true;
            });

            // Limit to prevent massive trees
            const limited = filtered.slice(0, 50);

            limited.forEach((entry, index) => {
                const isLast = index === limited.length - 1;
                const connector = isLast ? '└── ' : '├── ';
                const nextPrefix = prefix + (isLast ? '    ' : '│   ');

                if (entry.isDirectory()) {
                    output += `${prefix}${connector}${entry.name}/\n`;
                    const subPath = path.join(dirPath, entry.name);
                    output += this._buildTree(subPath, nextPrefix, currentDepth + 1, maxDepth);
                } else {
                    // Only show important file types
                    if (this._isRelevantFile(entry.name)) {
                        output += `${prefix}${connector}${entry.name}\n`;
                    }
                }
            });

            if (filtered.length > limited.length) {
                output += `${prefix}... (${filtered.length - limited.length} more items)\n`;
            }

        } catch (err) {
            console.error(`Error reading directory ${dirPath}:`, err.message);
        }

        return output;
    }

    /**
     * Check if file is relevant to show in tree
     * @private
     */
    _isRelevantFile(filename) {
        const relevant = [
            // Config files
            'package.json', 'tsconfig.json', 'next.config.js', 'next.config.ts',
            'vite.config.js', 'webpack.config.js', '.eslintrc', 'tailwind.config.js',
            'README.md', '.gitignore', '.env.example',
            // Common source files (show all in src directories)
            '.js', '.jsx', '.ts', '.tsx', '.vue', '.py', '.go', '.rs', '.java',
            '.css', '.scss', '.sass', '.html'
        ];

        return relevant.some(ext =>
            filename.endsWith(ext) || filename === ext || filename.includes(ext)
        );
    }

    /**
     * Invalidate cache for a specific path
     */
    invalidateCache(rootPath) {
        const keysToDelete = [];
        for (const key of this.cache.keys()) {
            if (key.startsWith(rootPath + ':')) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
    }

    /**
     * Clear all cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Get a summary of key directories
     */
    getDirectorySummary(rootPath) {
        const common = {
            'src': 'Source code',
            'components': 'UI components',
            'pages': 'Page components (Next.js)',
            'app': 'App directory (Next.js 13+)',
            'public': 'Static assets',
            'lib': 'Utility libraries',
            'utils': 'Utility functions',
            'styles': 'CSS/styling files',
            'api': 'API routes',
            'services': 'Service layer',
            'hooks': 'Custom React hooks',
            'context': 'React context providers',
            'types': 'TypeScript type definitions'
        };

        const found = [];
        try {
            const entries = fs.readdirSync(rootPath, { withFileTypes: true });
            entries.forEach(entry => {
                if (entry.isDirectory() && common[entry.name]) {
                    found.push(`- \`${entry.name}/\`: ${common[entry.name]}`);
                }
            });
        } catch (err) {
            console.error('Error reading directory summary:', err);
        }

        return found.length > 0 ? found.join('\n') : 'Standard project structure';
    }
}

module.exports = new ProjectStructure();
