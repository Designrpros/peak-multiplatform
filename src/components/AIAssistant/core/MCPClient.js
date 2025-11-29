/**
 * MCPClient.js
 * Core logic for the AI Assistant, handling IPC communication, streaming, and state.
 */

const { ipcRenderer } = require('electron');
const StreamParser = require('../utils/StreamParser');
const SYSTEM_PROMPT_TEMPLATE = require('./SystemPrompt');
const AgentRegistry = require('./AgentRegistry');

class MCPClient {
    constructor() {
        this.parser = new StreamParser();
        this.sessionId = -999; // Fixed ID for now (will be dynamic with sessions)
        this.isStreaming = false;
        this.currentStreamMessage = null;
        this.history = [];
        this.currentSessionId = null;

        // Load last active session or create new
        this.loadLastSession();

        this.debugData = {
            lastRequest: null,
            lastResponse: null,
            systemPrompt: ''
        };

        // Bind methods
        this.handleStreamData = this.handleStreamData.bind(this);

        // Expose instance globally for Inspector access
        window.peakMCPClient = this;
    }

    loadLastSession() {
        try {
            const lastId = localStorage.getItem('peak-last-session-id');
            if (lastId) {
                this.loadSession(lastId);
            } else {
                // Migrate old history if exists
                const oldHistory = localStorage.getItem('peak-chat-history');
                if (oldHistory) {
                    this.startNewSession();
                    this.history = JSON.parse(oldHistory);
                    this.saveSession();
                    localStorage.removeItem('peak-chat-history');
                } else {
                    this.startNewSession();
                }
            }
        } catch (e) {
            console.error('Failed to load session:', e);
            this.startNewSession();
        }
    }

    startNewSession() {
        this.currentSessionId = Date.now().toString();
        this.history = [];
        this.saveSession();
        localStorage.setItem('peak-last-session-id', this.currentSessionId);
        window.peakChatHistory = this.history;

        // Notify UI
        window.dispatchEvent(new CustomEvent('peak-session-changed', { detail: { id: this.currentSessionId } }));
    }

    loadSession(id) {
        try {
            const sessions = this.getSessions();
            const session = sessions.find(s => s.id === id);
            if (session) {
                this.currentSessionId = id;
                this.history = session.history || [];
                window.peakChatHistory = this.history;
                localStorage.setItem('peak-last-session-id', id);
                window.dispatchEvent(new CustomEvent('peak-session-changed', { detail: { id } }));
            } else {
                this.startNewSession();
            }
        } catch (e) {
            console.error('Failed to load session:', e);
            this.startNewSession();
        }
    }

    getSessions() {
        try {
            const stored = localStorage.getItem('peak-chat-sessions');
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            return [];
        }
    }

    saveSession() {
        if (!this.currentSessionId) return;

        try {
            const sessions = this.getSessions();
            const index = sessions.findIndex(s => s.id === this.currentSessionId);

            // Generate a title from the first user message if possible
            let title = 'New Chat';
            const firstUserMsg = this.history.find(m => m.role === 'user');
            if (firstUserMsg) {
                title = firstUserMsg.content.split('\n').find(l => !l.startsWith('###')) || 'New Chat';
                title = title.replace('USER QUESTION:', '').trim().substring(0, 30);
                if (title.length === 30) title += '...';
            }

            const sessionData = {
                id: this.currentSessionId,
                title: title,
                lastModified: Date.now(),
                history: this.history
            };

            if (index >= 0) {
                sessions[index] = sessionData;
            } else {
                sessions.unshift(sessionData);
            }

            localStorage.setItem('peak-chat-sessions', JSON.stringify(sessions));
        } catch (e) {
            console.error('Failed to save session:', e);
        }
    }

