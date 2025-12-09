// src/services/LSPClient.js
// Language Server Protocol Client for managing language servers

const { spawn } = require('child_process');
const EventEmitter = require('events');
const path = require('path');

/**
 * LSPClient manages language server processes and handles LSP communication.
 * Supports multiple language servers for different file types.
 */
class LSPClient extends EventEmitter {
    constructor() {
        super();
        this.servers = new Map(); // languageId -> ServerInstance
        this.documents = new Map(); // uri -> DocumentState
        this.messageId = 0;
        this.pendingRequests = new Map(); // messageId -> { resolve, reject }
    }

    /**
     * Start a language server for a specific language
     * @param {Object} config - Server configuration
     * @param {string} config.languageId - Language identifier (e.g., 'python', 'typescript')
     * @param {string} config.serverCommand - Command to spawn server
     * @param {Array<string>} config.serverArgs - Arguments for server command
     * @param {string} config.extensionPath - Path to extension directory
     */
    async startLanguageServer(config) {
        const { languageId, serverCommand, serverArgs = [], extensionPath } = config;

        if (this.servers.has(languageId)) {
            console.log(`[LSPClient] Server already running for ${languageId}`);
            return;
        }

        console.log(`[LSPClient] Starting language server for ${languageId}:`, serverCommand, serverArgs);

        try {
            // Spawn the language server process
            const serverProcess = spawn(serverCommand, serverArgs, {
                cwd: extensionPath,
                stdio: ['pipe', 'pipe', 'pipe'],
                env: { ...process.env }
            });

            const server = {
                languageId,
                process: serverProcess,
                buffer: '',
                initialized: false,
                capabilities: null,
                pendingMessages: []
            };

            this.servers.set(languageId, server);

            // Handle stdout (server responses)
            serverProcess.stdout.on('data', (data) => {
                this.handleServerOutput(server, data);
            });

            // Handle stderr (server errors/logs)
            serverProcess.stderr.on('data', (data) => {
                console.error(`[LSPClient] ${languageId} stderr:`, data.toString());
            });

            // Handle process exit
            serverProcess.on('exit', (code, signal) => {
                console.log(`[LSPClient] ${languageId} exited with code ${code}, signal ${signal}`);
                this.servers.delete(languageId);
            });

            // Send initialize request
            await this.initializeServer(server);

        } catch (err) {
            console.error(`[LSPClient] Failed to start server for ${languageId}:`, err);
            throw err;
        }
    }

    /**
     * Initialize a language server with LSP initialize handshake
     */
    async initializeServer(server) {
        const initializeParams = {
            processId: process.pid,
            rootUri: null, // Will be set per-workspace
            capabilities: {
                textDocument: {
                    synchronization: {
                        dynamicRegistration: false,
                        willSave: false,
                        willSaveWaitUntil: false,
                        didSave: false
                    },
                    completion: {
                        dynamicRegistration: false,
                        completionItem: {
                            snippetSupport: true,
                            documentationFormat: ['markdown', 'plaintext']
                        }
                    },
                    hover: {
                        dynamicRegistration: false,
                        contentFormat: ['markdown', 'plaintext']
                    },
                    definition: {
                        dynamicRegistration: false,
                        linkSupport: true
                    },
                    publishDiagnostics: {
                        relatedInformation: true,
                        versionSupport: true
                    }
                },
                workspace: {
                    applyEdit: true,
                    workspaceEdit: {
                        documentChanges: true
                    }
                }
            }
        };

        try {
            const response = await this.sendRequest(server, 'initialize', initializeParams);
            server.capabilities = response.capabilities;
            server.initialized = true;

            // Send initialized notification
            this.sendNotification(server, 'initialized', {});

            console.log(`[LSPClient] ${server.languageId} initialized with capabilities:`,
                Object.keys(response.capabilities));
        } catch (err) {
            console.error(`[LSPClient] Failed to initialize ${server.languageId}:`, err);
            throw err;
        }
    }

