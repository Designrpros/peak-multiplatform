/**
 * MCPClient.js
 * Core logic for the Peak Assistant, handling IPC communication, streaming, and state.
 */

const { ipcRenderer } = require('electron');
const StreamParser = require('../utils/StreamParser');
const ResponseSanitizer = require('../utils/ResponseSanitizer');
const SYSTEM_PROMPT_TEMPLATE = require('./SystemPrompt');
const AgentRegistry = require('./AgentRegistry');
const ProjectContextManager = require('../../../services/ProjectContextManager');

class MCPClient {
    constructor() {
        this.parser = new StreamParser();
        this.currentRequestId = null; // Dynamic ID for each request
        this.isStreaming = false;
        this.currentStreamMessage = null;
        this.history = [];
        this.currentSessionId = null;
        this.currentProjectRoot = null; // Track current project for scoped history

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
            // Use sessionStorage to persist only for the duration of the app run (and reloads)
            // This ensures a fresh start on app quit/restart.
            const activeId = sessionStorage.getItem('peak-active-session-id');
            if (activeId) {
                this.loadSession(activeId);
            } else {
                // Check if there is a recent empty session we can reuse
                const sessions = this.getSessions();
                // Sort by lastModified descending
                sessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

                console.log('[MCPClient] Checking for empty sessions. Total sessions:', sessions.length);
                const emptySession = sessions.find(s => {
                    const isEmpty = !s.history || s.history.length === 0;
                    console.log(`[MCPClient] Session ${s.id} history length: ${s.history ? s.history.length : 0}, isEmpty: ${isEmpty}`);
                    return isEmpty;
                });

                if (emptySession) {
                    console.log('[MCPClient] Reusing existing empty session:', emptySession.id);
                    this.loadSession(emptySession.id);
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
        console.log('[MCPClient] startNewSession called');
        this.currentSessionId = Date.now().toString();
        this.history = [];
        this.saveSession();
        sessionStorage.setItem('peak-active-session-id', this.currentSessionId);
        window.peakChatHistory = this.history;

        // Notify UI
        window.dispatchEvent(new CustomEvent('peak-session-changed', { detail: { id: this.currentSessionId } }));
    }

    loadSession(id) {
        console.log('[MCPClient] loadSession called with ID:', id);
        try {
            const sessions = this.getSessions();
            const session = sessions.find(s => s.id === id);
            if (session) {
                this.currentSessionId = id;
                this.history = session.history || [];
                window.peakChatHistory = this.history;
                sessionStorage.setItem('peak-active-session-id', id);
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

    deleteSession(id) {
        try {
            let sessions = this.getSessions();
            sessions = sessions.filter(s => s.id !== id);
            localStorage.setItem('peak-chat-sessions', JSON.stringify(sessions));

            // If we deleted the current session, start a new one
            if (this.currentSessionId === id) {
                this.startNewSession();
            }
        } catch (e) {
            console.error('Failed to delete session:', e);
        }
    }

    getProjectMemory(projectRoot) {
        if (!projectRoot) return '';
        const key = `peak-project-memory-${this.hashProjectPath(projectRoot)}`;
        return localStorage.getItem(key) || '';
    }

    saveProjectMemory(projectRoot, memory) {
        if (!projectRoot) return;
        const key = `peak-project-memory-${this.hashProjectPath(projectRoot)}`;
        localStorage.setItem(key, memory);
    }

    /**
     * Sends a prompt to the AI.
     * @param {string} prompt - The user's message.
     * @param {object} context - Project context (files, root, etc).
     * @param {string} model - The model ID to use.
     */
    async sendMessage(prompt, context, model = 'openrouter/auto', commitHash = null, systemPromptOverride = null, agent = null) {
        if (this.isStreaming) return;

        this.isStreaming = true;
        this.currentRequestId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        this.currentStreamMessage = { content: '', fullContent: '' };
        this.currentStreamAgent = agent; // Store agent for history

        // 1. Prepare System Prompt with Context
        const projectTitle = context.projectTitle || 'Untitled Project';
        const root = context.root || 'Current Directory';

        // PROJECT-SCOPED HISTORY: Switch history when project changes
        // Only switch if we have a previous root (prevent wiping history on initial load)
        if (this.currentProjectRoot && this.currentProjectRoot !== root) {
            console.log(`[MCPClient] Project changed from "${this.currentProjectRoot}" to "${root}". Loading project-specific history.`);
            this.switchProject(root);
        } else if (!this.currentProjectRoot) {
            // First time setting root, just adopt it without wiping history
            console.log(`[MCPClient] Initializing project root: "${root}"`);
            this.currentProjectRoot = root;
        }

        // Use override if provided, otherwise default template
        let systemPrompt = systemPromptOverride;

        // Fallback to default if no override
        if (!systemPrompt) {
            if (typeof SYSTEM_PROMPT_TEMPLATE === 'string') {
                systemPrompt = SYSTEM_PROMPT_TEMPLATE;
            } else if (SYSTEM_PROMPT_TEMPLATE.default) {
                // Handle promise if default is a promise (which it is now)
                systemPrompt = await SYSTEM_PROMPT_TEMPLATE.default;
            } else if (SYSTEM_PROMPT_TEMPLATE.getSystemPrompt) {
                systemPrompt = await SYSTEM_PROMPT_TEMPLATE.getSystemPrompt('auto');
            }
        }

        // Ensure systemPrompt is a string before replacing
        if (typeof systemPrompt !== 'string') {
            console.warn('[MCPClient] System prompt is not a string, using hardcoded default');
            systemPrompt = "You are a helpful AI assistant. (Fallback)";
        }

        if (typeof systemPrompt === 'string') {
            // Perform template replacement (works for both default and custom if they use the placeholders)
            systemPrompt = systemPrompt
                .replace(/\{\{PROJECT_ROOT\}\}/g, root) // Use regex for global replacement
                .replace('${window.currentProjectRoot || \'Current Directory\'}', root) // Legacy placeholder
                .replace('${projectData.title || \'Untitled Project\'}', projectTitle);
        }

        // 2. Prepare Context Message
        let contextMsg = `Current Project: ${projectTitle}\nRoot: ${root}\n\n`;

        // Inject Project Memory if available
        const projectMemory = this.getProjectMemory(root);
        if (projectMemory && projectMemory.trim()) {
            contextMsg += `## PROJECT MEMORY (Global Context)\n${projectMemory}\n\n`;
        }

        // Inject Project Context (Structure + Conventions)
        try {
            if (root) {
                const projectContext = ProjectContextManager.getContext(root);
                if (projectContext && projectContext.trim()) {
                    contextMsg += `## PROJECT CONTEXT\n${projectContext}\n\n`;
                }
            }
        } catch (err) {
            console.error('[MCPClient] Error loading project context:', err);
        }

        // Inject Diagnostics
        if (context.diagnostics && context.diagnostics.length > 0) {
            contextMsg += `## ACTIVE PROBLEMS (Diagnostics)\n${context.diagnostics.join('\n')}\n\n`;
        }
        // Explicitly Selected Files (Priority)
        if (context.selectedFiles && context.selectedFiles.length > 0) {
            contextMsg += '### Selected Context Files:\n';
            context.selectedFiles.forEach(file => {
                contextMsg += `File: "${file.path}"\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
            });
        }
        // Documentation Context
        if (context.documentation && context.documentation.length > 0) {
            contextMsg += '### Documentation Context:\n';
            context.documentation.forEach(doc => {
                if (doc.type === 'content') {
                    contextMsg += `Documentation: "${doc.name}"\n\`\`\`markdown\n${doc.content}\n\`\`\`\n\n`;
                } else if (doc.type === 'url') {
                    contextMsg += `Documentation Reference: "${doc.name}" - URL: ${doc.url}\n`;
                }
            });
            contextMsg += '\n';
        }
        // Fallback to Active File if no explicit selection (but still available as "Active")
        else if (context.activeFile) {
            contextMsg += `Current Active File: "${context.activeFile}"\n`;
            if (context.activeContent) {
                contextMsg += `Content:\n\`\`\`\n${context.activeContent}\n\`\`\`\n\n`;
            }
        }

        // 3. Construct Messages Array
        let fullPrompt = null;
        if (prompt !== null) {
            if (Array.isArray(prompt)) {
                // Multimodal: Inject context into the text part
                fullPrompt = prompt.map(p => {
                    if (p.type === 'text') {
                        return { ...p, text: `${contextMsg}USER QUESTION: ${p.text}` };
                    }
                    return p;
                });
            } else {
                // Text-only
                fullPrompt = `${contextMsg}USER QUESTION: ${prompt}`;
            }
        }

        // 3. Construct Messages Array
        // Filter history to only include role and content to avoid sending extra props like 'html'
        const cleanHistory = this.history.map(msg => {
            if (msg.role === 'system') {
                return {
                    role: 'user',
                    content: `[System Output]\n${msg.content}`
                };
            }
            return {
                role: msg.role,
                content: msg.content
            };
        });

        // DEBUG: Log command outputs in history
        const commandOutputs = cleanHistory.filter(msg =>
            msg.content && msg.content.includes('[System] Command Execution Result:')
        );
        if (commandOutputs.length > 0) {
            console.log('[MCPClient] 🔍 Command outputs in history:', commandOutputs.length);
            commandOutputs.forEach((output, i) => {
                console.log(`[MCPClient] Command Output ${i + 1}:`, output.content.substring(0, 200) + '...');
            });
        }

        const messages = [
            { role: 'system', content: systemPrompt },
            ...cleanHistory
        ];

        // SAFETY RAIL: Context Window Management
        // Check total length of messages to prevent "context limit exceeded" errors.
        // 500,000 characters is roughly 125,000 tokens, which is a safe upper limit for most models while leaving room for output.
        // If exceeded, we aggressively truncate history, keeping only the system prompt and the most recent messages.
        const MAX_CONTEXT_CHARS = 500000;
        const currentLength = messages.reduce((acc, msg) => acc + (msg.content ? msg.content.length : 0), 0);

        if (currentLength > MAX_CONTEXT_CHARS) {
            console.warn(`[MCPClient] Context length (${currentLength} chars) exceeds safety limit (${MAX_CONTEXT_CHARS}). Truncating history.`);

            // Keep System Prompt (index 0)
            // Keep last 4 messages (User + AI pairs) to maintain immediate context
            const keepCount = 4;
            if (messages.length > keepCount + 1) {
                const systemMsg = messages[0];
                const recentMessages = messages.slice(-keepCount);

                // Reconstruct messages
                messages.length = 0; // Clear array
                messages.push(systemMsg);

                // Add a system note about truncation
                messages.push({
                    role: 'system',
                    content: `[System Note] Conversation history has been truncated to ensure efficient context usage. Previous context was ${Math.round(currentLength / 4)} tokens.`
                });

                messages.push(...recentMessages);

                console.log(`[MCPClient] History truncated. New message count: ${messages.length}`);
            }
        }

        // Only append user message if prompt is provided
        if (fullPrompt) {
            messages.push({ role: 'user', content: fullPrompt });

            // Update history with user message
            this.history.push({ role: 'user', content: fullPrompt, commitHash });
            this.saveHistory();
            window.peakChatHistory = this.history;
        } else {
            console.log('[MCPClient] Silent continue - triggering generation based on history');
        }

        // Store Debug Data
        this.debugData.lastRequest = {
            model,
            messages,
            timestamp: new Date().toISOString()
        };
        this.debugData.systemPrompt = systemPrompt;

        // Log to terminal for AI Agent visibility
        ipcRenderer.send('log:info', 'LLM REQUEST:', JSON.stringify(this.debugData.lastRequest, null, 2));

        // Log to agent logger
        const agentId = this.debugData.lastRequest?.model || 'unknown';
        const promptLen = prompt === null ? 0 : (Array.isArray(prompt)
            ? prompt.reduce((acc, p) => acc + (p.text ? p.text.length : 0), 0)
            : prompt.length);

        require('./AgentLogger').agent(`Agent Started: ${agentId}`, {
            model: agentId,
            contextFiles: context.selectedFiles ? context.selectedFiles.length : 0,
            promptLength: promptLen
        });

        // 4. Send Request
        console.log(`[MCPClient] Sending request with ID: ${this.currentRequestId}`);
        ipcRenderer.send('llm-stream-request', this.currentRequestId, model, messages);

        // Listen for stream events
        ipcRenderer.on('llm-stream-data', this.handleStreamData);
    }

    handleStreamData(event, id, data) {
        // Ignore events from previous requests
        if (id !== this.currentRequestId) {
            console.warn(`[MCPClient] Received stream data for old request ID: ${id}. Current: ${this.currentRequestId}`);
            return;
        }

        if (data.type === 'data') {
            this.currentStreamMessage.fullContent += data.content;

            try {
                // Sanitize content before parsing (for real-time filtering)
                const sanitizedContent = ResponseSanitizer.sanitize(this.currentStreamMessage.fullContent);

                // Parse and notify UI
                const processedHtml = this.parser.parse(sanitizedContent);

                // Emit event for UI to update
                window.dispatchEvent(new CustomEvent('mcp:stream-update', {
                    detail: {
                        html: processedHtml,
                        raw: sanitizedContent,
                        isComplete: false
                    }
                }));
            } catch (err) {
                console.error('[MCPClient] Error parsing stream data:', err);
                // Don't stop the stream, just log it. 
                // We might want to show a partial update or just wait for more data.
            }

        } else if (data.type === 'end' || data.type === 'error') {
            console.log(`[MCPClient] Stream ended. Type: ${data.type}, Error:`, data.message);
            this.stopStream(data.type === 'error' ? data.message : null);
        }
    }

    async stopStream(error = null) {
        if (!this.isStreaming) return;

        this.isStreaming = false;
        ipcRenderer.removeListener('llm-stream-data', this.handleStreamData);

        // Sanitize the response content before processing
        const sanitizedContent = ResponseSanitizer.sanitize(this.currentStreamMessage.fullContent);

        // Check if the response is mostly internal logs
        if (ResponseSanitizer.isInternalLog(this.currentStreamMessage.fullContent)) {
            console.warn('[MCPClient] Detected internal conversation logs in AI response. Sanitizing...');
            console.log('[MCPClient] Original length:', this.currentStreamMessage.fullContent.length);
            console.log('[MCPClient] Sanitized length:', sanitizedContent.length);
        }

        // Final parse with sanitized content
        const finalHtml = this.parser.parse(sanitizedContent);

        // VALIDATION: Check if AI generated sufficient response
        const hasTools = sanitizedContent.includes('<tool');
        const isShortResponse = sanitizedContent.length < 300;
        const isPlanningPhase = sanitizedContent.includes('PHASE 1: PLAN') || sanitizedContent.includes('## PHASE 1');

        // BUGFIX: Recognize auto-executing tools that don't create actionable buttons
        // These tools execute immediately and inject results, so they shouldn't trigger "insufficient response"
        const hasAutoExecutingTools = sanitizedContent.includes('name="view_file"') ||
            sanitizedContent.includes('name="list_directory"') ||
            sanitizedContent.includes('name="get_problems"') ||
            sanitizedContent.includes('name="search_project"');

        // Only dispatch insufficient-response if:
        // - No tools at all AND
        // - Not an auto-executing tool AND  
        // - Short response AND
        // - Not in planning phase
        if (!hasTools && !hasAutoExecutingTools && isShortResponse && !isPlanningPhase) {
            console.error('[MCPClient] ⚠️ AI response is suspiciously short and has no tools!');
            console.error('[MCPClient] Content length:', sanitizedContent.length);
            console.error('[MCPClient] Content preview:', sanitizedContent.substring(0, 200));

            // Dispatch event for ChatView to handle auto-retry
            window.dispatchEvent(new CustomEvent('ai:insufficient-response', {
                detail: {
                    content: sanitizedContent,
                    reason: 'no_tools_detected',
                    length: sanitizedContent.length
                }
            }));
        }

        // COMPLETION DETECTION: Check if AI declares task is complete
        const completionPhrases = [
            /I have completed(\s+the)?\s+(requested)?\s+task/i,
            /The task is (now )?complete/i,
            /The work is finished/i,
            /(task|work) is done/i,
            /All changes have been made/i,
            /I('ve| have) (already )?finished/i,
            /awaiting a new instruction/i,
            /ready for( a)? new (task|instruction)/i,
            /This session is complete/i
        ];

        const isComplete = completionPhrases.some(regex => regex.test(sanitizedContent));

        if (isComplete) {
            console.log('[MCPClient] ✅ Task completion detected in AI response');
            window.dispatchEvent(new CustomEvent('ai:task-complete', {
                detail: { content: sanitizedContent }
            }));
        }

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

        // Save to history (using sanitized content)
        // CRITICAL FIX: We must save the RAW content (sanitized), not the parsed HTML.
        // The ChatView will parse it again when rendering history.
        // If we save HTML, markdown.render will try to render it and fail (showing raw code).
        this.history.push({
            role: 'assistant',
            content: sanitizedContent,
            agentId: this.currentStreamAgent ? this.currentStreamAgent.id : null // Save Agent ID for history reconstruction
            // html: finalHtml // Do NOT save HTML to history
        });
        this.saveHistory();
        window.peakChatHistory = this.history;

        // Store Debug Data (keep original for debugging, but log warning)
        this.debugData.lastResponse = {
            content: sanitizedContent,
            originalContent: this.currentStreamMessage.fullContent, // Keep original for debugging
            wasSanitized: sanitizedContent !== this.currentStreamMessage.fullContent,
            error,
            timestamp: new Date().toISOString()
        };

        // Log to terminal for AI Agent visibility (sanitized version)
        ipcRenderer.send('log:info', 'LLM RESPONSE:', JSON.stringify({
            content: sanitizedContent.substring(0, 500) + (sanitizedContent.length > 500 ? '...' : ''),
            length: sanitizedContent.length,
            wasSanitized: this.debugData.lastResponse.wasSanitized
        }, null, 2));

        // Emit completion event (with sanitized content)
        window.dispatchEvent(new CustomEvent('mcp:stream-complete', {
            detail: {
                html: finalHtml,
                raw: sanitizedContent,
                error: error
            }
        }));

        // Log completion
        require('./AgentLogger').agent('Agent Finished', {
            duration: 'N/A', // Could calculate if we stored start time
            responseLength: sanitizedContent.length,
            error: error
        });

        this.currentStreamMessage = null;
    }

    /**
     * Manually stop generation.
     */
    abort() {
        if (this.isStreaming) {
            console.log(`[MCPClient] Aborting stream: ${this.currentRequestId}`);
            // Send abort signal to main process
            ipcRenderer.send('llm-stream-abort', this.currentRequestId);

            // Also stop client-side listening immediately
            this.stopStream('Aborted by user');
        }
    }

    getHistory() {
        return this.history;
    }

    saveHistory() {
        // Save to project-specific storage if we have a currentProjectRoot
        if (this.currentProjectRoot) {
            this.saveProjectHistory(this.currentProjectRoot, this.history);
        }

        // ALWAYS save to session storage to ensure it appears in the "Recent Conversations" list
        // and to handle auto-naming.
        this.saveSession();
    }

    clearHistory() {
        this.history = [];
        window.peakChatHistory = [];
        this.saveHistory();
    }

    /**
     * Switches to a different project, loading its specific conversation history
     * @param {string} projectRoot - The root path of the project
     */
    switchProject(projectRoot) {
        console.log('[MCPClient] switchProject called with root:', projectRoot);

        // If we are already on this project, DO NOT reset the session
        if (this.currentProjectRoot === projectRoot) {
            console.log('[MCPClient] Already on project:', projectRoot, 'Keeping session.');
            return;
        }

        // Save current project's history before switching
        if (this.currentProjectRoot) {
            this.saveProjectHistory(this.currentProjectRoot, this.history);
        }

        // Start a FRESH session for the new project (or reuse empty)
        this.currentProjectRoot = projectRoot;

        // Check for reusable empty session first
        const sessions = this.getSessions();
        sessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

        console.log('[MCPClient] switchProject: Checking for empty sessions. Total:', sessions.length);
        console.log('[MCPClient] switchProject: Checking for empty sessions. Total:', sessions.length);
        const emptySession = sessions.find(s => {
            if (!s.history || s.history.length === 0) return true;

            // Also consider "effectively empty" sessions (only system messages)
            const hasVisibleContent = s.history.some(msg => {
                if (msg.role === 'system') return false;
                return true;
            });

            return !hasVisibleContent;
        });

        if (emptySession) {
            console.log('[MCPClient] switchProject: Reusing existing empty session:', emptySession.id);
            this.loadSession(emptySession.id);
        } else {
            console.log('[MCPClient] switchProject: No empty session found. Starting new.');
            this.startNewSession(); // This clears history and sets a new ID
        }

        // We do NOT load the last history automatically anymore.
        // The user can load it from the "Recent Conversations" list if they want.

        // However, we might want to ensure the "Recent Conversations" list is populated?
        // getSessions() reads from localStorage, so it should be fine.

        window.peakChatHistory = this.history;

        console.log(`[MCPClient] Started new session for project: ${projectRoot}`);
    }

    /**
     * Saves conversation history for a specific project
     * @param {string} projectRoot - The root path of the project
     * @param {Array} history - The conversation history
     */
    saveProjectHistory(projectRoot, history) {
        try {
            const key = `peak-history-${this.hashProjectPath(projectRoot)}`;
            localStorage.setItem(key, JSON.stringify(history));
        } catch (e) {
            console.error('[MCPClient] Failed to save project history:', e);
        }
    }

    /**
     * Loads conversation history for a specific project
     * @param {string} projectRoot - The root path of the project
     * @returns {Array} The conversation history
     */
    loadProjectHistory(projectRoot) {
        try {
            const key = `peak-history-${this.hashProjectPath(projectRoot)}`;
            const stored = localStorage.getItem(key);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error('[MCPClient] Failed to load project history:', e);
            return [];
        }
    }

    /**
     * Creates a simple hash of the project path for storage keys
     * @param {string} path - The project path
     * @returns {string} A hash string
     */
    hashProjectPath(path) {
        // Simple hash function for project paths
        let hash = 0;
        for (let i = 0; i < path.length; i++) {
            const char = path.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return Math.abs(hash).toString(36);
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

    async generateSessionTitle() {
        if (this.history.length === 0) return;

        console.log('[MCPClient] Generating session title...');
        const firstUserMsg = this.history.find(m => m.role === 'user');
        if (!firstUserMsg) return;

        const prompt = `Summarize the following user request into a short, concise title (max 5 words). Do not use quotes. Request: "${firstUserMsg.content.substring(0, 200)}"`;

        try {
            const title = await this.sendHiddenMessage(prompt);
            if (title) {
                const cleanTitle = title.replace(/"/g, '').trim();
                console.log('[MCPClient] Generated title:', cleanTitle);

                // Update session
                const sessions = this.getSessions();
                const session = sessions.find(s => s.id === this.currentSessionId);
                if (session) {
                    session.title = cleanTitle;
                    localStorage.setItem('peak-chat-sessions', JSON.stringify(sessions));
                    // Notify UI
                    window.dispatchEvent(new CustomEvent('peak-session-changed', { detail: { id: this.currentSessionId } }));
                }
            }
        } catch (e) {
            console.error('[MCPClient] Failed to generate title:', e);
        }
    }

    async sendHiddenMessage(prompt, model = 'openrouter/auto') {
        return new Promise((resolve, reject) => {
            const requestId = 'hidden-' + Date.now();
            const messages = [{ role: 'user', content: prompt }];

            // Temporary listener
            const handler = (event, id, data) => {
                if (id !== requestId) return;
                if (data.type === 'data') {
                    // Accumulate? For simple title generation, we might get it in chunks or one go.
                    // But since we can't easily accumulate without state, let's assume the first chunk or wait for end.
                    // Actually, we need to accumulate.
                    if (!this._hiddenResponse) this._hiddenResponse = '';
                    this._hiddenResponse += data.content;
                } else if (data.type === 'end') {
                    ipcRenderer.removeListener('llm-stream-data', handler);
                    resolve(this._hiddenResponse);
                    this._hiddenResponse = '';
                } else if (data.type === 'error') {
                    ipcRenderer.removeListener('llm-stream-data', handler);
                    reject(data.message);
                }
            };

            ipcRenderer.on('llm-stream-data', handler);
            ipcRenderer.send('llm-stream-request', requestId, model, messages);
        });
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
