# MCP PostgreSQL Server

**Repository**: [modelcontextprotocol/servers/src/postgres](https://github.com/modelcontextprotocol/servers/tree/main/src/postgres)

## Overview
The PostgreSQL server provides read-only access to PostgreSQL databases. It allows the AI to inspect schemas and query data.

## Features
-   Inspect database tables and schemas.
-   Execute read-only SQL queries.
-   Analyze data relationships.

## Usage
```bash
npx -y @modelcontextprotocol/server-postgres postgres://user:password@localhost:5432/dbname
```
