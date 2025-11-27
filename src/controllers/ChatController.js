// src/controllers/ChatController.js
const { ipcRenderer } = require('electron');
const crypto = require('crypto');
const { AvailableModels } = require('../utils/enums.js');

let activeStreamTabId = null;

function getStore() {
    return window.tabManager ? window.tabManager.chatStore : null;
}

function getSessions() { 
    const store = getStore();
    return store ? store.get('sessions', []) : []; 
}

// FIX: Added 'silent' parameter to avoid full re-render loops during streaming
function saveSessions(sessions, silent = false) { 
    const store = getStore();
    if (store) {
        store.set('sessions', sessions);
        if (!silent && window.tabManager) window.tabManager.renderView();
    }
}

function sendChatMessage(sessionId, content, modelId, attachedFiles = []) {
    const sessions = getSessions();
    const session = sessions.find(s => s.id === sessionId);
    
    if (!session) return;

    session.messages.push({ 
        id: crypto.randomUUID(), role: 'user', content, attachedFiles, timestamp: Date.now() 
    });
    session.model = modelId;

    const placeholderId = crypto.randomUUID();
    session.messages.push({ 
        id: placeholderId, role: 'assistant', content: '', reasoning: '', timestamp: Date.now() + 1 
    });

    activeStreamTabId = sessionId;
    
    // Initial save to show the new bubble
    saveSessions(sessions);

    const sysPrompt = session.systemPrompt || "You are a helpful assistant.";
    const limit = session.contextLimit || 20;
    const history = session.messages.slice(0, -2);
    const apiHistory = limit > 0 ? history.slice(-Math.abs(limit)) : history;
    const recentUserMsg = session.messages[session.messages.length - 2];
    
    const payload = [
        { role: "system", content: sysPrompt },
        ...apiHistory.map(m => ({ role: m.role, content: m.content })),
        { role: recentUserMsg.role, content: recentUserMsg.content + (attachedFiles.length ? `\n[Files: ${attachedFiles.join(', ')}]` : '') }
    ];

    ipcRenderer.send('llm-stream-request', sessionId, modelId, payload);
}

function stopChatStream() { activeStreamTabId = null; }

ipcRenderer.on('llm-stream-data', (event, tabId, response) => {
    const sessions = getSessions();
    const session = sessions.find(s => s.id === tabId);
    if (!session) return;
    
    const lastMsg = session.messages[session.messages.length - 1];
    if (!lastMsg || lastMsg.role !== 'assistant') return;

    if (response.type === 'data') {
        const chunk = response.content;
        if (chunk.includes('<think>')) lastMsg.activeReasoning = true;
        
        if (lastMsg.activeReasoning) {
            if (chunk.includes('</think>')) {
                lastMsg.activeReasoning = false;
                lastMsg.reasoning += chunk.replace('</think>', '');
            } else {
                lastMsg.reasoning = (lastMsg.reasoning || '') + chunk.replace('<think>', '');
            }
        } else {
            lastMsg.content += chunk.replace('</think>', '');
        }
        // FIX: Silent Save (True) - Updates data without refreshing UI
        saveSessions(sessions, true);
    } else if (response.type === 'end' || response.type === 'error') {
        if (lastMsg.activeReasoning) delete lastMsg.activeReasoning;
        if (response.type === 'error') lastMsg.content += `\n[Error: ${response.message}]`;
        activeStreamTabId = null;
        // Final save refreshes UI to ensure state is clean
        saveSessions(sessions, false);
    }
});

module.exports = { 
    sendChatMessage, 
    stopChatStream,
    AvailableModels 
};