    /**
     * Handle output from language server
     */
    handleServerOutput(server, data) {
        server.buffer += data.toString();

        // Process complete messages
        while (true) {
            const headerEnd = server.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) break;

            const headerText = server.buffer.substring(0, headerEnd);
            const headers = this.parseHeaders(headerText);
            const contentLength = parseInt(headers['content-length']);

            if (server.buffer.length < headerEnd + 4 + contentLength) {
                // Incomplete message
                break;
            }

            const messageText = server.buffer.substring(
                headerEnd + 4,
                headerEnd + 4 + contentLength
            );
            server.buffer = server.buffer.substring(headerEnd + 4 + contentLength);

            try {
                const message = JSON.parse(messageText);
                this.handleMessage(server, message);
            } catch (err) {
                console.error(`[LSPClient] Failed to parse message:`, err, messageText);
            }
        }
    }

    /**
     * Parse LSP message headers
     */
    parseHeaders(headerText) {
        const headers = {};
        for (const line of headerText.split('\r\n')) {
            const colonIndex = line.indexOf(':');
            if (colonIndex > 0) {
                const key = line.substring(0, colonIndex).trim().toLowerCase();
                const value = line.substring(colonIndex + 1).trim();
                headers[key] = value;
            }
        }
        return headers;
    }

    /**
     * Handle a parsed LSP message
     */
    handleMessage(server, message) {
        if (message.id !== undefined) {
            // Response to our request
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
                this.pendingRequests.delete(message.id);
                if (message.error) {
                    pending.reject(new Error(message.error.message));
                } else {
                    pending.resolve(message.result);
                }
            }
        } else if (message.method) {
            // Notification or request from server
            this.handleServerNotification(server, message.method, message.params);
        }
    }

    /**
     * Handle notifications from server
     */
    handleServerNotification(server, method, params) {
        switch (method) {
            case 'textDocument/publishDiagnostics':
                this.emit('diagnostics', {
                    uri: params.uri,
                    diagnostics: params.diagnostics
                });
                break;

            case 'window/showMessage':
                console.log(`[LSPClient] ${server.languageId} message:`, params.message);
                break;

            case 'window/logMessage':
                console.log(`[LSPClient] ${server.languageId} log:`, params.message);
                break;

            default:
                console.log(`[LSPClient] Unhandled notification: ${method}`);
        }
    }

    /**
     * Send a request to language server
     */
    sendRequest(server, method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            this.pendingRequests.set(id, { resolve, reject });

            const message = {
                jsonrpc: '2.0',
                id,
                method,
                params
            };

            this.sendMessage(server, message);

            // Timeout after 30 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error(`LSP request timeout: ${method}`));
                }
            }, 30000);
        });
    }

    /**
     * Send a notification to language server
     */
    sendNotification(server, method, params) {
        const message = {
            jsonrpc: '2.0',
            method,
            params
        };
        this.sendMessage(server, message);
    }

    /**
     * Send a message to language server
     */
    sendMessage(server, message) {
        const content = JSON.stringify(message);
        const headers = `Content-Length: ${content.length}\r\n\r\n`;
        const data = headers + content;

        server.process.stdin.write(data);
    }

    /**
     * Notify server that a document was opened
     */
    didOpenDocument(uri, languageId, text, version = 1) {
        // Always track the document, even if no server is running yet
        this.documents.set(uri, { languageId, version, text });

        const server = this.getServerForLanguage(languageId);
        if (!server || !server.initialized) {
            console.log(`[LSPClient] No server for ${languageId}, deferring didOpen notification`);
            return;
        }

        this.sendNotification(server, 'textDocument/didOpen', {
            textDocument: {
                uri,
                languageId,
                version,
                text
            }
        });
    }

    /**
     * Notify server that a document changed
     */
    didChangeDocument(uri, changes, newText) {
        const doc = this.documents.get(uri);
        if (!doc) {
            console.warn(`[LSPClient] Document not tracked: ${uri}`);
            return;
        }

        const server = this.getServerForLanguage(doc.languageId);
        if (!server || !server.initialized) return;

        doc.version++;
        doc.text = newText;

        this.sendNotification(server, 'textDocument/didChange', {
            textDocument: {
                uri,
                version: doc.version
            },
            contentChanges: [{ text: newText }]
        });
    }

    /**
     * Notify server that a document was closed
     */
    didCloseDocument(uri) {
        const doc = this.documents.get(uri);
        if (!doc) return;

        const server = this.getServerForLanguage(doc.languageId);
        if (server && server.initialized) {
            this.sendNotification(server, 'textDocument/didClose', {
                textDocument: { uri }
            });
        }

        this.documents.delete(uri);
    }

    /**
     * Request completions from language server
     */
    async getCompletions(uri, position) {
        const doc = this.documents.get(uri);
        if (!doc) return [];

        const server = this.getServerForLanguage(doc.languageId);
        if (!server || !server.initialized) return [];

        try {
            const result = await this.sendRequest(server, 'textDocument/completion', {
                textDocument: { uri },
                position
            });

            const items = Array.isArray(result) ? result : (result?.items || []);
            return items;
        } catch (err) {
            console.error('[LSPClient] Completion failed:', err);
            return [];
        }
    }

    /**
     * Request hover information from language server
     */
    async getHover(uri, position) {
        const doc = this.documents.get(uri);
        if (!doc) return null;

        const server = this.getServerForLanguage(doc.languageId);
        if (!server || !server.initialized) return null;

        try {
            const result = await this.sendRequest(server, 'textDocument/hover', {
                textDocument: { uri },
                position
            });

            return result;
        } catch (err) {
            console.error('[LSPClient] Hover failed:', err);
            return null;
        }
    }

    /**
     * Request definition location from language server
     */
    async getDefinition(uri, position) {
        const doc = this.documents.get(uri);
        if (!doc) return null;

        const server = this.getServerForLanguage(doc.languageId);
        if (!server || !server.initialized) return null;

        try {
            const result = await this.sendRequest(server, 'textDocument/definition', {
                textDocument: { uri },
                position
            });

            return result;
        } catch (err) {
            console.error('[LSPClient] Definition failed:', err);
            return null;
        }
    }

    /**
     * Request document formatting from language server
     */
    async formatDocument(uri) {
        const doc = this.documents.get(uri);
        if (!doc) return null;

        const server = this.getServerForLanguage(doc.languageId);
        if (!server || !server.initialized) return null;

        try {
            const result = await this.sendRequest(server, 'textDocument/formatting', {
                textDocument: { uri },
                options: {
                    tabSize: 4,
                    insertSpaces: true
                }
            });

            return result;
        } catch (err) {
            console.error('[LSPClient] Formatting failed:', err);
            return null;
        }
    }

    /**
     * Get server instance for a language
     */
    getServerForLanguage(languageId) {
        return this.servers.get(languageId);
    }

    /**
     * Shutdown all language servers
     */
    async shutdown() {
        for (const [languageId, server] of this.servers.entries()) {
            try {
                await this.sendRequest(server, 'shutdown', null);
                this.sendNotification(server, 'exit', null);
                server.process.kill();
            } catch (err) {
                console.error(`[LSPClient] Error shutting down ${languageId}:`, err);
            }
        }
        this.servers.clear();
        this.documents.clear();
    }
    /**
     * Forcefully terminate all language servers (synchronous)
     */
    terminate() {
        for (const [languageId, server] of this.servers.entries()) {
            try {
                console.log(`[LSPClient] Terminating ${languageId} process (PID: ${server.process.pid})`);
                server.process.kill();
            } catch (err) {
                console.error(`[LSPClient] Error terminating ${languageId}:`, err);
            }
        }
        this.servers.clear();
        this.documents.clear();
    }
}

module.exports = LSPClient;
