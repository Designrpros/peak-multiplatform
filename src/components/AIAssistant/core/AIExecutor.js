/**
 * AIExecutor.js
 * 
 * Handles all AI communication and streaming.
 * Replaces MCPClient with clean separation of concerns.
 * 
 * Responsibilities:
 * - Send messages to AI (via IPC)
 * - Handle streaming responses
 * - Update StateStore with stream data
 * - NO UI code - pure AI execution logic
 */

const { ipcRenderer } = require('electron');
const StateStore = require('./StateStore');

class AIExecutor {
    constructor() {
        this.currentRequestId = null;
        this.streamBuffer = '';
        this.pendingContinue = false;

        // console.log('[AIExecutor] ✅ NEW CODE LOADED - Tool auto-execution enabled');

        // Bind methods
        this.handleStreamData = this.handleStreamData.bind(this);
        this._handleRuntimeError = this._handleRuntimeError.bind(this);

        // Runtime error tracking
        this.lastErrorTime = 0;
        this.errorCount = 0;

        // Listen for runtime errors (from Sidebar)
        if (typeof window !== 'undefined') {
            window.addEventListener('peak-console-error', this._handleRuntimeError);
        }

        // Subscribe to settings changes
        StateStore.subscribeTo('settings', (settings) => {
            // console.log('[AIExecutor] Settings updated:', settings);
        });

        // Listen for tool execution completion (after user approval)
        StateStore.on('tool:execution-completed', async ({ toolName, result }) => {
            // console.log(`[AIExecutor] Tool "${toolName}" completed after approval, continuing AI...`);

            // Format result as tool_result tag (not raw HTML)
            const resultTag = `<tool_result name="${toolName}">${JSON.stringify(result)}</tool_result>`;

            // Add to conversation as assistant message
            StateStore.setState(prevState => ({
                conversation: {
                    ...prevState.conversation,
                    messages: [
                        ...prevState.conversation.messages,
                        {
                            role: 'system',
                            content: resultTag,
                            timestamp: Date.now()
                        }
                    ]
                }
            }));

            // Continue AI conversation
            await this.continueSilently();
        });
    }

    _handleRuntimeError(event) {
        const { filePath, error } = event.detail || {};
        if (!filePath) return;

        const now = Date.now();
        // Debounce: Ignore same file errors within 2 seconds
        if (now - this.lastErrorTime < 2000) return;

        this.lastErrorTime = now;
        this.errorCount++;

        // Reset error count if it's been a while (1 minute)
        if (now - this.lastErrorTime > 60000) this.errorCount = 0;

        // Prevent infinite loops: If too many errors in short time, stop auto-reporting
        if (this.errorCount > 5) {
            console.warn('[AIExecutor] Too many runtime errors, pausing auto-reporting.');
            return;
        }

        console.log(`[AIExecutor] Detected runtime error in ${filePath}, adding to context.`);

        // Add system message to conversation
        const errorMessage = `Runtime Custom Error: Issue detected in ${filePath}. The previous change might have caused a regression. Please investigate.`;

        StateStore.setState(prevState => ({
            conversation: {
                ...prevState.conversation,
                messages: [
                    ...prevState.conversation.messages,
                    {
                        role: 'system',
                        content: errorMessage,
                        timestamp: Date.now()
                    }
                ]
            }
        }));
    }

    /**
     * Send a message to the AI
     * @param {string|Array} prompt - Text prompt or multimodal array
     * @param {object} context - Project context (files, root, etc)
     * @param {string} commitHash - Optional git commit hash for this interaction
     */
    async sendMessage(prompt, context = {}, commitHash = null) {
        const state = StateStore.getState();

        if (state.ui.isStreaming) {
            console.log('[AIExecutor] Already streaming, queuing continue request...');
            this.pendingContinue = true;
            return;
        }

        // Reset pending continue flag as we are starting a new stream
        this.pendingContinue = false;

        // Generate request ID
        this.currentRequestId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        this.streamBuffer = '';

        // Update state: start streaming
        StateStore.setState(prevState => ({
            ui: { ...prevState.ui, isStreaming: true },
            conversation: {
                ...prevState.conversation,
                currentStream: { content: '', status: 'streaming' }
            }
        }));

        try {
            // Build conversation messages
            const messages = await this._buildMessages(prompt, context);

            // Get settings
            const { model, temperature, maxTokens } = state.settings;

            // Log request
            console.log(`[AIExecutor] Sending request ${this.currentRequestId}`, {
                model,
                messageCount: messages.length,
                temperature
            });

            // Add user message to history if prompt provided
            if (prompt !== null) {
                const userMessage = {
                    role: 'user',
                    content: Array.isArray(prompt) ? prompt : this._formatPromptWithContext(prompt, context),
                    displayContent: prompt, // Store clean prompt for UI
                    timestamp: Date.now(),
                    commitHash
                };

                StateStore.setState(prevState => ({
                    conversation: {
                        ...prevState.conversation,
                        messages: [...prevState.conversation.messages, userMessage]
                    }
                }));
            }

            // Listen for stream events
            ipcRenderer.on('llm-stream-data', this.handleStreamData);

            // Send request to main process
            ipcRenderer.send('llm-stream-request', this.currentRequestId, model, messages);

        } catch (error) {
            console.error('[AIExecutor] Error sending message:', error);
            this._handleError(error);
        }
    }

