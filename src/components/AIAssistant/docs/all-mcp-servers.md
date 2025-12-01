# All MCP Servers - Quick Reference

## What is MCP?

**Model Context Protocol (MCP)** is an open-source standard developed by Anthropic that enables AI systems to securely connect with external data sources and tools. MCP servers run as separate processes that provide:
- **Resources**: Data the AI can read
- **Tools**: Actions the AI can execute  
- **Prompts**: Templates for common tasks

## Official MCP Servers by Anthropic

### 🗂️ Filesystem Server
**Purpose**: Secure file operations with configurable access controls  
**Capabilities**: Read/write files, list directories, check metadata  
**Repo**: [modelcontextprotocol/servers/filesystem](https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem)  
**Install**: `npx -y @modelcontextprotocol/server-filesystem /path/to/directory`

### 📦 Git Server  
**Purpose**: Git version control operations  
**Capabilities**: status, diff, commit, push, pull, log, branch management  
**Repo**: [modelcontextprotocol/servers/git](https://github.com/modelcontextprotocol/servers/tree/main/src/git)  
**Install**: `npx -y @modelcontextprotocol/server-git /path/to/repo`

### 🐙 GitHub Server
**Purpose**: GitHub API integration  
**Capabilities**: Issues, PRs, repos, commits, releases, search  
**Repo**: [modelcontextprotocol/servers/github](https://github.com/modelcontextprotocol/servers/tree/main/src/github)  
**Install**: `npx -y @modelcontextprotocol/server-github`  
**Requires**: GitHub personal access token

### 🧠 Memory Server
**Purpose**: Persistent knowledge graph storage across conversations  
**Capabilities**: Store entities, relations, observations  
**Repo**: [modelcontextprotocol/servers/memory](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)  
**Install**: `npx -y @modelcontextprotocol/server-memory`

### 🐘 PostgreSQL Server
**Purpose**: Database queries and schema inspection  
**Capabilities**: Execute SQL, list tables/schemas, inspect data  
**Repo**: [modelcontextprotocol/servers/postgres](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres)  
**Install**: `npx -y @modelcontextprotocol/server-postgres postgresql://user:pass@localhost/db`

### 🤖 Puppeteer Server
**Purpose**: Browser automation and web scraping  
**Capabilities**: Navigate, screenshot, scrape, interact with pages  
**Repo**: [modelcontextprotocol/servers/puppeteer](https://github.com/modelcontextprotocol/servers/tree/main/src/puppeteer)  
**Install**: `npx -y @modelcontextprotocol/server-puppeteer`

### 🔍 Brave Search Server
**Purpose**: Web search capabilities  
**Capabilities**: Search web, get current information  
**Repo**: [modelcontextprotocol/servers/brave-search](https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search)  
**Install**: `npx -y @modelcontextprotocol/server-brave-search`  
**Requires**: Brave Search API key

## Popular Community MCP Servers

### ☁️ Google Drive
**Purpose**: Access Google Drive files and folders  
**Repo**: [modelcontextprotocol/servers/gdrive](https://github.com/modelcontextprotocol/servers/tree/main/src/gdrive)  
**Requires**: Google OAuth credentials

### 💬 Slack  
**Purpose**: Read and send Slack messages
**Repo**: [modelcontextprotocol/servers/slack](https://github.com/modelcontextprotocol/servers/tree/main/src/slack)  
**Requires**: Slack API token

### 🔴 Sentry
**Purpose**: Error tracking and monitoring integration  
**Community**: Various implementations available

### 📊 AlphaVantage
**Purpose**: Real-time and historical stock market data  
**Community**: Third-party implementation

### 🌐 Firecrawl
**Purpose**: Advanced web scraping and crawling  
**Community**: Third-party implementation

### ⏰ Time Server
**Purpose**: Time and timezone conversions  
**Official**: Part of modelcontextprotocol/servers

## How to Use MCP Servers

### 1. Running MCP Servers

MCP servers run as **separate processes** alongside your AI application. They communicate via:
- **stdio** (standard input/output)
- **HTTP/SSE** (Server-Sent Events)

Example running multiple servers:
```bash
# Terminal 1: Filesystem access
npx -y @modelcontextprotocol/server-filesystem ~/projects

# Terminal 2: Git operations  
npx -y @modelcontextprotocol/server-git ~/projects/my-repo

# Terminal 3: Database access
npx -y @modelcontextprotocol/server-postgres postgresql://localhost/mydb
```

### 2. Connecting Your AI

Your AI application (like Peak Multiplatform) connects to MCP servers and:
1. Discovers available resources and tools
2. Shows tools to the AI model in its system prompt
3. Routes tool calls from the AI to the appropriate MCP server
4. Returns results back to the AI

### 3. Configuration Example

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    },
    "git": {
      "command": "npx", 
      "args": ["-y", "@modelcontextprotocol/server-git", "/Users/me/projects/repo"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/db"],
      "env": {
        "PGPASSWORD": "secret"
      }
    }
  }
}
```

## Integration Patterns

### Pattern 1: Direct Integration
Your app spawns MCP server processes and communicates directly via stdio/HTTP.

### Pattern 2: Tool Proxying  
Your app creates matching tools (like `git_operation`) that internally call MCP servers.

### Pattern 3: Hybrid Approach (Recommended for Peak)
- Use **built-in tools** for core operations (file ops, commands)
- Add **MCP-aware tools** for advanced features (git, database, search)
- Let users **enable/disable** MCP servers in settings

## Security Considerations

⚠️ **Important**: MCP servers have access to:
- File systems (filesystem server)
- Git repositories (git server)  
- Databases (postgres server)
- The web (puppeteer, search servers)

**Best practices**:
1. **Limit scope**: Only grant access to specific directories/databases
2. **Use environment variables**: Don't hardcode credentials
3. **Review permissions**: Understand what each server can access
4. **Audit logs**: Monitor what the AI is doing with servers

## Learn More

- **Official Docs**: [modelcontextprotocol.io](https://modelcontextprotocol.io)
- **Server Repo**: [github.com/modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers)
- **Community Hub**: [mcp.so](https://mcp.so)
- **Spec**: [spec.modelcontextprotocol.io](https://spec.modelcontextprotocol.io)

## Usage in Peak Multiplatform

Peak AI doesn't directly run MCP servers (yet!), but this documentation helps the AI:
1. **Understand** what MCP servers can do
2. **Suggest** when to use MCP capabilities
3. **Guide** you in setting up MCP servers
4. **Plan** for future MCP integration

When you reference these docs in your chats, the AI gains context about available tools and can make better suggestions!
