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

function getTerminalOpsHTML() {
    return `
        <div class="inspector-tabs-header">
            <button class="tab-btn active" data-target="guides">Guides</button>
            <button class="tab-btn" data-target="snippets">Snippets</button>
            <button class="tab-btn" data-target="ai">AI</button>
        </div>

        <div id="term-ops-content" class="inspector-content-inner">
            <div id="panel-guides" class="term-panel active">
                <div class="inspector-section"><h4 class="inspector-sub-title">Navigation</h4></div>
                <div class="guide-list">
                    <div class="cmd-row"><code>cd ..</code> <span>Go back</span></div>
                    <div class="cmd-row"><code>ls -la</code> <span>List all</span></div>
                    <div class="cmd-row"><code>pwd</code> <span>Current path</span></div>
                    <div class="cmd-row"><code>open .</code> <span>Open here</span></div>
                </div>
                <div class="inspector-section"><h4 class="inspector-sub-title">Files</h4></div>
                <div class="guide-list">
                    <div class="cmd-row"><code>touch [f]</code> <span>New file</span></div>
                    <div class="cmd-row"><code>mkdir [d]</code> <span>New folder</span></div>
                    <div class="cmd-row"><code>rm -rf</code> <span>Delete</span></div>
                </div>
                 <div class="inspector-section"><h4 class="inspector-sub-title">System</h4></div>
                <div class="guide-list">
                    <div class="cmd-row"><code>top</code> <span>Monitor</span></div>
                    <div class="cmd-row"><code>df -h</code> <span>Disk</span></div>
                    <div class="cmd-row"><code>kill -9</code> <span>Kill</span></div>
                </div>
            </div>

            <div id="panel-snippets" class="term-panel" style="display:none;">
                <div class="inspector-section"><h4 class="inspector-sub-title">NPM</h4></div>
                <div class="snippet-grid">
                    <div class="snippet-btn" data-cmd="npm install">npm install</div>
                    <div class="snippet-btn" data-cmd="npm start">npm start</div>
                    <div class="snippet-btn" data-cmd="npm test">npm test</div>
                    <div class="snippet-btn" data-cmd="npm run build">npm run build</div>
                </div>
                <div class="inspector-section"><h4 class="inspector-sub-title">Git</h4></div>
                <div class="snippet-grid">
                    <div class="snippet-btn" data-cmd="git status">status</div>
                    <div class="snippet-btn" data-cmd="git pull">pull</div>
                    <div class="snippet-btn" data-cmd="git push">push</div>
                    <div class="snippet-btn" data-cmd="git checkout -b">checkout -b</div>
                    <div class="snippet-btn" data-cmd="git add .">add all</div>
                    <div class="snippet-btn" data-cmd="git commit -m">commit</div>
                    <div class="snippet-btn" data-cmd="git log --oneline">log</div>
                </div>
            </div>

            <div id="panel-ai" class="term-panel" style="display:none; flex-direction:column; height:100%; position: relative;">
                <div class="term-chat-history" id="term-inspector-history" style="padding-bottom: 140px;">
                    <div class="term-chat-msg ai markdown-content">
                        Ready to assist with terminal commands.
                    </div>
                    <div id="streaming-message-container-term"></div>
                </div>
                
                <div class="chat-input-container" style="bottom: 16px;">
                    <div class="chat-input-box" style="width: 90%; max-width: none; margin: 0;">
                        <textarea class="chat-textarea" id="term-inspector-input" placeholder="Ask AI about terminal..." rows="1"></textarea>
                        <div class="chat-controls" style="padding: 4px 8px 8px 8px;">
                            <div class="left-controls">
                                 <button class="chat-icon-btn" id="btn-inspector-analyze" title="Read Terminal Screen">
                                    <i data-lucide="scan-search"></i>
                                 </button>
                            </div>
                            <div class="right-controls">
                                 <button id="term-inspector-send" class="chat-submit-btn" disabled><i data-lucide="arrow-up"></i></button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function attachTerminalOpsListeners(container) {
    // ... (Tab Logic & Snippets Logic same as before) ...
    const tabs = container.querySelectorAll('.tab-btn');
    const panels = container.querySelectorAll('.term-panel');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            panels.forEach(p => {
                p.style.display = 'none';
                p.classList.remove('active');
            });
            const target = container.querySelector(`#panel-${tab.dataset.target}`);
            if (target) {
                target.style.display = tab.dataset.target === 'ai' ? 'flex' : 'block';
                target.classList.add('active');
            }
        });
    });

    const getActiveTerminalId = () => {
        if (!window.tabManager || !window.tabManager.getActiveTab) return null;
        const tab = window.tabManager.getActiveTab();
        if (tab.content.type === 'terminal') return tab.id;
        if (tab.content.type === 'project') return window.projectTerminalMap ? window.projectTerminalMap[tab.id] : null;
        return null;
    };

    const snippetBtns = container.querySelectorAll('.snippet-btn');
    snippetBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = getActiveTerminalId();
            if (tabId && btn.dataset.cmd) window.ipcRenderer.send('terminal-write', tabId, btn.dataset.cmd + '\r');
            else alert("No active terminal found.");
        });
    });

    // AI Logic (Updated selectors for new HTML)
    const historyEl = container.querySelector('#term-inspector-history');
    const inputEl = container.querySelector('#term-inspector-input');
    const sendBtn = container.querySelector('#term-inspector-send');
    const analyzeBtn = container.querySelector('#btn-inspector-analyze');
    const streamingContainer = container.querySelector('#streaming-message-container-term');

    // Auto-resize logic for glass input
    inputEl.addEventListener('input', () => {
        inputEl.style.height = 'auto';
        inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
        sendBtn.disabled = inputEl.value.trim().length === 0;
    });

    const appendMsg = (text, role) => {
        const div = document.createElement('div');
        // Reuse styling from ChatView/Inspector CSS
        const roleClass = role === 'user' ? 'user' : 'ai'; 
        // Note: In Inspector CSS, we might need to map 'user' class to right-align
        div.className = `term-chat-msg ${roleClass} markdown-content`;
        
        div.innerHTML = role === 'ai' ? renderMarkdown(text) : text.replace(/\n/g, '<br>');
        historyEl.insertBefore(div, streamingContainer);
        historyEl.scrollTop = historyEl.scrollHeight;
        if(window.lucide) window.lucide.createIcons();
    };

    termLocalListener = (event, id, data) => {
        if (id !== TERM_OPS_SESSION_ID || !termStreamingMessageRef) return;
        if (data.type === 'data') {
            termStreamingMessageRef.content += data.content;
            const html = renderMarkdown(termStreamingMessageRef.content);
            const bubble = streamingContainer.querySelector('.message-content');
            if (bubble) bubble.innerHTML = html;
            historyEl.scrollTop = historyEl.scrollHeight;
            if(window.lucide) window.lucide.createIcons();
        } else if (data.type === 'end' || data.type === 'error') {
            const content = termStreamingMessageRef.content;
            streamingContainer.innerHTML = ''; 
            if (content) appendMsg(content, 'ai');
            if (data.type === 'error') appendMsg(`Error: ${data.message}`, 'ai');
            termStreamingMessageRef = null;
            inputEl.disabled = false;
            inputEl.focus();
        }
    };
    window.ipcRenderer.on('llm-stream-data', termLocalListener);

    const startAIQuery = (promptText) => {
        if (termStreamingMessageRef) return;
        inputEl.value = '';
        inputEl.style.height = 'auto';
        inputEl.disabled = true;
        sendBtn.disabled = true;
        
        termStreamingMessageRef = { role: 'assistant', content: '' };
        
        streamingContainer.innerHTML = `
            <div class="term-chat-msg ai">
                <div class="message-content markdown-content"><i data-lucide="sparkles" style="width:14px;"></i> Thinking...</div>
            </div>
        `;
        if(window.lucide) window.lucide.createIcons();
        historyEl.scrollTop = historyEl.scrollHeight;

        const systemPrompt = "You are a command-line expert. Be concise.";
        const messages = [{ role: 'system', content: systemPrompt }, { role: 'user', content: promptText }];
        const model = 'google/gemini-2.0-flash-001'; 
        window.ipcRenderer.send('llm-stream-request', TERM_OPS_SESSION_ID, model, messages);
    };

    const handleSend = () => {
        const text = inputEl.value.trim();
        if (!text) return;
        appendMsg(text, 'user');
        startAIQuery(text);
    };

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
            appendMsg("Analyzing screen...", 'user');
            startAIQuery(`Analyze this terminal output:\n\`\`\`\n${screenContent}\n\`\`\``);
        } else {
            appendMsg("Error: Active terminal not found.", 'ai');
        }
    });

    if(window.lucide) window.lucide.createIcons();

    return () => { window.ipcRenderer.removeListener('llm-stream-data', termLocalListener); };
}

module.exports = { getTerminalOpsHTML, attachTerminalOpsListeners };