    /**
     * Handle streaming data from AI
     */
    async handleStreamData(event, id, data) {
        // Ignore events from old requests
        if (id !== this.currentRequestId) {
            return;
        }

        if (data.type === 'data') {
            // Append to buffer
            this.streamBuffer += data.content;

            // Update state with new stream content
            StateStore.setState(prevState => ({
                conversation: {
                    ...prevState.conversation,
                    currentStream: {
                        content: this.streamBuffer,
                        status: 'streaming'
                    }
                }
            }));

        } else if (data.type === 'end') {
            // console.log('[AIExecutor] Stream completed, processing tools...');
            await this._completeStream();

        } else if (data.type === 'error') {
            console.error('[AIExecutor] Stream error:', data.message);
            this._handleError(data.message);
        }
    }

    /**
     * Abort current streaming
     */
    abort() {
        if (!this.currentRequestId) return;

        console.log('[AIExecutor] Aborting stream:', this.currentRequestId);

        // Send abort signal to main process
        ipcRenderer.send('llm-stream-abort', this.currentRequestId);

        // Clean up
        this._cleanup();
        this.pendingContinue = false;

        // Update state
        StateStore.setState(prevState => ({
            ui: { ...prevState.ui, isStreaming: false },
            conversation: {
                ...prevState.conversation,
                currentStream: null
            }
        }));
    }

    /**
     * Continue conversation (AI self-continues without new user input)
     */
    async continueSilently(context = {}) {
        await this.sendMessage(null, context);
    }

    // ==================== Private Methods ====================

