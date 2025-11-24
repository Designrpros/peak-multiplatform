// src/components/ProjectView/editor.js

// Helper to safely get module exports
function getModule(name) {
    try {
        const m = require(name);
        return m && m.default ? m.default : m;
    } catch (e) {
        console.warn(`[Editor] Failed to load module: ${name}`, e);
        return {};
    }
}

// --- IMPORT MODULES SAFELY ---
const State = getModule('@codemirror/state');
const View = getModule('@codemirror/view');
const Commands = getModule('@codemirror/commands');
const Language = getModule('@codemirror/language');
const Autocomplete = getModule('@codemirror/autocomplete');
const Search = getModule('@codemirror/search');
const Lint = getModule('@codemirror/lint');

// Language Packages
const LangJs = getModule('@codemirror/lang-javascript');
const LangJson = getModule('@codemirror/lang-json');
const LangHtml = getModule('@codemirror/lang-html');
const LangCss = getModule('@codemirror/lang-css');
const LangMd = getModule('@codemirror/lang-markdown');
const LangPy = getModule('@codemirror/lang-python');
const LangXml = getModule('@codemirror/lang-xml');
const LangJava = getModule('@codemirror/lang-java');

let editorView = null;
let saveTimeout = null;
let debounceDiagnostics = null;

// --- THEME ---
function loadVSCodeTheme(isDarkMode) {
    try {
        const themePkg = getModule('@uiw/codemirror-theme-vscode');
        if (isDarkMode && themePkg.vscodeDark) return themePkg.vscodeDark;
        if (!isDarkMode && themePkg.vscodeLight) return themePkg.vscodeLight;
    } catch (e) {}
    return View.EditorView ? View.EditorView.baseTheme({}) : [];
}

function getLanguageExtension(filePath) {
    if (!filePath) return [];
    const ext = filePath.split('.').pop().toLowerCase();
    try {
        switch (ext) {
            case 'js': case 'jsx': case 'mjs': case 'ts': case 'tsx':
                return LangJs.javascript ? LangJs.javascript({ jsx: true, typescript: true }) : [];
            case 'json': case 'jsonc': 
                return LangJson.json ? LangJson.json() : [];
            case 'html': case 'htm': 
                return LangHtml.html ? LangHtml.html() : [];
            case 'css': case 'less': case 'sass': 
                return LangCss.css ? LangCss.css() : [];
            case 'md': case 'markdown': 
                return LangMd.markdown ? LangMd.markdown() : [];
            case 'py': case 'python': 
                return LangPy.python ? LangPy.python() : [];
            case 'xml': case 'svg': 
                return LangXml.xml ? LangXml.xml() : [];
            case 'java': 
                return LangJava.java ? LangJava.java() : [];
            default: 
                return []; 
        }
    } catch (e) {
        return [];
    }
}

function getBaseExtensions() {
    const exts = [];
    if (View.lineNumbers) exts.push(View.lineNumbers());
    if (View.highlightActiveLineGutter) exts.push(View.highlightActiveLineGutter());
    if (View.highlightSpecialChars) exts.push(View.highlightSpecialChars());
    if (Commands.history) exts.push(Commands.history());
    if (Language.foldGutter) exts.push(Language.foldGutter());
    if (View.drawSelection) exts.push(View.drawSelection());
    if (View.dropCursor) exts.push(View.dropCursor());
    if (Language.indentOnInput) exts.push(Language.indentOnInput());
    
    if (Language.syntaxHighlighting && Language.defaultHighlightStyle) {
        exts.push(Language.syntaxHighlighting(Language.defaultHighlightStyle, {fallback: true}));
    }
        
    if (Language.bracketMatching) exts.push(Language.bracketMatching());
    if (Autocomplete.closeBrackets) exts.push(Autocomplete.closeBrackets());
    if (Autocomplete.autocompletion) exts.push(Autocomplete.autocompletion());
    if (View.rectangularSelection) exts.push(View.rectangularSelection());
    if (View.crosshairCursor) exts.push(View.crosshairCursor());
    if (View.highlightActiveLine) exts.push(View.highlightActiveLine());
    if (Search.highlightSelectionMatches) exts.push(Search.highlightSelectionMatches());
    
    const keys = [
        ...(Commands.defaultKeymap || []),
        ...(Search.searchKeymap || []),
        ...(Commands.historyKeymap || []),
        ...(Lint.lintKeymap || [])
    ];
    
    if (View.keymap) exts.push(View.keymap.of(keys));

    return exts;
}

