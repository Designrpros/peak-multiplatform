// src/components/TerminalView/index.js
const { getCurrentTheme } = require('./theme.js');

let Terminal, FitAddon, ClipboardAddon, SearchAddon, WebLinksAddon;
try {
    Terminal = require('@xterm/xterm').Terminal;
    FitAddon = require('@xterm/addon-fit').FitAddon;
    ClipboardAddon = require('@xterm/addon-clipboard').ClipboardAddon;
    SearchAddon = require('@xterm/addon-search').SearchAddon;
    WebLinksAddon = require('@xterm/addon-web-links').WebLinksAddon;
} catch(e) { console.error(e); }

// Global registry for Inspector access
window.terminalInstances = window.terminalInstances || {};

function renderTerminalHTML(tab, container) {
    // Simplified Wrapper
    container.innerHTML = `
        <div class="terminal-wrapper" style="width:100%; height:100%; position:relative; background-color:var(--text-background-color);">
            <div id="terminal-container-${tab.id}" class="terminal-container"></div>
            
            <button id="term-inspector-trigger-${tab.id}" class="term-floating-btn" title="Open Terminal Ops">
                <i data-lucide="bot"></i>
            </button>
        </div>`;
}

function attachTerminalListeners(tab, containerWrapper) {
    const tabId = tab.id;
    const container = document.getElementById(`terminal-container-${tabId}`);
    if (!container) return () => {};

    window.ipcRenderer.send('did-finish-content-swap');

    const term = new Terminal({
        cursorBlink: true,
        fontFamily: 'Menlo, monospace',
        fontSize: 13,
        allowTransparency: true,
        theme: getCurrentTheme(),
        convertEol: true,
        macOptionIsMeta: true
    });

    // Register instance for Inspector
    window.terminalInstances[tabId] = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    if (ClipboardAddon) term.loadAddon(new ClipboardAddon());
    if (SearchAddon) term.loadAddon(new SearchAddon());
    if (WebLinksAddon) term.loadAddon(new WebLinksAddon());

    term.open(container);
    fitAddon.fit();

    // --- Inspector Trigger ---
    const triggerBtn = containerWrapper.querySelector(`#term-inspector-trigger-${tabId}`);
    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => {
            window.openInspector('terminal-ops');
        });
    }

    // --- Standard Terminal Setup ---
    const onShow = (e) => {
        if (e.detail.id === tabId) {
            requestAnimationFrame(() => {
                fitAddon.fit();
                term.focus();
                window.ipcRenderer.send('terminal-resize', tabId, { cols: term.cols, rows: term.rows });
            });
        }
    };
    window.addEventListener('terminal-tab-shown', onShow);

    window.ipcRenderer.send('terminal-create', tabId, tab.content.data.cwd);
    window.ipcRenderer.send('terminal-resize', tabId, { cols: term.cols, rows: term.rows });

    const onData = term.onData(d => window.ipcRenderer.send('terminal-write', tabId, d));
    const onPtyData = (e, id, d) => { if (id === tabId) term.write(d); };
    window.ipcRenderer.on('terminal-data', onPtyData);

    const initialCmd = tab.content.data.initialCommand;
    if (initialCmd) {
        window.ipcRenderer.send('terminal-write', tabId, initialCmd + '\r');
        delete tab.content.data.initialCommand;
    }

    term.onTitleChange(t => {
         tab.content.data.cwd = t.includes(':') ? t.split(':').pop().trim() : t;
    });

    if (window.lucide) window.lucide.createIcons();

    return () => {
        window.removeEventListener('terminal-tab-shown', onShow);
        window.ipcRenderer.send('terminal-kill', tabId);
        window.ipcRenderer.removeListener('terminal-data', onPtyData);
        onData.dispose();
        term.dispose();
        delete window.terminalInstances[tabId]; // Clean up registry
    };
}

module.exports = { renderTerminalHTML, attachTerminalListeners };