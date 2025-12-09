/**
 * ConversationManager.js
 * 
 * Manages conversation history, sessions, and persistence.
 * Replaces scattered history management logic from MCPClient.
 * 
 * Responsibilities:
 * - Session management (create, load, save, delete)
 * - Project-scoped history
 * - Conversation persistence
 * - History truncation for context window management
 */

const StateStore = require('./StateStore');

class ConversationManager {
    constructor() {
        this.currentSessionId = null;

        // Load last active session on init
        this.loadLastSession();

        // Subscribe to conversation changes to auto-save
        StateStore.subscribeTo('conversation', (conversation) => {
            if (this.currentSessionId) {
                this._autoSave();
            }
        });
    }

    /**
     * Start a new conversation session
     * @param {string} projectRoot - Optional project root for scoped sessions
     */
    startNewSession(projectRoot = null) {
        const sessionId = Date.now().toString();
        this.currentSessionId = sessionId;

        console.log('[ConversationManager] Starting new session:', sessionId);

        // Reset conversation state
        StateStore.setState(prevState => ({
            conversation: {
                id: sessionId,
                projectRoot: projectRoot,
                messages: [],
                currentStream: null
            }
        }));

        // Save to storage
        this._saveSession({
            id: sessionId,
            projectRoot: projectRoot,
            title: 'New Chat',
            created: Date.now(),
            lastModified: Date.now(),
            messages: []
        });

        // Mark as active
        sessionStorage.setItem('peak-active-session-id', sessionId);

        return sessionId;
    }

    /**
     * Load a conversation session
     * @param {string} sessionId - Session ID to load
     */
    loadSession(sessionId) {
        const sessions = this.getSessions();
        const session = sessions.find(s => s.id === sessionId);

        if (!session) {
            console.error(`[ConversationManager] Session not found: ${sessionId}`);
            return false;
        }

        console.log('[ConversationManager] Loading session:', sessionId);
        this.currentSessionId = sessionId;

        // Update state
        StateStore.setState(prevState => ({
            conversation: {
                id: session.id,
                projectRoot: session.projectRoot,
                messages: session.messages || [],
                currentStream: null
            }
        }));

        // Mark as active
        sessionStorage.setItem('peak-active-session-id', sessionId);

        StateStore.emit('conversation:session-loaded', { sessionId });
        return true;
    }

    /**
     * Delete a session
     * @param {string} sessionId - Session ID to delete
     */
    deleteSession(sessionId) {
        const sessions = this.getSessions();
        const filtered = sessions.filter(s => s.id !== sessionId);

        localStorage.setItem('peak-chat-sessions', JSON.stringify(filtered));

        // If deleting current session, start a new one
        if (this.currentSessionId === sessionId) {
            this.startNewSession();
        }

        StateStore.emit('conversation:session-deleted', { sessionId });
    }

    /**
     * Get all sessions
     */
    getSessions() {
        try {
            const stored = localStorage.getItem('peak-chat-sessions');
            return stored ? JSON.parse(stored) : [];
        } catch (error) {
            console.error('[ConversationManager] Error loading sessions:', error);
            return [];
        }
    }

    /**
     * Get sessions for a specific project
     * @param {string} projectRoot - Project root path
     */
    getProjectSessions(projectRoot) {
        const all = this.getSessions();
        return all.filter(s => s.projectRoot === projectRoot);
    }

