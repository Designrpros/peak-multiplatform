/**
 * MessageRenderer.js
 * 
 * Simple message rendering for the new architecture.
 * Renders text content with basic styling, no StreamParser dependencies.
 */

const StateStore = require('../core/StateStore');
const ConversationManager = require('../core/ConversationManager');

class MessageRenderer {
    constructor(container) {
        this.container = container;
        this.messages = [];
        this.unsubscribe = null;
        this.pendingConfirmations = new Map(); // Track pending tool confirmations

        // Subscribe to conversation updates
        this.unsubscribe = StateStore.subscribeTo('conversation', (conversation) => {
            this.renderMessages(conversation.messages, conversation.currentStream);
        });

        // Listen for tool confirmation requests
        StateStore.on('tool:confirmation-required', (data) => {
            this._showToolConfirmation(data);
        });

        // Initial render
        this.renderInitialView();

        // Hydrate from current state immediately
        const currentState = StateStore.getState();
        if (currentState.conversation && (currentState.conversation.messages.length > 0 || currentState.conversation.currentStream)) {
            this.renderMessages(currentState.conversation.messages, currentState.conversation.currentStream);
        }

        // Listen for tool execution completion to clean up confirmation cards
        StateStore.on('tool:execution-completed', (data) => {
            const card = this.container.querySelector(`#tool-confirm-${data.executionId}`);
            if (card) card.remove();

            // Remove from pending map
            if (this.pendingConfirmations.has(data.executionId)) {
                this.pendingConfirmations.delete(data.executionId);
                this._emitPendingUpdates();
            }
        });

        // Listen for tool cancellation
        StateStore.on('tool:cancelled', (data) => {
            const card = this.container.querySelector(`#tool-confirm-${data.executionId}`);
            if (card) card.remove();

            if (this.pendingConfirmations.has(data.executionId)) {
                this.pendingConfirmations.delete(data.executionId);
                this._emitPendingUpdates();
            }
        });
    }

    renderInitialView() {
        this.container.innerHTML = '';

        const wrapper = document.createElement('div');
        // Use min-height to allow growth, and let parent handle scrolling
        wrapper.style.cssText = 'padding: 20px; min-height: 100%; display: flex; flex-direction: column; justify-content: flex-end; box-sizing: border-box; gap: 24px;';

        // --- TOP SECTION: HEADER & INFO ---
        const topSection = document.createElement('div');
        topSection.style.cssText = 'display: flex; flex-direction: column; gap: 24px;';

        topSection.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px; opacity: 0.8;">
                <div style="width: 24px; height: 24px; background: var(--peak-accent); border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="sparkles" style="width: 14px; height: 14px; color: white;"></i>
                </div>
                <h1 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--peak-primary); letter-spacing: -0.02em;">AI Assistant</h1>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <!-- Column 1: Workflow -->
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Workflow</h3>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="map" style="width: 12px; height: 12px; color: var(--peak-accent); opacity: 0.8;"></i>
                            <span><strong>Plan:</strong> Break down tasks</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="code-2" style="width: 12px; height: 12px; color: var(--peak-accent); opacity: 0.8;"></i>
                            <span><strong>Execute:</strong> Write & Edit code</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="check-circle-2" style="width: 12px; height: 12px; color: var(--peak-accent); opacity: 0.8;"></i>
                            <span><strong>Review:</strong> Validate changes</span>
                        </div>
                    </div>
                </div>

