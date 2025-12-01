/**
 * mcp-catalog.js
 * Defines the available MCP servers for the Store.
 */

module.exports = [
    {
        id: 'filesystem',
        name: 'Filesystem',
        description: 'Secure access to local files and directories.',
        type: 'official',
        requiresKey: false,
        npm: '@modelcontextprotocol/server-filesystem',
        args: ['[homedir]'] // Special placeholder for home directory
    },

    {
        id: 'memory',
        name: 'Memory',
        description: 'Persistent knowledge graph across conversations.',
        type: 'official',
        requiresKey: false,
        npm: '@modelcontextprotocol/server-memory'
    },
    {
        id: 'github',
        name: 'GitHub',
        description: 'Manage issues, PRs, and repositories.',
        type: 'official',
        requiresKey: true,
        keyName: 'GITHUB_PERSONAL_ACCESS_TOKEN',
        npm: '@modelcontextprotocol/server-github'
    },
    {
        id: 'puppeteer',
        name: 'Puppeteer (Browser)',
        description: 'Browser automation and web scraping. Allows reading external documentation and websites.',
        type: 'stdio',
        requiresKeys: [],
        npmPackage: '@modelcontextprotocol/server-puppeteer',
        binary: 'mcp-server-puppeteer',
        args: []
    }
];
