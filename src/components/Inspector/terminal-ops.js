// src/components/Inspector/terminal-ops.js
const { ipcRenderer } = require('electron');
const { AvailableModels } = require('../../utils/enums.js');

// Fallback if markdown util is missing
let renderMarkdown = (text) => text.replace(/\n/g, '<br>');
try {
    renderMarkdown = require('../../utils/markdown.js').renderMarkdown;
} catch(e) { console.warn("Markdown renderer missing, using fallback."); }

const TERM_OPS_SESSION_ID = -888; 
let termStreamingMessageRef = null;
let termLocalListener = null;

// In-memory storage for user snippets
let userSnippets = []; 

const DEFAULT_SNIPPETS = [
    { cmd: 'npm install', label: 'npm install' },
    { cmd: 'npm start', label: 'npm start' },
    { cmd: 'npm test', label: 'npm test' },
    { cmd: 'npm run build', label: 'npm run build' },
    { cmd: 'git status', label: 'git status' },
    { cmd: 'git pull', label: 'git pull' },
    { cmd: 'git push', label: 'git push' },
    { cmd: 'git checkout -b feature/', label: 'git checkout -b' },
    { cmd: 'git add .', label: 'git add .' },
    { cmd: 'git commit -m "wip"', label: 'git commit' },
    { cmd: 'git log --oneline', label: 'git log' },
    { cmd: 'docker ps', label: 'docker ps' },
    { cmd: 'docker-compose up -d', label: 'docker up' },
];

