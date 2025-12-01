/**
 * DocsRegistry.js
 * Registry of available documentation sources.
 */

const DocsRegistry = [
    // --- Languages ---
    { id: 'doc-js', name: 'JavaScript', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript', type: 'external', category: 'Languages', icon: 'file-code' },
    { id: 'doc-ts', name: 'TypeScript', url: 'https://www.typescriptlang.org/docs/', type: 'external', category: 'Languages', icon: 'file-code' },
    { id: 'doc-py', name: 'Python', url: 'https://docs.python.org/3/', type: 'external', category: 'Languages', icon: 'file-code' },
    { id: 'doc-swift', name: 'Swift', url: 'https://docs.swift.org/swift-book/', type: 'external', category: 'Languages', icon: 'file-code' },
    { id: 'doc-rust', name: 'Rust', url: 'https://doc.rust-lang.org/book/', type: 'external', category: 'Languages', icon: 'file-code' },
    { id: 'doc-go', name: 'Go', url: 'https://go.dev/doc/', type: 'external', category: 'Languages', icon: 'file-code' },

    // --- Frameworks ---
    { id: 'doc-react', name: 'React', url: 'https://react.dev/', type: 'external', category: 'Frameworks', icon: 'layout' },
    { id: 'doc-next', name: 'Next.js', url: 'https://nextjs.org/docs', type: 'external', category: 'Frameworks', icon: 'layout' },
    { id: 'doc-vue', name: 'Vue.js', url: 'https://vuejs.org/guide/introduction.html', type: 'external', category: 'Frameworks', icon: 'layout' },
    { id: 'doc-tailwind', name: 'Tailwind CSS', url: 'https://tailwindcss.com/docs', type: 'external', category: 'Frameworks', icon: 'palette' },
    { id: 'doc-electron', name: 'Electron', url: 'https://www.electronjs.org/docs/latest/', type: 'external', category: 'Frameworks', icon: 'monitor' },

    // --- MCP Servers (Local Docs) ---
    // { id: 'mcp-all', name: 'All MCP Servers', filename: 'all-mcp-servers.md', type: 'local', category: 'MCP Servers', icon: 'server' },
    // Note: MCP Server docs are now handled dynamically via the MCP Store.
    // We can add them back here if we want to support local markdown files for them.

    // --- General ---
    { id: 'doc-devdocs', name: 'DevDocs', url: 'https://devdocs.io', type: 'external', category: 'General', icon: 'book' },
    { id: 'doc-mcp-repo', name: 'MCP Servers Repo', url: 'https://github.com/modelcontextprotocol/servers', type: 'external', category: 'General', icon: 'github' }

    // Note: External docs require the 'puppeteer' MCP server (or similar) to be enabled for the AI to read them.
];

module.exports = DocsRegistry;
