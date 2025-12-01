const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");

class MCPHost {
    constructor() {
        this.connections = new Map(); // serverName -> Client
    }

    async connectToServer(name, command, args, env = {}) {
        console.log(`[MCPHost] Connecting to ${name}...`);

        const transport = new StdioClientTransport({
            command: command,
            args: args,
            env: { ...process.env, ...env }
        });

        const client = new Client({
            name: "Peak-IDE-Client",
            version: "1.0.0",
        }, {
            capabilities: {
                prompts: {},
                resources: {},
                tools: {},
            },
        });

        await client.connect(transport);
        this.connections.set(name, client);
        console.log(`[MCPHost] Connected to ${name}`);
        return client;
    }

    async getAllTools() {
        const allTools = [];
        for (const [serverName, client] of this.connections.entries()) {
            const result = await client.listTools();
            // Tag tools with server name to route execution later
            const taggedTools = result.tools.map(t => ({
                ...t,
                serverId: serverName
            }));
            allTools.push(...taggedTools);
        }
        return allTools;
    }

    async callTool(serverId, toolName, args) {
        const client = this.connections.get(serverId);
        if (!client) throw new Error(`Server ${serverId} not found`);
        return await client.callTool({
            name: toolName,
            arguments: args
        });
    }
    getServerStatus() {
        const status = [];
        for (const [name, client] of this.connections.entries()) {
            status.push({
                id: name,
                status: 'connected', // For now, if it's in the map, it's connected
                tools: 0 // We could track tool count if needed
            });
        }
        return status;
    }
}

module.exports = new MCPHost();