function setupCodeMirror(container, content, filePath) {
    if (!State.EditorState || !View.EditorView) {
        container.innerHTML = `<div class="project-editor-placeholder error">CRITICAL ERROR: CodeMirror core components failed to load.</div>`;
        return null;
    }

    if (editorView) {
        try { editorView.destroy(); } catch(e) {}
        editorView = null;
    }

    const saveContent = (val) => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await window.ipcRenderer.invoke('project:write-file', filePath, val);
        }, 500);
    };

    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // --- DIAGNOSTICS LISTENER (UPDATED) ---
    const diagnosticsListener = View.EditorView.updateListener.of((update) => {
        if (debounceDiagnostics) clearTimeout(debounceDiagnostics);
        
        debounceDiagnostics = setTimeout(() => {
            if (!editorView) return;
            try {
                const diagnostics = [];
                if (Lint.forEachDiagnostic) {
                    const doc = editorView.state.doc;
                    Lint.forEachDiagnostic(editorView.state, (d) => {
                        // NEW: Calculate Line and Column
                        const lineInfo = doc.lineAt(d.from);
                        const line = lineInfo.number;
                        const col = d.from - lineInfo.from;

                        diagnostics.push({
                            from: d.from,
                            to: d.to,
                            line: line,
                            col: col,
                            severity: d.severity,
                            message: d.message,
                            source: d.source // Capture source if available (e.g., 'jshint')
                        });
                    });
                }
                
                window.dispatchEvent(new CustomEvent('peak-editor-diagnostics', { 
                    detail: { diagnostics, filePath } 
                }));
            } catch(e) { console.error("Diagnostics error:", e); }
        }, 600);

        if (update.docChanged) {
            saveContent(update.state.doc.toString());
        }
    });

    const extensions = [
        ...getBaseExtensions(),
        getLanguageExtension(filePath),
        loadVSCodeTheme(isDarkMode),
        Search.search ? Search.search() : [],
        diagnosticsListener
    ];

    if (Lint.lintGutter) extensions.push(Lint.lintGutter());
    if (Lint.lint) extensions.push(Lint.lint());

    if ((filePath.endsWith('.json') || filePath.endsWith('.jsonc')) && LangJson.jsonParseLinter && Lint.linter) {
        extensions.push(Lint.linter(LangJson.jsonParseLinter()));
    }

    const startState = State.EditorState.create({
        doc: content,
        extensions: extensions
    });

    editorView = new View.EditorView({
        state: startState,
        parent: container
    });

    container.jumpToLine = (pos) => {
        if (!editorView) return;
        const safePos = Math.min(Math.max(0, pos), editorView.state.doc.length);
        editorView.dispatch({
            selection: { anchor: safePos, head: safePos },
            scrollIntoView: true
        });
        editorView.focus();
    };

    return editorView;
}

function disposeEditor(view) {
    if (view) {
        if (saveTimeout) clearTimeout(saveTimeout);
        if (debounceDiagnostics) clearTimeout(debounceDiagnostics);
        view.destroy();
        editorView = null;
        window.dispatchEvent(new CustomEvent('peak-editor-diagnostics', { detail: { diagnostics: [], filePath: null } }));
    }
}

module.exports = { setupCodeMirror, disposeEditor };