    /**
     * Sends a prompt to the AI.
     * @param {string} prompt - The user's message.
     * @param {object} context - Project context (files, root, etc).
     * @param {string} model - The model ID to use.
     */
    async sendMessage(prompt, context, model = 'openrouter/auto', commitHash = null, systemPromptOverride = null) {
        if (this.isStreaming) return;

        this.isStreaming = true;
        this.currentStreamMessage = { content: '', fullContent: '' };

        // 1. Prepare System Prompt with Context
        const projectTitle = context.projectTitle || 'Untitled Project';
        const root = context.root || 'Current Directory';

        // Use override if provided, otherwise default template
        let systemPrompt = systemPromptOverride || SYSTEM_PROMPT_TEMPLATE;

        // Perform template replacement (works for both default and custom if they use the placeholders)
        systemPrompt = systemPrompt
            .replace('${window.currentProjectRoot || \'Current Directory\'}', root)
            .replace('${projectData.title || \'Untitled Project\'}', projectTitle);

        // 2. Prepare Context Message
        let contextMsg = '';

        // Explicitly Selected Files (Priority)
        if (context.selectedFiles && context.selectedFiles.length > 0) {
            contextMsg += '### Selected Context Files:\n';
            context.selectedFiles.forEach(file => {
                contextMsg += `File: "${file.path}"\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
            });
        }
        // Fallback to Active File if no explicit selection (but still available as "Active")
        else if (context.activeFile) {
            contextMsg += `Current Active File: "${context.activeFile}"\n`;
            if (context.activeContent) {
                contextMsg += `Content:\n\`\`\`\n${context.activeContent}\n\`\`\`\n\n`;
            }
        }

        const fullPrompt = `${contextMsg}USER QUESTION: ${prompt}`;

        // 3. Construct Messages Array
        // Filter history to only include role and content to avoid sending extra props like 'html'
        const cleanHistory = this.history.map(msg => ({
            role: msg.role,
            content: msg.content
        }));

        const messages = [
            { role: 'system', content: systemPrompt },
            ...cleanHistory,
            { role: 'user', content: fullPrompt }
        ];

        // Update history with user message (now that we've constructed the payload)
        this.history.push({ role: 'user', content: fullPrompt, commitHash });
        this.saveHistory();
        window.peakChatHistory = this.history;

        // Store Debug Data
        this.debugData.lastRequest = {
            model,
            messages,
            timestamp: new Date().toISOString()
        };
        this.debugData.systemPrompt = systemPrompt;

        // Log to terminal for AI Agent visibility
        ipcRenderer.send('log:info', 'LLM REQUEST:', JSON.stringify(this.debugData.lastRequest, null, 2));

        // 4. Send Request
        ipcRenderer.send('llm-stream-request', this.sessionId, model, messages);

        // Listen for stream events
        ipcRenderer.on('llm-stream-data', this.handleStreamData);
    }

    handleStreamData(event, id, data) {
        if (id !== this.sessionId) return;

        if (data.type === 'data') {
            this.currentStreamMessage.fullContent += data.content;

            // Parse and notify UI
            const processedHtml = this.parser.parse(this.currentStreamMessage.fullContent);

            // Emit event for UI to update
            window.dispatchEvent(new CustomEvent('mcp:stream-update', {
                detail: {
                    html: processedHtml,
                    raw: this.currentStreamMessage.fullContent,
                    isComplete: false
                }
            }));

        } else if (data.type === 'end' || data.type === 'error') {
            this.stopStream(data.type === 'error' ? data.message : null);
        }
    }

    async stopStream(error = null) {
        if (!this.isStreaming) return;

        this.isStreaming = false;
        ipcRenderer.removeListener('llm-stream-data', this.handleStreamData);

        // Final parse
        const finalHtml = this.parser.parse(this.currentStreamMessage.fullContent);

        // Check for Delegation
        // The parser might not expose the raw tool calls easily, but we can check the content or if the parser has a way.
        // Actually, the ToolRegistry execution happens in the UI (ChatView) usually?
        // Wait, the ChatView handles tool clicks. But `delegate_task` is an "auto" tool usually?
        // Or does the AI output the tool usage XML?
        // Yes, the AI outputs XML. The StreamParser parses it.
        // If the AI output contains <tool name="delegate_task">, the ChatView will see it as a tool block.
        // We need to intercept this.

        // However, the ChatView is the one that "executes" tools usually via the UI buttons or auto-mode.
        // So we should probably handle delegation in ChatView.js, not here.
        // BUT, if we want it to be seamless, maybe here?
        // Let's stick to the pattern: Client handles communication, View handles UI/Tools.
        // So we just save history here.

        // Save to history
        this.history.push({
            role: 'assistant',
            content: this.currentStreamMessage.fullContent,
            html: finalHtml
        });
        this.saveHistory();
        window.peakChatHistory = this.history;

        // Store Debug Data
        this.debugData.lastResponse = {
            content: this.currentStreamMessage.fullContent,
            error,
            timestamp: new Date().toISOString()
        };

        // Log to terminal for AI Agent visibility
        ipcRenderer.send('log:info', 'LLM RESPONSE:', JSON.stringify(this.debugData.lastResponse, null, 2));

        // Emit completion event
        window.dispatchEvent(new CustomEvent('mcp:stream-complete', {
            detail: {
                html: finalHtml,
                raw: this.currentStreamMessage.fullContent,
                error: error
            }
        }));

        this.currentStreamMessage = null;
    }

    /**
     * Manually stop generation.
     */
    abort() {
        if (this.isStreaming) {
            // There isn't a specific 'stop' IPC in main.js, 
            // but we can just stop listening and maybe send a new request to cancel?
            // AIAssistantLogic.js didn't have a stop IPC call, just stopped listening.
            // Wait, I should check if there is a stop mechanism.
            // main.js doesn't seem to have a 'llm-stream-stop'.
            // So just client-side stop.
            this.stopStream('Aborted by user');
        }
    }

    getHistory() {
        return this.history;
    }

    saveHistory() {
        // Override old saveHistory to use saveSession
        this.saveSession();
    }

    clearHistory() {
        this.history = [];
        window.peakChatHistory = [];
        this.saveHistory();
    }

    truncateHistoryToHash(hash) {
        const index = this.history.findIndex(msg => msg.commitHash === hash);
        if (index !== -1) {
            // Keep the message with the hash, remove everything after it
            // OR: If the user wants to "undo" this message too?
            // Usually "Revert to here" means "Make this the current state".
            // The checkpoint was taken BEFORE the AI processed this message.
            // So if we revert to it, we are back to the start of this turn.
            // So we should keep this User message (so they can edit/resend?) or maybe just keep it as the last thing.
            // Let's keep it as the last message.
            this.history = this.history.slice(0, index + 1);
            this.saveHistory();
            window.peakChatHistory = this.history;
            return true;
        }
        return false;
    }

    getDebugData() {
        return {
            history: this.history,
            ...this.debugData
        };
    }
}


let instance = null;

class MCPClientSingleton {
    static getInstance() {
        if (!instance) {
            instance = new MCPClient();
        }
        return instance;
    }
}

module.exports = MCPClientSingleton;
