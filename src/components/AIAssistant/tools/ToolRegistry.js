/**
 * ToolRegistry.js
 * Central registry for all available MCP tools.
 */

const CreateFile = require('./CreateFile');
const RunCommand = require('./RunCommand');
const DeleteFile = require('./DeleteFile');
const SearchProject = require('./SearchProject');

const ViewFile = require('./ViewFile');
const UpdateFile = require('./UpdateFile');
const EditFile = require('./EditFile');
const GetProblems = require('./GetProblems');
const CaptureLiveView = require('./CaptureLiveView');
// const ReadURL = require('./ReadURL');
const ListDirectory = require('./ListDirectory');
const DelegateTask = require('./DelegateTask');

const tools = [
    CreateFile,
    UpdateFile,
    EditFile,
    RunCommand,
    DeleteFile,
    SearchProject,
    ViewFile,
    ListDirectory,
    GetProblems,
    CaptureLiveView,
    // ReadURL, // Replaced by MCP Puppeteer Server
    ListDirectory,
    DelegateTask
];

const { ipcRenderer } = require('electron');

class ToolRegistry {
    // Cache for tools (initialized with local tools)
    static cachedTools = [...tools];

    static getCachedTools() {
        return this.cachedTools;
    }

    static async getTools() {
        // 1. Get Local Tools
        let allTools = [...tools];

        // 2. Get Remote MCP Tools via IPC
        try {
            const remoteTools = await ipcRenderer.invoke('mcp:get-tools');

            const formattedRemote = remoteTools.map(t => ({
                name: t.name,
                description: t.description,
                serverId: t.serverId, // Important for routing
                usage: this.generateXmlUsage(t) // Helper to create XML example
            }));

            allTools = [...allTools, ...formattedRemote];
        } catch (e) {
            console.error("Failed to fetch MCP tools", e);
        }

        // Update cache
        this.cachedTools = allTools;

        return allTools;
    }

    static generateXmlUsage(tool) {
        // Auto-generate XML usage example from JSON Schema
        const args = Object.keys(tool.inputSchema.properties || {})
            .map(key => `${key}="..."`)
            .join(' ');
        return `<tool name="${tool.name}" ${args}>\n</tool>`;
    }

    static async getSystemPromptTools() {
        const allTools = await this.getTools();
        console.log('[ToolRegistry] getSystemPromptTools called. Tool count:', allTools.length);
        if (allTools.length === 0) console.warn('[ToolRegistry] No tools found!');

        return allTools.map(tool => {
            return `
<tool_definition>
<name>${tool.name}</name>
<description>${tool.description}</description>
<usage>
${tool.usage.trim()}
</usage>
</tool_definition>
            `.trim();
        }).join('\n\n');
    }
}

module.exports = ToolRegistry;