    /**
     * Load last active session (called on init)
     */
    loadLastSession() {
        const activeId = sessionStorage.getItem('peak-active-session-id');

        if (activeId) {
            const loaded = this.loadSession(activeId);
            if (loaded) return;
        }

        // Try to find an empty session to reuse
        const sessions = this.getSessions();
        sessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));

        const emptySession = sessions.find(s =>
            !s.messages || s.messages.length === 0
        );

        if (emptySession) {
            console.log('[ConversationManager] Reusing empty session:', emptySession.id);
            this.loadSession(emptySession.id);
        } else {
            // Start fresh
            this.startNewSession();
        }
    }

    /**
     * Switch to a different project
     * @param {string} projectRoot - New project root
     */
    switchProject(projectRoot) {
        const state = StateStore.getState();
        const currentRoot = state.conversation.projectRoot;

        if (currentRoot === projectRoot) {
            console.log('[ConversationManager] Already on project:', projectRoot);
            return;
        }

        console.log('[ConversationManager] Switching project to:', projectRoot);

        // Try to find or create a session for this project
        const projectSessions = this.getProjectSessions(projectRoot);

        if (projectSessions.length > 0) {
            // Load most recent
            projectSessions.sort((a, b) => (b.lastModified || 0) - (a.lastModified || 0));
            this.loadSession(projectSessions[0].id);
        } else {
            // Start new session for this project
            this.startNewSession(projectRoot);
        }
    }

    /**
     * Generate a smart title for the current session
     */
    async generateTitle() {
        const state = StateStore.getState();
        const messages = state.conversation.messages;

        if (messages.length === 0) return;

        // Find first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        if (!firstUserMsg) return;

        // Extract a title from the first message
        let title = firstUserMsg.content;

        // Remove context prefixes
        title = title.replace(/^Current Project:[\s\S]*?USER QUESTION:\s*/i, '');

        // Get first sentence or first 50 chars
        const firstSentence = title.split(/[.!?\n]/)[0].trim();
        title = firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;

        // Update session
        const sessions = this.getSessions();
        const session = sessions.find(s => s.id === this.currentSessionId);

        if (session) {
            session.title = title || 'New Chat';
            session.lastModified = Date.now();
            localStorage.setItem('peak-chat-sessions', JSON.stringify(sessions));
            StateStore.emit('conversation:title-updated', { sessionId: this.currentSessionId, title });
        }
    }

    /**
     * Truncate history to a specific message
     * Used for "reset to this point" functionality
     */
    truncateToMessage(messageIndex) {
        StateStore.setState(prevState => {
            const truncated = prevState.conversation.messages.slice(0, messageIndex + 1);
            return {
                conversation: {
                    ...prevState.conversation,
                    messages: truncated
                }
            };
        });

        this._autoSave();
    }

    /**
     * Clear current conversation
     */
    clearConversation() {
        StateStore.setState(prevState => ({
            conversation: {
                ...prevState.conversation,
                messages: []
            }
        }));

        this._autoSave();
    }

    /**
     * Export conversation as JSON
     */
    exportConversation() {
        const state = StateStore.getState();
        const session = this.getSessions().find(s => s.id === this.currentSessionId);

        return JSON.stringify({
            session: session,
            messages: state.conversation.messages,
            timestamp: Date.now()
        }, null, 2);
    }

    // ==================== Private Methods ====================

    _autoSave() {
        if (!this.currentSessionId) return;

        const state = StateStore.getState();
        const { messages, projectRoot } = state.conversation;

        const sessions = this.getSessions();
        const sessionIndex = sessions.findIndex(s => s.id === this.currentSessionId);

        if (sessionIndex >= 0) {
            sessions[sessionIndex].messages = messages;
            sessions[sessionIndex].lastModified = Date.now();
            sessions[sessionIndex].projectRoot = projectRoot;
        } else {
            // Session doesn't exist, create it
            sessions.unshift({
                id: this.currentSessionId,
                title: 'New Chat',
                created: Date.now(),
                lastModified: Date.now(),
                projectRoot: projectRoot,
                messages: messages
            });
        }

        localStorage.setItem('peak-chat-sessions', JSON.stringify(sessions));
    }

    _saveSession(session) {
        const sessions = this.getSessions();
        const index = sessions.findIndex(s => s.id === session.id);

        if (index >= 0) {
            sessions[index] = { ...sessions[index], ...session };
        } else {
            sessions.unshift(session);
        }

        localStorage.setItem('peak-chat-sessions', JSON.stringify(sessions));
    }
}

// Singleton instance
const instance = new ConversationManager();

// Expose globally for debugging
if (typeof window !== 'undefined') {
    window.peakConversationManager = instance;
}

module.exports = instance;