                <!-- Column 2: Tools -->
                <div>
                    <h3 style="margin: 0 0 8px 0; font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Power Tools</h3>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <span style="background: var(--control-background-color); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 10px;">@</span>
                            <span>Reference files & symbols</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <span style="background: var(--control-background-color); padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 10px;">/</span>
                            <span>Slash commands</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-primary);">
                            <i data-lucide="image" style="width: 12px; height: 12px; color: var(--peak-secondary);"></i>
                            <span>Drag & Drop images</span>
                        </div>
                    </div>
                </div>
            </div>

            <div style="background: var(--control-background-color); padding: 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                <div style="display: flex; gap: 8px; align-items: flex-start;">
                    <i data-lucide="info" style="width: 14px; height: 14px; color: var(--peak-secondary); margin-top: 1px;"></i>
                    <div style="font-size: 11px; color: var(--peak-secondary); line-height: 1.4;">
                        <strong style="color: var(--peak-primary);">Context Aware:</strong> The AI knows about your active file. Use <strong>@</strong> to add more context explicitly for better results.
                    </div>
                </div>
            </div>
        `;
        wrapper.appendChild(topSection);

        // --- BOTTOM SECTION: HISTORY ---
        const sessions = ConversationManager.getSessions();
        if (sessions.length > 0) {
            // Sort by recent
            sessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

            const bottomSection = document.createElement('div');
            bottomSection.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-top: 20px;';

            bottomSection.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin: 0; font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.05em;">Recent</h2>
                    <button id="btn-flush-history" style="background: none; border: none; color: var(--peak-secondary); font-size: 10px; cursor: pointer; display: flex; align-items: center; gap: 4px; padding: 2px 6px; border-radius: 3px; opacity: 0.6; transition: opacity 0.1s;">
                        Clear
                    </button>
                </div>
                <div id="recent-sessions-list" style="display: flex; flex-direction: column; gap: 4px;">
                    <!-- Sessions injected here -->
                </div>
            `;

            const list = bottomSection.querySelector('#recent-sessions-list');
            // Show fewer sessions to keep it compact (max 5)
            sessions.slice(0, 5).forEach(session => {
                const item = document.createElement('div');
                item.style.cssText = 'padding: 6px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--peak-secondary);';

                // Truncate title
                const title = session.title || 'Untitled Chat';
                const displayTitle = title.length > 35 ? title.substring(0, 35) + '...' : title;

                // Format time (e.g., "2h ago")
                const timeAgo = this.getTimeAgo(session.lastModified || session.created);

                item.innerHTML = `
                    <i data-lucide="message-square" style="width: 12px; height: 12px; opacity: 0.7;"></i>
                    <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--peak-primary);">${displayTitle}</span>
                    <span style="font-size: 9px; opacity: 0.6;">${timeAgo}</span>
                `;

                item.onmouseover = () => {
                    item.style.background = 'var(--control-background-color)';
                    item.style.color = 'var(--peak-primary)';
                };
                item.onmouseout = () => {
                    item.style.background = 'transparent';
                    item.style.color = 'var(--peak-secondary)';
                };
                item.onclick = () => {
                    if (window.loadChatSession) window.loadChatSession(session.id);
                };
                list.appendChild(item);
            });

            // Clear button logic
            const clearBtn = bottomSection.querySelector('#btn-flush-history');
            if (clearBtn) {
                clearBtn.onmouseover = () => clearBtn.style.opacity = '1';
                clearBtn.onmouseout = () => clearBtn.style.opacity = '0.6';
                clearBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (window.clearChatHistory) {
                        window.clearChatHistory();
                        // Re-render handled by clearChatHistory logic or state update usually, but initial view might need manual re-call if not reactive to emptiness immediately
                        // Actually clearChatHistory reloads or might trigger updates. 
                        // If we are still "empty", StateStore update should trigger renderMessages -> renderInitialView.
                    }
                };
            }

            wrapper.appendChild(bottomSection);
        }

        this.container.appendChild(wrapper);
        if (window.lucide) window.lucide.createIcons();
    }

    getTimeAgo(timestamp) {
        if (!timestamp) return '';
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        let interval = seconds / 31536000;
        if (interval > 1) return Math.floor(interval) + "y";
        interval = seconds / 2592000;
        if (interval > 1) return Math.floor(interval) + "mo";
        interval = seconds / 86400;
        if (interval > 1) return Math.floor(interval) + "d";
        interval = seconds / 3600;
        if (interval > 1) return Math.floor(interval) + "h";
        interval = seconds / 60;
        if (interval > 1) return Math.floor(interval) + "m";
        return Math.floor(seconds) + "s";
    }

    renderMessages(messages, currentStream) {
        // Enforce container padding for "edge-to-edge" feel with slight bezel
        this.container.style.padding = '10px 12px';
        this.container.style.boxSizing = 'border-box';

        // If no messages and no stream, show welcome
        if (messages.length === 0 && !currentStream) {
            this.renderInitialView();
            return;
        }

        // DON'T clear existing messages - only update what changes
        // This preserves tool cards that were already rendered
        const existingMessages = this.container.querySelectorAll('.chat-message');

        // Only re-render if message count changed or stream updated
        const needsFullRender = existingMessages.length !== messages.length;


        if (needsFullRender) {
            this.container.innerHTML = '';

            // Render each message
            for (const msg of messages) {
                const messageEl = this.createMessageElement(msg);
                this.container.appendChild(messageEl);
            }
        }

        // Only render current stream if it's NOT already in messages
        const lastMessage = messages[messages.length - 1];
        const isStreamAlreadySaved = lastMessage &&
            lastMessage.role === 'assistant' &&
            currentStream &&
            lastMessage.content.includes(currentStream.content.slice(0, 100));

        // Remove old stream element if exists
        const oldStream = this.container.querySelector('.streaming-message');
        if (oldStream) oldStream.remove();

        if (currentStream && currentStream.content && !isStreamAlreadySaved) {
            const streamMsg = {
                role: 'assistant',
                content: currentStream.content,
                timestamp: Date.now(),
                isStreaming: currentStream.status === 'streaming'
            };
            const streamEl = this.createMessageElement(streamMsg);
            streamEl.classList.add('streaming-message');
            this.container.appendChild(streamEl);
        }

        // Smart auto-scroll
        const isNearBottom = this.container.scrollHeight - this.container.scrollTop - this.container.clientHeight < 100;

        if (isNearBottom || !this._hasScrolled) {
            this.container.scrollTop = this.container.scrollHeight;
            this._hasScrolled = true;
        }

        // Initialize Lucide icons for rendered cards
        if (window.lucide) {
            window.lucide.createIcons({ el: this.container });
        }

        // Attach card event listeners
        this._attachCardListeners();

        // Auto-scroll streaming content if it exists
        const streamingContent = this.container.querySelector('.streaming-message .message-content');
        if (streamingContent) {
            streamingContent.scrollTop = streamingContent.scrollHeight;
        }
    }

    _attachCardListeners() {
        // Toggle Code Block listener (Compact)
        this.container.addEventListener('click', (e) => {
            const toggleBtn = e.target.closest('.toggle-code-btn-compact');
            if (toggleBtn) {
                const card = toggleBtn.closest('.file-edit-card-compact') || toggleBtn.closest('.tool-card-compact');
                if (card) {
                    const codeBlock = card.querySelector('.file-code-collapsed');
                    if (codeBlock) {
                        const isHidden = codeBlock.style.display === 'none';
                        codeBlock.style.display = isHidden ? 'block' : 'none';
                        // Update icon only if needed, or purely visual toggle state
                        toggleBtn.style.opacity = isHidden ? '1' : '0.6';
                    }
                }
            }

            // Open File listener (ViewFileCard)
            const viewBtn = e.target.closest('.tool-view-btn');
            if (viewBtn) {
                const path = decodeURIComponent(viewBtn.dataset.path);
                if (path) {
                    const StateStore = require('../core/StateStore');
                    StateStore.emit('ui:open-file', path);

                    // Visual feedback
                    const originalIcon = viewBtn.innerHTML;
                    viewBtn.innerHTML = '<i data-lucide="check" style="width:11px; height:11px;"></i>';
                    if (window.lucide) window.lucide.createIcons({ el: viewBtn });

                    setTimeout(() => {
                        viewBtn.innerHTML = originalIcon;
                        if (window.lucide) window.lucide.createIcons({ el: viewBtn });
                    }, 2000);
                }
            }
        });

        // Copy buttons
        this.container.querySelectorAll('.copy-code-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const codeBlock = e.target.closest('.file-edit-card-compact')?.querySelector('code');
                if (codeBlock) {
                    try {
                        await navigator.clipboard.writeText(codeBlock.textContent);
                        const icon = btn.querySelector('i');
                        if (icon) {
                            icon.setAttribute('data-lucide', 'check');
                            window.lucide?.createIcons({ el: btn });
                            setTimeout(() => {
                                icon.setAttribute('data-lucide', 'copy');
                                window.lucide?.createIcons({ el: btn });
                            }, 2000);
                        }
                    } catch (err) {
                        console.error('Failed to copy:', err);
                    }
                }
            });
        });
    }

    createMessageElement(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `term-chat-msg ${message.role}`;

        if (message.role === 'user') {
            // New Antigravity User Message Style - Unified Bubble
            // "User chat message needs outside margin" -> We'll add margin-bottom for separation
            messageDiv.style.cssText = `
                position: relative;
                margin: 0 0 8px 0; /* Outside margin */
                width: 100%;
                max-width: 100%;
                box-sizing: border-box;
                background: transparent !important;
                border: 1px solid var(--border-color);
                border-radius: 6px;
                box-shadow: none !important;
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;

            const contentId = `msg-content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

            // Auto-collapse logic
            const contentToShow = message.displayContent || message.content;
            const isLongMessage = contentToShow.length > 500;
            const initialDisplay = isLongMessage ? 'none' : 'block';

            // Content Body - Text on left
            const body = document.createElement('div');
            body.id = contentId;
            body.className = 'message-content';
            body.style.cssText = `
                padding: 6px 10px 8px 10px; /* Tighter padding */
                font-size: 13px;
                line-height: 1.5;
                color: var(--peak-secondary);
                white-space: pre-wrap;
                width: 100%;
                box-sizing: border-box;
                display: block; /* Always block, use maxHeight for collapse */
            `;
            body.innerHTML = this._renderRichContent(contentToShow);

            // Actions - Icons right bottom side
            // We use absolute positioning to place them in the corner
            const actionsContainer = document.createElement('div');
            actionsContainer.className = 'user-msg-actions';
            actionsContainer.style.cssText = `
                position: absolute;
                bottom: 4px;
                right: 6px;
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 2px;
                background: transparent;
                opacity: 0.8;
            `;

            actionsContainer.innerHTML = `
                <button class="msg-action-btn toggle-btn" title="Toggle Content" data-target="${contentId}" style="display: ${isLongMessage ? 'flex' : 'none'}; padding: 2px; color: var(--peak-secondary); background: none; border: none; cursor: pointer; align-items: center;">
                     <i data-lucide="${initialDisplay === 'none' ? 'chevron-right' : 'chevron-down'}" style="width: 13px; height: 13px;"></i>
                </button>
                <button class="msg-action-btn copy-btn" title="Copy Text" style="padding: 2px; color: var(--peak-secondary); background: none; border: none; cursor: pointer;">
                     <i data-lucide="copy" style="width: 12px; height: 12px;"></i>
                </button>
                <button class="msg-action-btn rewind-btn" title="Start from here" style="padding: 2px; color: var(--peak-secondary); background: none; border: none; cursor: pointer;">
                     <i data-lucide="history" style="width: 12px; height: 12px;"></i>
                </button>
            `;

            // Append children
            // Note: No separate header div anymore
            messageDiv.appendChild(body);
            messageDiv.appendChild(actionsContainer);

            // Listeners
            const toggleBtn = actionsContainer.querySelector('.toggle-btn');
            const copyBtn = actionsContainer.querySelector('.copy-btn');
            const rewindBtn = actionsContainer.querySelector('.rewind-btn');

            // Toggle Logic
            if (isLongMessage) {
                // If long, we need a way to show the "Show More" if it's hidden
                // But if display is none, where do we click? 
                // Ah, if display is none, the body is hidden.
                // We need a "Collapsed Placeholder" or keep the toggle button visible.
                // Since actions are absolute, they might be visible? 
                // But if body height is 0, container height is minimal? 
                // Let's ensure container has min-height or placeholder.

                // If collapsed, we show a preview line?
                if (initialDisplay === 'none') {
                    body.style.maxHeight = '60px'; // Show a bit
                    body.style.overflow = 'hidden';
                    body.style.maskImage = 'linear-gradient(to bottom, black 50%, transparent 100%)';
                    body.style.webkitMaskImage = 'linear-gradient(to bottom, black 50%, transparent 100%)';
                }
            }

            // Fixed Toggle Logic for collapsible view
            toggleBtn.onclick = () => {
                if (body.style.maxHeight) {
                    // Expand
                    body.style.maxHeight = '';
                    body.style.maskImage = '';
                    body.style.webkitMaskImage = '';
                    toggleBtn.innerHTML = '<i data-lucide="chevron-down" style="width: 13px; height: 13px;"></i>';
                } else {
                    // Collapse
                    body.style.maxHeight = '60px';
                    body.style.maskImage = 'linear-gradient(to bottom, black 50%, transparent 100%)';
                    body.style.webkitMaskImage = 'linear-gradient(to bottom, black 50%, transparent 100%)';
                    toggleBtn.innerHTML = '<i data-lucide="chevron-right" style="width: 13px; height: 13px;"></i>';
                }
                if (window.lucide) window.lucide.createIcons({ el: toggleBtn });
            };

            copyBtn.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(contentToShow);
                    copyBtn.innerHTML = '<i data-lucide="check" style="width: 12px; height: 12px;"></i>';
                    if (window.lucide) window.lucide.createIcons({ el: copyBtn });
                    setTimeout(() => {
                        copyBtn.innerHTML = '<i data-lucide="copy" style="width: 12px; height: 12px;"></i>';
                        if (window.lucide) window.lucide.createIcons({ el: copyBtn });
                    }, 1500);
                } catch (e) { console.error(e); }
            };

            rewindBtn.onclick = () => {
                const StateStore = require('../core/StateStore');
                if (confirm('Start conversation from this step?')) {
                    StateStore.emit('ui:rewind-request', { messageContent: message.content });
                }
            };

        } else if (message.role === 'assistant') {
            // Assistant Message - Clean & Standard
            // "make them expand full with aliging with the user chat messagee"
            messageDiv.style.cssText = `
                background: transparent;
                padding: 0 4px; /* Align text start with user message text (which has 10px padding - 1px border = 9px visual?) Let's try matching visually. */
                margin: 0 0 8px 0; /* Tight spacing */
                font-size: 13px;
                line-height: 1.6;
                color: var(--peak-primary);
                width: 100%;
                box-sizing: border-box;
            `;
            messageDiv.innerHTML = this._renderRichContent(message.content);
        }     // Streaming indicator if active
        if (message.isStreaming) {
            const indicator = this._createStreamIndicator();
            messageDiv.appendChild(indicator);
        }


        return messageDiv;
    }

    _extractSummary(content, hasTools) {
        // If it has tools, create a tool-specific summary
        if (hasTools) {
            // Check for tool call first
            const toolMatch = content.match(/<tool\s+([^>]+)>/);
            if (toolMatch) {
                const attrs = this._parseToolAttributes(toolMatch[1]);
                const name = attrs.name;
                const path = attrs.path;
                const cmd = attrs.command || attrs.cmd;

                if (name === 'view_file' || name === 'read_file') return `👁️ Reading: ${path || 'file'}`;
                if (name === 'edit_file') return `✏️ Editing: ${path || 'file'}`;
                if (name === 'update_file') return `📝 Updating: ${path || 'file'}`;
                if (name === 'create_file') return `✨ Creating: ${path || 'file'}`;
                if (name === 'delete_file') return `🗑️ Deleting: ${path || 'file'}`;
                if (name === 'list_directory') return `📂 List: ${path || '.'}`;
                if (name === 'run_command') return `💻 Run: ${cmd ? (cmd.length > 40 ? cmd.substring(0, 37) + '...' : cmd) : 'command'}`;
                if (name === 'search_project') return `🔍 Search: ${attrs.query || 'project'}`;
                if (name === 'get_problems') return `🚨 Checking Problems`;
                if (name === 'capture_live_view') return `📸 Capturing Live View`;

                return `🔧 Using ${name} tool...`;
            }

            // Check for tool result
            const resultMatch = content.match(/<tool_result\s+([^>]+)>/);
            if (resultMatch) {
                const attrs = this._parseToolAttributes(resultMatch[1]);
                const name = attrs.name;
                const path = attrs.path;
                const cmd = attrs.command;

                if (name === 'view_file') return `✓ Read: ${path || 'file'}`;
                if (name === 'edit_file' || name === 'update_file') return `✓ Edited: ${path || 'file'}`;
                if (name === 'create_file') return `✓ Created: ${path || 'file'}`;
                if (name === 'run_command') return `✓ Ran: ${cmd ? (cmd.length > 30 ? cmd.substring(0, 27) + '...' : cmd) : 'command'}`;
                if (name === 'list_directory') return `✓ Listed: ${path || '.'}`;

                return `✓ ${name} completed`;
            }
        }

        // Otherwise extract meaningful text summary
        // Remove all tags first
        let text = content.replace(/<[^>]*>/g, '').trim();

        // Get first meaningful sentence or first 100 chars
        const firstSentence = text.match(/^[^.!?]+[.!?]/);
        if (firstSentence) {
            return firstSentence[0].trim();
        }

        if (text.length > 100) {
            return text.substring(0, 97) + '...';
        }

        return text || 'AI thinking...';
    }

    _renderRichContent(content) {
        // Import dependencies
        const { marked } = require('marked');
        const hljs = require('highlight.js');

        // Import card renderers
        const { renderListDirectoryCard } = require('../ui/sub-cards/ListDirectoryCard');
        const { renderFileEditCard } = require('../ui/sub-cards/FileEditCard');
        const { renderViewFileCard } = require('../ui/sub-cards/ViewFileCard');
        const { renderCommandCard } = require('../ui/sub-cards/CommandCard');
        const { renderSearchCard } = require('../ui/sub-cards/SearchCard');
        const { renderGenericToolCard } = require('../ui/sub-cards/GenericToolCard');
        const { renderToolResultCard } = require('../ui/sub-cards/ToolResultCard');
        const { renderLivePreviewCard } = require('../ui/sub-cards/LivePreviewCard'); // Import new card
        const { renderGeneratingFileCard } = require('../ui/sub-cards/FileEditCard'); // Import generating card

        // Configure marked with syntax highlighting
        if (!this._markedConfigured) {
            marked.setOptions({
                highlight: function (code, lang) {
                    if (lang && hljs.getLanguage(lang)) {
                        return hljs.highlight(code, { language: lang }).value;
                    }
                    return hljs.highlightAuto(code).value;
                },
                breaks: true, // Render newlines as <br>
                gfm: true     // GitHub Flavored Markdown
            });
            this._markedConfigured = true;
        }

        let processed = content;
        const placeholders = new Map();
        let placeholderCounter = 0;

        // Helper to replace content with placeholder
        const createPlaceholder = (htmlContent) => {
            // Use a strictly alphanumeric format that Markdown won't touch (no underscores/special chars)
            // zTOOLPHLDRz0z, zTOOLPHLDRz1z, etc.
            const id = `zTOOLPHLDRz${placeholderCounter++}z`;
            placeholders.set(id, htmlContent);
            return id;
        };

        // 0. Extract and replace INCOMPLETE tool tags (Streaming)
        // Detects <tool name="...">content... (no closing tag)
        // We match from the start of the tag to the end of the string, but only if it DOESN'T have a closing tag
        // Note: This is tricky with regex, so we look for the *last* occurrence of <tool that doesn't have a matching </tool>
        const lastToolIndex = processed.lastIndexOf('<tool ');
        const lastClosingIndex = processed.lastIndexOf('</tool>');

        if (lastToolIndex > -1 && lastToolIndex > lastClosingIndex) {
            // We have an open tool tag at the end!
            const toolFragment = processed.substring(lastToolIndex);

            // Extract standard attributes
            const nameMatch = toolFragment.match(/name="([^"]+)"/);
            const pathMatch = toolFragment.match(/path="([^"]+)"/);
            const toolName = nameMatch ? nameMatch[1] : 'unknown';
            const path = pathMatch ? pathMatch[1] : 'unknown';

            // Extract content (everything after the opening tag)
            const contentStart = toolFragment.indexOf('>') + 1;
            let content = '';
            if (contentStart > 0) {
                content = toolFragment.substring(contentStart);
            }

            // Render the "Generating..." card
            // console.log('[MessageRenderer] Detected streaming tool:', toolName, path);
            const cardHTML = renderGeneratingFileCard(path, content);

            // Replace the ENTIRE fragment with the card
            // We strip the fragment from 'processed' and append the placeholder
            processed = processed.substring(0, lastToolIndex);
            const placeholderId = createPlaceholder(`<div style="margin: 4px 0;">${cardHTML}</div>`);
            processed += placeholderId;
        }

        // 1. Extract and replace <tool_result> tags
        const resultRegex = /\<tool_result\s+name="([^"]+)"\>([\s\S]*?)\<\/tool_result\>/gi;
        processed = processed.replace(resultRegex, (match, toolName, resultContent) => {
            try {
                let result;
                const trimmed = resultContent.trim();
                if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                    try {
                        result = JSON.parse(resultContent);
                    } catch (jsonError) {
                        result = { content: resultContent };
                    }
                } else {
                    result = { content: resultContent };
                }


                // Special handling for live view result
                if (toolName === 'capture_live_view') {
                    const cardHTML = renderLivePreviewCard(result.url || 'http://localhost:3000');
                    return createPlaceholder(cardHTML);
                }

                const cardHTML = renderToolResultCard(toolName, result);
                return createPlaceholder(cardHTML);
            } catch (e) {
                console.error('[MessageRenderer] Error rendering tool result:', e);
                return createPlaceholder(`<div style="font-size:10px; opacity:0.5;">✓ ${toolName} completed</div>`);
            }
        });

        // 2. Extract and replace <tool> tags
        const toolRegex = /<tool\s+name="([^"]+)"([^>]*?)>[\s\S]*?<\/tool>/gi;
        processed = processed.replace(toolRegex, (match, toolName, attrs) => {
            try {
                const args = this._parseToolAttributes(attrs);
                let cardHTML = '';
                switch (toolName) {
                    case 'list_directory':
                        cardHTML = renderListDirectoryCard(args.path || '.', args.recursive === 'true');
                        break;
                    case 'view_file':
                        cardHTML = renderViewFileCard(args.path, args.content || '', {});
                        break;
                    case 'create_file':
                    case 'update_file':
                    case 'edit_file':
                        let stats = { additions: 0, deletions: 0 };
                        try {
                            if (toolName === 'create_file' || toolName === 'update_file' || toolName === 'write_to_file') {
                                if (args.content) stats.additions = args.content.split('\n').length;
                            } else {
                                if (args.search && args.replace) {
                                    stats.deletions = args.search.split('\n').length;
                                    stats.additions = args.replace.split('\n').length;
                                } else if (args.content) {
                                    const searchBlocks = args.content.match(/<{7}\s*SEARCH\s*([\s\S]*?)={7}/g);
                                    const replaceBlocks = args.content.match(/={7}\s*([\s\S]*?)>{7}\s*REPLACE/g);
                                    if (searchBlocks) searchBlocks.forEach(b => stats.deletions += b.replace(/<{7}\s*SEARCH\s*/, '').replace(/={7}/, '').split('\n').length);
                                    if (replaceBlocks) replaceBlocks.forEach(b => stats.additions += b.replace(/={7}\s*/, '').replace(/>{7}\s*REPLACE/, '').split('\n').length);
                                }
                            }
                        } catch (e) {
                            console.error('Error calculating stats:', e);
                        }

                        cardHTML = renderFileEditCard(args.path || 'unknown', args.content || '', toolName, stats);
                        break;
                    case 'run_command':
                        cardHTML = renderCommandCard(args.command || '', args.cwd || '.');
                        break;
                    case 'search_project':
                    case 'search_codebase':
                        cardHTML = renderSearchCard(args.query || '', args.path || '.');
                        break;
                    default:
                        cardHTML = renderGenericToolCard(toolName, args, 'builtin');
                }

                // Wrap in container
                const wrappedHTML = `<div style="margin: 4px 0; font-size: 12px; opacity: 0.95;">${cardHTML}</div>`;
                return createPlaceholder(wrappedHTML);
            } catch (e) {
                console.error('[MessageRenderer] Error rendering tool card:', e);
                return createPlaceholder(`<div style="color:red; font-size:11px;">⚠️ Tool error: ${e.message}</div>`);
            }
        });

        // 3. Extract and replace <step> tags
        processed = processed.replace(/<step\s+title="([^"]+)">([\s\S]*?)<\/step>/gi, (match, title, stepContent) => {
            return `\n**📍 ${title}**\n${stepContent}`;
        });

        // 4. Extract and replace <thinking> tags
        // Handle completed thinking blocks
        const thinkingRegex = /<thinking>([\s\S]*?)<\/thinking>/gi;
        processed = processed.replace(thinkingRegex, (match, content) => {
            const cardHTML = `
                <div class="thinking-minimal" style="margin: 2px 0 8px 0;">
                    <div class="thinking-header" style="display: flex; align-items: center; gap: 4px; cursor: pointer; font-size: 13px; color: var(--peak-secondary); opacity: 0.8; user-select: none;" onclick="this.nextElementSibling.style.display = this.nextElementSibling.style.display === 'none' ? 'block' : 'none'; this.querySelector('.chevron').style.transform = this.nextElementSibling.style.display === 'none' ? 'rotate(0deg)' : 'rotate(90deg)';">
                        <i class="chevron" data-lucide="chevron-right" style="width: 14px; height: 14px; transition: transform 0.2s;"></i>
                        <span style="font-style: italic;">thinking...</span>
                    </div>
                    <div class="thinking-content" style="display: none; padding-left: 20px; border-left: 1px solid var(--border-color); margin-left: 6px; margin-top: 4px; font-size: 12px; color: var(--peak-secondary);">
                        ${marked.parse(content)}
                    </div>
                </div>
            `;
            return createPlaceholder(cardHTML);
        });

        // Handle incomplete (streaming) thinking blocks
        const openThinkingIndex = processed.lastIndexOf('<thinking>');
        const closeThinkingIndex = processed.lastIndexOf('</thinking>');

        if (openThinkingIndex > -1 && openThinkingIndex > closeThinkingIndex) {
            // For streaming, just show the minimal label, no content preview to keep it "nothing more"
            const cardHTML = `
                <div class="thinking-streaming" style="margin: 2px 0 8px 0; display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--peak-secondary); opacity: 0.7;">
                    <span style="display: inline-block; width: 6px; height: 6px; background: currentColor; border-radius: 50%; animation: pulse 1s infinite;"></span>
                    <span style="font-style: italic;">thinking...</span>
                </div>
             `;
            processed = processed.substring(0, openThinkingIndex);
            const placeholderId = createPlaceholder(cardHTML);
            processed += placeholderId;
        }

        // Clean up any stray tags if standard regex didn't catch them (safety)
        // processed = processed.replace(/<thinking>[\s\S]*?<\/thinking>/gi, ''); // Removed strip logic
        processed = processed.replace(/<tool\s+name="([^"]+)"[^>]*$/gi, ''); // Incomplete tool
        processed = processed.replace(/USER QUESTION:\s*/gi, '');

        // 5. Render Markdown
        try {
            processed = marked.parse(processed);
        } catch (err) {
            console.error('[MessageRenderer] Markdown parsing failed:', err);
            // Fallback to basic escaping if marked fails
            const div = document.createElement('div');
            div.textContent = processed;
            processed = div.innerHTML.replace(/\n/g, '<br>');
        }

        // 6. Restore Placeholders
        // We need to match placeholders that might have been wrapped in <p> tags by marked
        placeholders.forEach((html, id) => {
            // Check for wrapped paragraph first (Markdown often does this for block elements)
            // <p>zTOOLPHLDRz0z</p>
            const pWrapped = `<p>${id}</p>`;
            if (processed.includes(pWrapped)) {
                processed = processed.replace(pWrapped, html);
            }

            // Fallback replace all occurrences
            // Using split/join is safer for raw string replacement
            processed = processed.split(id).join(html);
        });

        // 7. Render lucide icons
        setTimeout(() => {
            if (window.lucide) {
                window.lucide.createIcons();
            }
        }, 0);

        return processed;
    }

    _parseToolAttributes(attrString) {
        const args = {};
        // Parse key="value" pairs
        const attrRegex = /(\w+)="([^"]*)"/g;
        let match;
        while ((match = attrRegex.exec(attrString)) !== null) {
            args[match[1]] = match[2];
        }
        return args;
    }

    _escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    _createApprovalButtons() {
        const container = document.createElement('div');
        container.style.cssText = `
            display: flex;
            gap: 10px;
            padding-top: 16px;
            margin-top: 16px;
            border-top: 1px solid var(--border-color);
        `;

        // Approve button
        const approveBtn = document.createElement('button');
        approveBtn.className = 'peak-button primary';
        approveBtn.innerHTML = `
            <i data-lucide="check-circle" style="width: 14px; height: 14px;"></i>
            <span>Approve Plan</span>
        `;
        approveBtn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background: linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.1));
            border: 1px solid rgba(34, 197, 94, 0.3);
            border-radius: 8px;
            color: rgb(34, 197, 94);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        approveBtn.addEventListener('click', () => this._handleApproval(true, container));

        // Revise button
        const reviseBtn = document.createElement('button');
        reviseBtn.className = 'peak-button secondary';
        reviseBtn.innerHTML = `
            <i data-lucide="edit-3" style="width: 14px; height: 14px;"></i>
            <span>Request Changes</span>
        `;
        reviseBtn.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            color: var(--peak-secondary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
        `;
        reviseBtn.addEventListener('click', () => this._handleApproval(false, container));

        // Hover effects
        approveBtn.addEventListener('mouseenter', () => {
            approveBtn.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.25), rgba(34, 197, 94, 0.15))';
            approveBtn.style.transform = 'translateY(-1px)';
        });
        approveBtn.addEventListener('mouseleave', () => {
            approveBtn.style.background = 'linear-gradient(135deg, rgba(34, 197, 94, 0.15), rgba(34, 197, 94, 0.1))';
            approveBtn.style.transform = 'translateY(0)';
        });

        reviseBtn.addEventListener('mouseenter', () => {
            reviseBtn.style.background = 'rgba(255, 255, 255, 0.05)';
            reviseBtn.style.transform = 'translateY(-1px)';
        });
        reviseBtn.addEventListener('mouseleave', () => {
            reviseBtn.style.background = 'var(--card-background)';
            reviseBtn.style.transform = 'translateY(0)';
        });

        container.appendChild(approveBtn);
        container.appendChild(reviseBtn);

        // Initialize lucide icons
        if (window.lucide) {
            window.lucide.createIcons({ el: container });
        }

        return container;
    }

    _handleApproval(approved, buttonContainer) {
        const AIExecutor = require('../core/AIExecutor');

        if (approved) {
            // Remove buttons and show confirmation
            buttonContainer.innerHTML = `
                <div style="color: rgb(34, 197, 94); font-size: 12px; font-weight: 500; padding: 4px 0;">
                    ✓ Plan approved, proceeding with implementation...
                </div>
            `;

            // Send approval message
            AIExecutor.sendMessage('Approved, proceed with the plan.');
        } else {
            // Show feedback input
            buttonContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 8px; width: 100%;">
                    <textarea 
                        placeholder="What changes would you like to the plan?"
                        style="
                            width: 100%;
                            min-height: 80px;
                            padding: 10px;
                            background: var(--card-background);
                            border: 1px solid var(--border-color);
                            border-radius: 8px;
                            color: var(--peak-primary);
                            font-size: 12px;
                            font-family: inherit;
                            resize: vertical;
                        "
                    ></textarea>
                    <div style="display: flex; gap: 8px;">
                        <button class="send-feedback-btn" style="
                            padding: 8px 16px;
                            background: linear-gradient(135deg, rgba(59, 130, 246, 0.15), rgba(59, 130, 246, 0.1));
                            border: 1px solid rgba(59, 130, 246, 0.3);
                            border-radius: 8px;
                            color: rgb(59, 130, 246);
                            font-size: 12px;
                            font-weight: 500;
                            cursor: pointer;
                        ">Send Feedback</button>
                        <button class="cancel-btn" style="
                            padding: 8px 16px;
                            background: transparent;
                            border: 1px solid var(--border-color);
                            border-radius: 8px;
                            color: var(--peak-secondary);
                            font-size: 12px;
                            cursor: pointer;
                        ">Cancel</button>
                    </div>
                </div>
            `;

            const textarea = buttonContainer.querySelector('textarea');
            const sendBtn = buttonContainer.querySelector('.send-feedback-btn');
            const cancelBtn = buttonContainer.querySelector('.cancel-btn');

            sendBtn.addEventListener('click', () => {
                const feedback = textarea.value.trim();
                if (feedback) {
                    buttonContainer.innerHTML = `
                        <div style="color: rgb(59, 130, 246); font-size: 12px; font-weight: 500; padding: 4px 0;">
                            ↻ Revising plan based on your feedback...
                        </div>
                    `;
                    AIExecutor.sendMessage(`Please revise the plan. Feedback: ${feedback}`);
                }
            });

            cancelBtn.addEventListener('click', () => {
                // Restore original buttons
                buttonContainer.replaceWith(this._createApprovalButtons());
            });

            textarea.focus();
        }
    }

    _createStreamIndicator() {
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            display: flex;
            align-items: center;
            gap: 6px;
            padding-top: 8px;
            margin-top: 8px;
            border-top: 1px solid var(--border-color);
            font-size: 11px;
            color: var(--peak-secondary);
        `;

        const pulse = document.createElement('span');
        pulse.style.cssText = `
            display: inline-block;
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background: var(--peak-accent);
            animation: pulse 1.5s ease-in-out infinite;
        `;

        indicator.appendChild(pulse);
        indicator.appendChild(document.createTextNode(' Streaming...'));

        // Add pulse animation
        if (!document.getElementById('pulse-animation')) {
            const style = document.createElement('style');
            style.id = 'pulse-animation';
            style.textContent = `
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.5; transform: scale(0.9); }
                }
            `;
            document.head.appendChild(style);
        }

        return indicator;
    }

    _showToolConfirmation({ executionId, toolName, args }) {
        const ToolExecutor = require('../core/ToolExecutor');
        const StateStore = require('../core/StateStore');

        // Create compact inline confirmation card
        const confirmCard = document.createElement('div');
        confirmCard.id = `tool-confirm-${executionId}`;
        confirmCard.className = 'tool-confirmation-card';
        confirmCard.style.cssText = `
            margin: 4px 0;
            padding: 8px 12px;
            background: rgba(59, 130, 246, 0.04);
            border-left: 2px solid rgb(59, 130, 246);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
        `;

        const toolInfo = document.createElement('div');
        toolInfo.style.cssText = `
            font-size: 11px;
            color: var(--peak-primary);
            flex: 1;
            min-width: 0;
        `;

        const toolLabel = args.path || args.command || '';
        toolInfo.innerHTML = `
            <strong style="color: rgb(59, 130, 246); font-size: 10px;">🔧 ${toolName}</strong>
            ${toolLabel ? `<span style="opacity: 0.6; margin-left: 6px; font-size: 10px;">${toolLabel}</span>` : ''}
        `;

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = `
            display: flex;
            gap: 6px;
            flex-shrink: 0;
        `;

        // Accept button (individual tool)
        const approveBtn = document.createElement('button');
        approveBtn.textContent = 'Accept';
        approveBtn.style.cssText = `
            padding: 4px 10px;
            background: rgb(34, 197, 94);
            color: white;
            border: none;
            border-radius: 4px;
            font-size: 10px;
            cursor: pointer;
            font-weight: 600;
        `;
        approveBtn.onclick = async () => {
            confirmCard.remove();
            await ToolExecutor.confirmExecution(executionId);
        };

        // Reject button (compact)
        const rejectBtn = document.createElement('button');
        rejectBtn.textContent = 'Reject';
        rejectBtn.style.cssText = `
            padding: 4px 10px;
            background: rgba(239, 68, 68, 0.1);
            color: rgb(239, 68, 68);
            border: 1px solid rgba(239, 68, 68, 0.3);
            border-radius: 4px;
            font-size: 10px;
            cursor: pointer;
            font-weight: 500;
        `;
        rejectBtn.onclick = () => {
            confirmCard.remove();
            ToolExecutor.cancelExecution(executionId);
        };

        buttonContainer.appendChild(approveBtn);
        buttonContainer.appendChild(rejectBtn);
        confirmCard.appendChild(toolInfo);
        confirmCard.appendChild(buttonContainer);

        // Append to container
        this.container.appendChild(confirmCard);
        this.container.scrollTop = this.container.scrollHeight;

        // Track pending confirmation
        this.pendingConfirmations.set(executionId, { executionId, toolName, args });
        this._emitPendingUpdates();

        // Notify that a tool needs confirmation (Legacy/Fallback)
        StateStore.emit('tool:pending-confirmation', { executionId, toolName });

    }

    _emitPendingUpdates() {
        // Emit the full list of pending confirmations to the UI (e.g., InputBar)
        const pendingList = Array.from(this.pendingConfirmations.values());
        StateStore.emit('ui:pending-tools-update', pendingList);
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }

}

module.exports = MessageRenderer;
