// src/components/TerminalView/index.js
const { getCurrentTheme } = require('./theme.js');
const { clipboard } = require('electron');

// ... [Imports remain the same] ...
let Terminal, FitAddon, ClipboardAddon, SearchAddon, WebLinksAddon;
try {
    Terminal = require('@xterm/xterm').Terminal;
    FitAddon = require('@xterm/addon-fit').FitAddon;
    ClipboardAddon = require('@xterm/addon-clipboard').ClipboardAddon;
    SearchAddon = require('@xterm/addon-search').SearchAddon;
    WebLinksAddon = require('@xterm/addon-web-links').WebLinksAddon;
} catch (e) { console.error(e); }

window.terminalInstances = window.terminalInstances || {};

function renderTerminalHTML(tab, container) {
    container.innerHTML = `
        <div class="terminal-wrapper" style="width:100%; height:100%; position:relative; background-color:var(--text-background-color); overflow:hidden;">
            <div id="terminal-container-${tab.id}" class="terminal-container" style="width:100%; height:100%;"></div>
            <button id="term-inspector-trigger-${tab.id}" class="term-floating-btn" title="Open Terminal Ops">
                <i data-lucide="bot"></i>
            </button>
        </div>`;
}

function attachTerminalListeners(tab, containerWrapper) {
    const tabId = tab.id;
    // Use querySelector on the wrapper to ensure we find the element we just created
    const container = containerWrapper.querySelector(`#terminal-container-${tabId}`);

    if (!container) {
        console.error(`[Terminal] Container not found for ID: terminal-container-${tabId}`);
        return () => { };
    }

    console.log(`[Terminal] Initializing terminal for ID: ${tabId}`);
    window.ipcRenderer.send('log:info', `[Terminal] Initializing terminal for ID: ${tabId}`);

    window.ipcRenderer.send('did-finish-content-swap');

    // 1. Initialize with current theme
    const term = new Terminal({
        cursorBlink: true,
        fontFamily: "Menlo, Monaco, 'Courier New', monospace",
        fontSize: 13,
        allowTransparency: true,
        theme: getCurrentTheme(),
        convertEol: true,
        macOptionIsMeta: true,
        rightClickSelectsWord: true
    });

    // DEBUG: Log platform
    // if (window.ipcRenderer) {
    //     window.ipcRenderer.invoke('log-to-debug-file', `[Terminal] Platform: ${process.platform}`);
    // }

    window.terminalInstances[tabId] = term;

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    if (ClipboardAddon) term.loadAddon(new ClipboardAddon());
    if (SearchAddon) term.loadAddon(new SearchAddon());
    if (WebLinksAddon) term.loadAddon(new WebLinksAddon());

    try {
        term.open(container);
        console.log(`[Terminal] term.open successful for ID: ${tabId}`);
    } catch (e) {
        console.error(`[Terminal] term.open failed for ID: ${tabId}`, e);
    }

    // Defer fit and resize to ensure DOM is fully laid out
    setTimeout(() => {
        try {
            console.log(`[Terminal] Executing deferred fit for ID: ${tabId}`);
            fitAddon.fit();
            // Send resize after fit
            window.ipcRenderer.send('terminal-resize', tabId, { cols: term.cols, rows: term.rows });
        } catch (e) {
            console.warn('[Terminal] Initial fit failed:', e);
        }
    }, 300); // Increased to 300ms

    // --- NEW: Dynamic Theme Listener ---
    const onThemeChange = () => {
        try {
            // getCurrentTheme() reads CSS vars, which auto-update via media query
            term.options.theme = getCurrentTheme();
        } catch (e) {
            console.warn('[Terminal] Theme update failed:', e);
        }
    };

    try {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addEventListener('change', onThemeChange);
    } catch (e) {
        console.warn('[Terminal] MediaQuery listener failed:', e);
    }
    // -----------------------------------

    // Key Handlers (Copy/Paste/SelectAll)
    term.attachCustomKeyEventHandler((arg) => {
        try {
            if (arg.type !== 'keydown') return true;

            // Safety check for process
            const isMac = (typeof process !== 'undefined' && process.platform === 'darwin');
            const key = arg.key.toLowerCase();

            const isCopy = isMac ? (arg.metaKey && key === 'c') : (arg.ctrlKey && arg.shiftKey && key === 'c');
            const isPaste = isMac ? (arg.metaKey && key === 'v') : (arg.ctrlKey && arg.shiftKey && key === 'v');
            const isSelectAll = isMac ? (arg.metaKey && key === 'a') : (arg.ctrlKey && key === 'a');

            // console.log('[Terminal] Key:', key, 'Meta:', arg.metaKey, 'Ctrl:', arg.ctrlKey);

            if (isCopy) {
                const selection = term.getSelection();
                if (selection) {
                    clipboard.writeText(selection);
                    arg.preventDefault();
                    return false;
                }
                return true;
            }
            if (isPaste) {
                arg.preventDefault();
                const text = clipboard.readText();
                term.paste(text);
                return false;
            }
            if (isSelectAll) {
                arg.preventDefault();
                term.selectAll();
                return false;
            }

            // NEW: Handle Option+Left/Right for word jumps (macOS style)
            if (isMac) {
                if (arg.altKey) {
                    if (key === 'arrowleft') {
                        arg.preventDefault();
                        term.write('\x1bb'); // Send Esc+b (backward word)
                        return false;
                    }
                    if (key === 'arrowright') {
                        arg.preventDefault();
                        term.write('\x1bf'); // Send Esc+f (forward word)
                        return false;
                    }
                    if (key === 'backspace') {
                        arg.preventDefault();
                        term.write('\x17'); // Send Ctrl+W (delete word backward) - standard unix
                        return false;
                    }
                }
                // NEW: Handle Cmd+Left/Right for line jumps
                if (arg.metaKey) {
                    if (key === 'arrowleft') {
                        arg.preventDefault();
                        term.write('\x01'); // Send Ctrl+A (start of line)
                        return false;
                    }
                    if (key === 'arrowright') {
                        arg.preventDefault();
                        term.write('\x05'); // Send Ctrl+E (end of line)
                        return false;
                    }
                }
            }
        } catch (e) {
            console.error('[Terminal] Key handler error:', e);
            return true; // Fallback to default behavior
        }

        return true;
    });

    // Context Menu
    container.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const hasSelection = term.hasSelection();
        window.ipcRenderer.send('show-terminal-context-menu', { id: tabId, hasSelection });
    });

    const onContextAction = (event, { action, id }) => {
        if (id !== tabId) return;
        switch (action) {
            case 'copy': clipboard.writeText(term.getSelection()); term.clearSelection(); break;
            case 'paste': term.paste(clipboard.readText()); break;
            case 'select-all': term.selectAll(); break;
            case 'clear': term.clear(); break;
            case 'kill': if (window.closeTab) window.closeTab(tabId); break;
        }
    };
    window.ipcRenderer.on('terminal-context-action', onContextAction);

    const triggerBtn = containerWrapper.querySelector(`#term-inspector-trigger-${tabId}`);
    if (triggerBtn) {
        triggerBtn.addEventListener('click', () => { window.openInspector('terminal-ops'); });
    }

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

    console.log(`[Terminal] Requesting terminal creation for ID: ${tabId}, CWD: ${tab.content.data.cwd}`);
    try {
        const cwd = (tab.content && tab.content.data && tab.content.data.cwd) || '';
        window.ipcRenderer.send('log:info', `[Terminal] Requesting terminal creation for ID: ${tabId}, CWD: ${cwd}`);
        window.ipcRenderer.send('terminal-create', tabId, cwd);
    } catch (err) {
        window.ipcRenderer.send('log:info', `[Terminal] Failed to request terminal creation: ${err.message}`);
        console.error(err);
    }
    // window.ipcRenderer.send('terminal-resize', tabId, { cols: term.cols, rows: term.rows }); // Moved to setTimeout

    const onData = term.onData(d => window.ipcRenderer.send('terminal-write', tabId, d));

    // Error Parsing Logic
    const errorRegex = /([a-zA-Z0-9_\-\.\/]+\.(ts|tsx|js|jsx|css|html)):(\d+):(\d+)/;
    // Also catch "ERROR in ./path/to/file"
    const webpackErrorRegex = /ERROR in (\.\/[a-zA-Z0-9_\-\.\/]+)/;

    const onPtyData = (e, id, d) => {
        if (id === tabId) {
            // console.log(`[Terminal] Received data for ${id}:`, d.substring(0, 50)); // Verbose
            term.write(d);

            // Simple chunk-based parsing (can be improved with buffering)
            // Check for file paths with line numbers
            const match = d.match(errorRegex);
            if (match) {
                const filePath = match[1];
                // Dispatch event for sidebar to pick up
                window.dispatchEvent(new CustomEvent('peak-console-error', {
                    detail: { filePath, line: match[3], col: match[4] }
                }));
            }

            const webpackMatch = d.match(webpackErrorRegex);
            if (webpackMatch) {
                const filePath = webpackMatch[1];
                window.dispatchEvent(new CustomEvent('peak-console-error', {
                    detail: { filePath }
                }));
            }
        }
    };
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

    // Window Resize Handler
    const onResize = () => {
        try { fitAddon.fit(); } catch (e) { console.warn('Fit error:', e); }
    };
    window.addEventListener('resize', onResize);

    // NEW: ResizeObserver for container resizing (e.g. when toggling sidebar)
    const resizeObserver = new ResizeObserver(() => {
        try {
            fitAddon.fit();
            // console.log(`[Terminal] ResizeObserver triggered for ${tabId}. New dims: ${term.cols}x${term.rows}`);
            window.ipcRenderer.send('terminal-resize', tabId, { cols: term.cols, rows: term.rows });
        } catch (e) { }
    });
    resizeObserver.observe(container);

    return {
        cleanup: () => {
            resizeObserver.disconnect();
            window.removeEventListener('resize', onResize);
            mediaQuery.removeEventListener('change', onThemeChange);
            window.removeEventListener('terminal-tab-shown', onShow);
            window.ipcRenderer.removeListener('terminal-context-action', onContextAction);
            window.ipcRenderer.send('terminal-kill', tabId);
            window.ipcRenderer.removeListener('terminal-data', onPtyData);
            onData.dispose();
            term.dispose();
            delete window.terminalInstances[tabId];
        },
        fit: () => {
            try { fitAddon.fit(); } catch (e) { console.warn('Fit error:', e); }
        }
    };
}

module.exports = { renderTerminalHTML, attachTerminalListeners };