function getTerminalOpsHTML() {
    return `
        <div class="inspector-tabs-header">
            <button class="tab-btn active" data-target="guides">Guides</button>
            <button class="tab-btn" data-target="snippets">Snippets</button>
            <button class="tab-btn" data-target="ai">AI</button>
        </div>

        <div id="term-ops-content" class="inspector-content-inner" style="height: calc(100% - 40px); overflow: hidden; display: flex; flex-direction: column; padding: 0;">
            
            <div id="panel-guides" class="term-panel active" style="overflow-y: auto; flex: 1; padding: 0 16px 20px 16px;">
                <div class="inspector-section"><h4 class="inspector-sub-title">Navigation & Files</h4></div>
                <div class="guide-list">
                    <div class="cmd-row"><code>cd ..</code> <span>Go back</span></div>
                    <div class="cmd-row"><code>ls -la</code> <span>List detailed</span></div>
                    <div class="cmd-row"><code>pwd</code> <span>Path</span></div>
                    <div class="cmd-row"><code>open .</code> <span>Open Finder</span></div>
                    <div class="cmd-row"><code>cp [src] [dest]</code> <span>Copy file</span></div>
                    <div class="cmd-row"><code>mv [src] [dest]</code> <span>Move/Rename</span></div>
                    <div class="cmd-row"><code>rm -rf [path]</code> <span>Force delete</span></div>
                    <div class="cmd-row"><code>mkdir -p [path]</code> <span>Make nested dir</span></div>
                    <div class="cmd-row"><code>touch [file]</code> <span>Create file</span></div>
                    <div class="cmd-row"><code>find . -name [x]</code> <span>Find file</span></div>
                </div>

                <div class="inspector-section"><h4 class="inspector-sub-title">System & Process</h4></div>
                <div class="guide-list">
                    <div class="cmd-row"><code>top</code> <span>Process monitor</span></div>
                    <div class="cmd-row"><code>htop</code> <span>Better monitor</span></div>
                    <div class="cmd-row"><code>ps aux</code> <span>All processes</span></div>
                    <div class="cmd-row"><code>kill [pid]</code> <span>Kill process</span></div>
                    <div class="cmd-row"><code>killall [name]</code> <span>Kill by name</span></div>
                    <div class="cmd-row"><code>df -h</code> <span>Disk usage</span></div>
                    <div class="cmd-row"><code>du -sh [dir]</code> <span>Folder size</span></div>
                    <div class="cmd-row"><code>whoami</code> <span>Current user</span></div>
                </div>
            </div>

            <div id="panel-snippets" class="term-panel" style="display:none; flex-direction: column; height: 100%;">
                <div style="padding: 12px 16px; border-bottom: 1px solid var(--border-color); background: var(--window-background-color); display: flex; gap: 8px;">
                    <input type="text" id="new-snippet-cmd" placeholder="Command (e.g. npm run dev)" style="flex: 1; background: var(--control-background-color); border: 1px solid var(--border-color); border-radius: 6px; padding: 6px 8px; font-size: 12px; color: var(--peak-primary); outline: none;">
                    <button id="btn-add-snippet" class="icon-btn" style="background: var(--peak-accent); color: white; border-radius: 6px; width: 28px; height: 28px;">
                        <i data-lucide="plus" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
                <div id="snippets-list-container" style="overflow-y: auto; flex: 1; padding: 16px;"></div>
            </div>

            <div id="panel-ai" class="term-panel" style="display:none; flex-direction:column; height:100%; overflow: hidden;">
                
                <div class="term-chat-history" id="term-inspector-history" style="flex: 1; min-height: 0; overflow-y: auto; padding: 16px;">
                    <div class="term-chat-msg ai markdown-content" style="padding: 0; background: transparent; overflow-wrap: anywhere;">
                        Ready to assist. I can analyze terminal output or suggest commands.
                    </div>
                    <div id="streaming-message-container-term"></div>
                </div>
                
                <div class="inspector-input-container">
                    <div class="inspector-input-box">
                        <textarea class="chat-textarea" id="term-inspector-input" placeholder="Ask AI about terminal..." rows="1"></textarea>
                        
                        <div class="chat-controls">
                            <div class="left-controls">
                                 <button class="chat-icon-btn" id="btn-inspector-analyze" title="Read Terminal Screen">
                                    <i data-lucide="scan-search"></i>
                                 </button>
                            </div>
                            <div class="right-controls">
                                 <button id="term-inspector-send" class="chat-submit-btn" disabled>
                                    <i data-lucide="arrow-up"></i>
                                 </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function attachTerminalOpsListeners(container) {
    const tabs = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.term-panel');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach(p => { p.style.display = 'none'; p.classList.remove('active'); });
            const target = container.querySelector(`#panel-${tab.dataset.target}`);
            if (target) {
                target.style.display = tab.dataset.target === 'ai' || tab.dataset.target === 'snippets' ? 'flex' : 'block';
                target.classList.add('active');
            }
        });
    });

    // Helper to get the active terminal ID
    const getActiveTerminalId = () => {
        if (!window.tabManager || !window.tabManager.getActiveTab) return null;
        const tab = window.tabManager.getActiveTab();
        
        if (tab.content.type === 'terminal') return tab.id;
        
        if (tab.content.type === 'project') {
            const tabId = tab.id;
            const projectData = window.projectTerminalsData ? window.projectTerminalsData[tabId] : null;
            if (projectData && projectData.terminals && projectData.terminals.length > 0) {
                const activeIndex = projectData.activeIndex;
                if (activeIndex >= 0 && activeIndex < projectData.terminals.length) {
                    return projectData.terminals[activeIndex].id;
                }
            }
        }
        return null;
    };

    // --- SNIPPETS ---
    const renderSnippets = () => {
        const listContainer = container.querySelector('#snippets-list-container');
        if (!listContainer) return;

        const allSnippets = [...userSnippets, ...DEFAULT_SNIPPETS];
        
        listContainer.innerHTML = allSnippets.length > 0 ? allSnippets.map((s, index) => `
            <div class="snippet-row" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; background: var(--control-background-color); border: 1px solid var(--border-color); border-radius: 6px; margin-bottom: 6px; cursor: pointer; group;">
                <span class="snippet-cmd" style="font-family: monospace; font-size: 12px; color: var(--peak-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${s.cmd}</span>
                <button class="snippet-del-btn" data-idx="${index}" style="background: transparent; border: none; color: var(--peak-secondary); cursor: pointer; display: flex; padding: 4px; opacity: 0.5;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
        `).join('') : '<div style="text-align:center; color:var(--peak-secondary); padding:20px; font-size:12px;">No snippets</div>';

        listContainer.querySelectorAll('.snippet-row').forEach((row, i) => {
            row.addEventListener('click', (e) => {
                if (e.target.closest('.snippet-del-btn')) return; 
                const tabId = getActiveTerminalId();
                if (tabId) window.ipcRenderer.send('terminal-write', tabId, allSnippets[i].cmd + '\r');
                else alert("No active terminal found.");
            });
        });

        listContainer.querySelectorAll('.snippet-del-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = parseInt(btn.dataset.idx);
                if (idx < userSnippets.length) {
                    userSnippets.splice(idx, 1);
                } else {
                    const defaultIdx = idx - userSnippets.length;
                    DEFAULT_SNIPPETS.splice(defaultIdx, 1);
                }
                renderSnippets();
            });
        });

        if(window.lucide) window.lucide.createIcons();
    };

    // ... (Snippet input logic same as before) ...
    const addSnippetInput = container.querySelector('#new-snippet-cmd');
    const addSnippetBtn = container.querySelector('#btn-add-snippet');
    const addSnippet = () => {
        const cmd = addSnippetInput.value.trim();
        if (cmd) { userSnippets.unshift({ cmd, label: cmd }); addSnippetInput.value = ''; renderSnippets(); }
    };
    if (addSnippetBtn) addSnippetBtn.addEventListener('click', addSnippet);
    if (addSnippetInput) addSnippetInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addSnippet(); });
    renderSnippets();

    // --- AI Logic ---
    const historyEl = container.querySelector('#term-inspector-history');
    const inputEl = container.querySelector('#term-inspector-input');
    const sendBtn = container.querySelector('#term-inspector-send');
    const analyzeBtn = container.querySelector('#btn-inspector-analyze');
    const streamingContainer = container.querySelector('#streaming-message-container-term');

    // Apply Logic for Terminal
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('.apply-btn');
        if (btn) {
            e.stopPropagation();
            const codeBlock = btn.closest('.chat-code-block');
            if (codeBlock) {
                const cmd = codeBlock.querySelector('code').textContent.trim();
                const tabId = getActiveTerminalId();
                
                if (tabId) {
                    // Visual Feedback
                    const originalHTML = btn.innerHTML;
                    btn.innerHTML = '<i data-lucide="check"></i> Sent';
                    btn.style.color = '#10B981';
                    if(window.lucide) window.lucide.createIcons();
                    setTimeout(() => { btn.innerHTML = originalHTML; btn.style.color = ''; if(window.lucide) window.lucide.createIcons(); }, 1500);

                    // Send Command
                    window.ipcRenderer.send('terminal-write', tabId, cmd + '\r');
                } else {
                    alert("No active terminal found to send command.");
                }
            }
        }
    });

    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 100) + 'px';
        sendBtn.disabled = inputEl.value.trim().length === 0;
    });

    const appendMsg = (text, role) => {
        const div = document.createElement('div');
        const isUser = role === 'user';
        div.className = `term-chat-msg ${isUser ? 'user' : 'ai'} markdown-content`;
        div.style.cssText = `padding: ${isUser ? '8px 12px' : '0'}; border-radius: ${isUser ? '10px' : '0'}; font-size: 13px; line-height: 1.5; max-width: ${isUser ? '85%' : '100%'}; width: ${isUser ? 'fit-content' : '100%'}; overflow-wrap: anywhere; white-space: normal; ${isUser ? 'background: var(--peak-accent); color: white; align-self: flex-end; margin-bottom: 12px;' : 'background: transparent; color: var(--peak-primary); align-self: flex-start; margin-bottom: 12px;'}`;
        div.innerHTML = isUser ? text.replace(/\n/g, '<br>') : renderMarkdown(text);
        historyEl.insertBefore(div, streamingContainer);
        historyEl.scrollTop = historyEl.scrollHeight;
        if(window.lucide) window.lucide.createIcons();
    };

    termLocalListener = (event, id, data) => {
        if (id !== TERM_OPS_SESSION_ID || !termStreamingMessageRef) return;
        if (data.type === 'data') {
            termStreamingMessageRef.content += data.content;
            let bubble = streamingContainer.querySelector('.term-chat-msg');
            if (!bubble) {
                bubble = document.createElement('div');
                bubble.className = 'term-chat-msg ai markdown-content';
                bubble.style.cssText = 'padding: 0; font-size: 13px; line-height: 1.6; width: 100%; overflow-wrap: anywhere; background: transparent; color: var(--peak-primary); align-self: flex-start; margin-bottom: 12px;';
                streamingContainer.appendChild(bubble);
            }
            bubble.innerHTML = renderMarkdown(termStreamingMessageRef.content);
            historyEl.scrollTop = historyEl.scrollHeight;
        } else if (data.type === 'end' || data.type === 'error') {
            const content = termStreamingMessageRef.content;
            if (content) { streamingContainer.innerHTML = ''; appendMsg(content, 'ai'); }
            if (data.type === 'error') appendMsg(`Error: ${data.message}`, 'ai');
            termStreamingMessageRef = null;
            inputEl.disabled = false;
            inputEl.focus();
            if(window.lucide) window.lucide.createIcons();
        }
    };
    window.ipcRenderer.on('llm-stream-data', termLocalListener);

    const startAIQuery = (promptText) => {
        if (termStreamingMessageRef) return;
        inputEl.value = ''; inputEl.style.height = 'auto'; inputEl.disabled = true; sendBtn.disabled = true;
        termStreamingMessageRef = { role: 'assistant', content: '' };
        streamingContainer.innerHTML = `<div class="term-chat-msg ai" style="padding:0; font-size:13px; color:var(--peak-secondary);"><i data-lucide="loader-2" class="spin"></i> Thinking...</div>`;
        if(window.lucide) window.lucide.createIcons();
        
        const systemPrompt = "You are a terminal expert. Output commands in Markdown blocks (```bash ... ```) so the user can click 'Apply' to run them.";
        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptText }];
        const model = 'google/gemini-2.0-flash-001'; 
        window.ipcRenderer.send('llm-stream-request', TERM_OPS_SESSION_ID, model, messages);
    };

    const handleSend = () => { const text = inputEl.value.trim(); if (!text) return; appendMsg(text, 'user'); startAIQuery(text); };
    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } });

    analyzeBtn.addEventListener('click', () => {
        const tabId = getActiveTerminalId();
        const termInstance = window.terminalInstances ? window.terminalInstances[tabId] : null;
        if (termInstance) {
            const buffer = termInstance.buffer.active;
            let screenContent = "";
            const start = Math.max(0, buffer.baseY + buffer.cursorY - 30);
            const end = buffer.baseY + buffer.cursorY;
            for (let i = start; i <= end; i++) {
                const line = buffer.getLine(i);
                if (line) screenContent += line.translateToString(true) + "\n";
            }
            appendMsg("Reading terminal...", 'user');
            startAIQuery(`Analyze this terminal output and suggest the next command:\n\`\`\`\n${screenContent}\n\`\`\``);
        } else {
            appendMsg("Error: No active terminal.", 'ai');
        }
    });

    if(window.lucide) window.lucide.createIcons();
    return () => { window.ipcRenderer.removeListener('llm-stream-data', termLocalListener); };
}

module.exports = { getTerminalOpsHTML, attachTerminalOpsListeners };