    async _buildMessages(prompt, context) {
        const state = StateStore.getState();
        const { messages } = state.conversation;

        // Get system prompt
        const systemPrompt = await this._getSystemPrompt(context);

        // Build messages array
        const builtMessages = [
            { role: 'system', content: systemPrompt }
        ];

        // Add conversation history (only role and content)
        for (const msg of messages) {
            if (msg.role === 'system') {
                // Convert system messages to user messages
                builtMessages.push({
                    role: 'user',
                    content: `[System Output]\n${msg.content}`
                });
            } else {
                builtMessages.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        }

        // Add new user message if prompt provided
        if (prompt !== null) {
            const userContent = Array.isArray(prompt)
                ? this._formatMultimodalPrompt(prompt, context)
                : this._formatPromptWithContext(prompt, context);

            builtMessages.push({
                role: 'user',
                content: userContent
            });
        }

        // Context window management
        return this._manageContextWindow(builtMessages);
    }

    async _getSystemPrompt(context) {
        const { getSystemPrompt } = require('./SystemPrompt');
        const state = StateStore.getState();
        const { mode } = state.settings;

        let systemPrompt = await getSystemPrompt(mode);

        // Inject project root
        const projectRoot = context.root || state.conversation.projectRoot || 'Current Directory';
        systemPrompt = systemPrompt.replace(/\{\{PROJECT_ROOT\}\}/g, projectRoot);

        return systemPrompt;
    }

    _formatPromptWithContext(prompt, context) {
        let formatted = '';

        // Add project context
        if (context.projectTitle) {
            formatted += `Current Project: ${context.projectTitle}\n`;
        }
        if (context.root) {
            formatted += `Root: ${context.root}\n\n`;
        }

        // Add diagnostics
        if (context.diagnostics && context.diagnostics.length > 0) {
            formatted += `## ACTIVE PROBLEMS\n${context.diagnostics.join('\n')}\n\n`;
        }

        // Add selected files
        if (context.selectedFiles && context.selectedFiles.length > 0) {
            formatted += '### Selected Files:\n';
            for (const file of context.selectedFiles) {
                formatted += `File: "${file.path}"\n\`\`\`\n${file.content}\n\`\`\`\n\n`;
            }
        }

        // Add active file fallback
        else if (context.activeFile) {
            formatted += `Current Active File: "${context.activeFile}"\n`;
            if (context.activeContent) {
                formatted += `Content:\n\`\`\`\n${context.activeContent}\n\`\`\`\n\n`;
            }
        }

        // Add user question
        formatted += `USER QUESTION: ${prompt}`;

        return formatted;
    }

    _formatMultimodalPrompt(promptArray, context) {
        // For multimodal, inject context into text parts
        return promptArray.map(part => {
            if (part.type === 'text') {
                return {
                    ...part,
                    text: this._formatPromptWithContext(part.text, context)
                };
            }
            return part;
        });
    }

    _manageContextWindow(messages) {
        // Safety limit: 500k characters (~125k tokens)
        const MAX_CHARS = 500000;
        const totalChars = messages.reduce((acc, msg) =>
            acc + (msg.content ? msg.content.length : 0), 0
        );

        if (totalChars <= MAX_CHARS) {
            return messages;
        }

        console.warn(`[AIExecutor] Context too large (${totalChars} chars). Truncating...`);

        // Keep system prompt + last 4 messages
        const systemMsg = messages[0];
        const recentMessages = messages.slice(-4);

        return [
            systemMsg,
            {
                role: 'system',
                content: `[System] History truncated to manage context size. Previous: ${Math.round(totalChars / 4)} tokens.`
            },
            ...recentMessages
        ];
    }

    async _completeStream() {
        const finalContent = this.streamBuffer;

        // Add assistant message to history
        StateStore.setState(prevState => ({
            conversation: {
                ...prevState.conversation,
                messages: [
                    ...prevState.conversation.messages,
                    {
                        role: 'assistant',
                        content: finalContent,
                        timestamp: Date.now()
                    }
                ],
                currentStream: {
                    content: finalContent,
                    status: 'complete'
                }
            },
            ui: {
                ...prevState.ui,
                isStreaming: false
            }
        }));

        // Cleanup
        this._cleanup();

        // Emit completion event
        StateStore.emit('ai:stream-complete', { content: finalContent });

        // Parse content for tool calls and auto-execute
        const toolCalls = this._extractToolCalls(finalContent);
        if (toolCalls.length > 0) {
            // console.log(`[AIExecutor] Detected ${toolCalls.length} tool calls, executing...`);
            await this._autoExecuteTools(toolCalls);
        }

        // Process queued continue request if one came in during streaming
        if (this.pendingContinue && !StateStore.getState().ui.isStreaming) {
            console.log('[AIExecutor] Processing queued continue request...');
            this.pendingContinue = false;
            await this.continueSilently();
        }
    }

    /**
     * Extract tool calls from AI response
     */
    _extractToolCalls(content) {
        const toolCalls = [];
        const toolRegex = /<tool\s+name="([^"]+)"([^>]*)>(?:<\/tool>)?/g;
        const toolRegexWithContent = /<tool\s+name="([^"]+)"([^>]*)>([\s\S]*?)<\/tool>/g;

        let match;

        // Try to match tools with content first
        while ((match = toolRegexWithContent.exec(content)) !== null) {
            const toolName = match[1];
            const attrs = match[2];
            const toolContent = match[3] ? match[3].trim() : '';

            // Parse attributes
            const args = {};
            const attrRegex = /(\w+)="([^"]*)"/g;
            let attrMatch;
            while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                args[attrMatch[1]] = attrMatch[2];
            }

            // Add content if present, or set to empty string to avoid undefined
            args.content = toolContent || '';

            // Map content to specific arguments based on tool name
            if (toolName === 'run_command' && args.content) {
                args.command = args.content;
            }

            toolCalls.push({ toolName, args });
        }

        // Try self-closing tags if no matches
        if (toolCalls.length === 0) {
            while ((match = toolRegex.exec(content)) !== null) {
                const toolName = match[1];
                const attrs = match[2];
                const toolContent = ''; // No content for self-closing tags

                // Parse attributes
                const args = {};
                const attrRegex = /(\w+)="([^"]*)"/g;
                let attrMatch;
                while ((attrMatch = attrRegex.exec(attrs)) !== null) {
                    args[attrMatch[1]] = attrMatch[2];
                }

                // Map content to specific arguments based on tool name
                // This fixes run_command/create_file where the prompt puts args in the body
                // For self-closing tags, content is empty, so this block won't apply unless
                // the model incorrectly puts content in a self-closing tag, which is not expected.
                // However, the original instruction implies match[3] for self-closing, which is incorrect regex-wise.
                // Keeping the logic for consistency with the user's intent if content were somehow present.
                if (toolContent && toolContent.length > 0) {
                    if (toolName === 'run_command') {
                        args.command = toolContent;
                    } else if (toolName === 'create_file' || toolName === 'update_file') {
                        args.content = toolContent;
                    }
                }

                toolCalls.push({ toolName, args });
            }
        }

        return toolCalls;
    }

    /**
     * Auto-execute tool calls and continue conversation with results
     */
    async _autoExecuteTools(toolCalls) {
        const ToolExecutor = require('./ToolExecutor');
        const results = [];
        let hasConfirmationPending = false;

        for (const { toolName, args } of toolCalls) {
            try {
                // console.log(`[AIExecutor] Auto-executing: ${toolName}`, args);
                const result = await ToolExecutor.executeTool(toolName, args);

                // Check if result is an executionId (string starting with toolName)  
                // This means tool is pending confirmation, not actually executed
                if (typeof result === 'string' && result.startsWith(toolName)) {
                    console.log(`[AIExecutor] Tool "${toolName}" pending user confirmation, pausing AI...`);
                    hasConfirmationPending = true;
                    // Don't add to results - wait for actual execution
                } else {
                    results.push({ toolName, success: true, result, args });
                }
            } catch (error) {
                console.error(`[AIExecutor] Tool execution failed: ${toolName}`, error);
                results.push({ toolName, success: false, error: error.message, args });
            }
        }

        // Only continue AI conversation if tools actually executed
        if (hasConfirmationPending) {
            console.log('[AIExecutor] Waiting for user to approve/reject tools...');
            return; // Don't continue - wait for user action
        }

        // Format results as system message
        const systemMessage = this._formatToolResults(results);

        // Add system message with tool results
        StateStore.setState(prevState => ({
            conversation: {
                ...prevState.conversation,
                messages: [
                    ...prevState.conversation.messages,
                    {
                        role: 'system',
                        content: systemMessage,
                        timestamp: Date.now()
                    }
                ]
            }
        }));

        // Continue AI conversation with tool results
        console.log('[AIExecutor] Tool execution complete, continuing AI conversation...');
        await this.continueSilently();
    }

    /**
     * Format tool execution results for AI
     */
    _formatToolResults(results) {
        const { renderToolResultCard } = require('../ui/sub-cards/ToolResultCard');

        let formatted = '';

        for (const { toolName, success, result, error, args } of results) {
            if (success) {
                // Add attributes for better UI summaries
                let attrs = `name="${toolName}"`;
                if (args) {
                    if (args.path) attrs += ` path="${args.path}"`;
                    if (args.command) attrs += ` command="${this._escapeAttr(args.command)}"`;
                    if (args.query) attrs += ` query="${this._escapeAttr(args.query)}"`;
                }

                // Render compact card HTML wrapping raw result
                // Note: We use a custom attribute strategy to help MessageRenderer extract summary
                formatted += `<tool_result ${attrs}>${JSON.stringify(result)}</tool_result>\n\n`;
            } else {
                // Errors still show inline
                formatted += `<div style="color:#ff3b30; font-size:11px; padding:4px 0;">❌ ${toolName} failed: ${error}</div>\n\n`;
            }
        }

        return formatted;
    }

    _escapeAttr(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;');
    }

    _handleError(error) {
        const errorMessage = typeof error === 'string' ? error : error.message;

        StateStore.setState(prevState => ({
            ui: { ...prevState.ui, isStreaming: false },
            conversation: {
                ...prevState.conversation,
                currentStream: null
            },
            debug: {
                ...prevState.debug,
                lastError: errorMessage
            }
        }));

        this._cleanup();

        // Emit error event
        StateStore.emit('ai:error', { error: errorMessage });
    }

    _cleanup() {
        ipcRenderer.removeListener('llm-stream-data', this.handleStreamData);
        this.currentRequestId = null;
        this.streamBuffer = '';
    }
}

// Singleton instance
const instance = new AIExecutor();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakAIExecutor = instance;
}

module.exports = instance;
