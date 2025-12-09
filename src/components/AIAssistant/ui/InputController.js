/**
 * InputController.js
 * 
 * Handles user input (text, attachments, commands).
 * Replaces InputBar with cleaner architecture.
 */

const StateStore = require('../core/StateStore');
const AIExecutor = require('../core/AIExecutor');
const ConversationManager = require('../core/ConversationManager');

class InputController {
    constructor() {
        this.inputArea = null;
        this.textarea = null;
    }

    /**
     * Initialize input controller
     */
    init() {
        this.inputArea = document.getElementById('input-area');
        if (!this.inputArea) {
            console.error('[InputController] Input area not found');
            return;
        }

        this._render();
        this._attachListeners();
    }

    /**
     * Cleanup
     */
    destroy() {
        // Remove listeners if needed
    }

    // ==================== Private Methods ====================

    _render() {
        this.inputArea.innerHTML = `
            <div class="peak-input-bar" style="padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                <!-- Attachments area -->
                <div id="attachments-area" style="display: none; flex-wrap: wrap; gap: 8px;"></div>
                
                <!-- Input row -->
                <div style="display: flex; gap: 12px; align-items: flex-end;">
                    <!-- Textarea -->
                    <textarea
                        id="peak-input-textarea"
                        placeholder="Type a message or press @ to attach files..."
                        style="
                            flex: 1;
                            min-height: 40px;
                            max-height: 200px;
                            padding: 12px;
                            border-radius: 8px;
                            border: 1px solid var(--border-color);
                            background: var(--background);
                            color: var(--text-color);
                            font-family: inherit;
                            font-size: 14px;
                            resize: vertical;
                        "
                    ></textarea>
                    
                    <!-- Action buttons -->
                    <div style="display: flex; gap: 8px;">
                        <button
                            id="attach-btn"
                            title="Attach File (@)"
                            style="
                                padding: 10px;
                                border-radius: 8px;
                                border: 1px solid var(--border-color);
                                background: var(--background);
                                cursor: pointer;
                            "
                        >
                            <i data-lucide="paperclip" style="width: 16px; height: 16px;"></i>
                        </button>
                        
                        <button
                            id="send-btn"
                            title="Send (Ctrl+Enter)"
                            style="
                                padding: 10px 20px;
                                border-radius: 8px;
                                border: none;
                                background: var(--peak-primary);
                                color: white;
                                cursor: pointer;
                                font-weight: 500;
                            "
                        >
                            Send
                        </button>
                        
                        <button
                            id="stop-btn"
                            title="Stop Generation"
                            style="
                                padding: 10px;
                                border-radius: 8px;
                                border: 1px solid var(--border-color);
                                background: var(--peak-error);
                                color: white;
                                cursor: pointer;
                                display: none;
                            "
                        >
                            <i data-lucide="square" style="width: 16px; height: 16px;"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.textarea = this.inputArea.querySelector('#peak-input-textarea');

        // Initialize lucide icons
        if (window.lucide) window.lucide.createIcons();
    }

    _attachListeners() {
        // Send button
        const sendBtn = this.inputArea.querySelector('#send-btn');
        sendBtn.addEventListener('click', () => this._handleSend());

        // Stop button
        const stopBtn = this.inputArea.querySelector('#stop-btn');
        stopBtn.addEventListener('click', () => this._handleStop());

        // Attach button
        const attachBtn = this.inputArea.querySelector('#attach-btn');
        attachBtn.addEventListener('click', () => this._handleAttach());

        // Textarea: Ctrl+Enter to send
        this.textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this._handleSend();
            }
        });

        // Auto-resize textarea
        this.textarea.addEventListener('input', () => {
            this.textarea.style.height = 'auto';
            this.textarea.style.height = this.textarea.scrollHeight + 'px';
        });

        // Subscribe to streaming state to show/hide stop button
        StateStore.subscribeTo('ui.isStreaming', (isStreaming) => {
            sendBtn.style.display = isStreaming ? 'none' : 'block';
            stopBtn.style.display = isStreaming ? 'block' : 'none';
        });
    }

    async _handleSend() {
        const message = this.textarea.value.trim();
        if (!message) return;

        // Clear input
        this.textarea.value = '';
        this.textarea.style.height = 'auto';

        // Get context (for now, basic)
        const context = {
            projectTitle: 'Current Project',
            root: window.currentProjectRoot || '.',
            // Add more context as needed
        };

        // Send to AI
        await AIExecutor.sendMessage(message, context);

        // Auto-generate title if this is the first message
        const state = StateStore.getState();
        if (state.conversation.messages.length === 1) {
            setTimeout(() => ConversationManager.generateTitle(), 1000);
        }
    }

    _handleStop() {
        AIExecutor.abort();
    }

    _handleAttach() {
        // Show file picker or attachment menu
        console.log('[InputController] Attach file');
        // Implementation would show file picker UI
    }
}

module.exports = InputController;
