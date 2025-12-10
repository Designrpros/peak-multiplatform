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
// FIX: Import syntaxTree safely from the package directly to avoid getModule stripping named exports
let syntaxTree;
try {
    const LangPkg = require('@codemirror/language');
    syntaxTree = LangPkg.syntaxTree || (LangPkg.default ? LangPkg.default.syntaxTree : null);
} catch (e) { console.error("Failed to load syntaxTree", e); }

const Language = getModule('@codemirror/language');
// const { syntaxTree } = Language; // Removed unsafe destructuring
const Autocomplete = getModule('@codemirror/autocomplete');
const Search = getModule('@codemirror/search');
const Lint = getModule('@codemirror/lint');

// NEW: Inline Chat
const { inlineChatField, inlineChatKeymap } = require('./InlineChat.js');

// NEW: LSP Integration
const LSPIntegration = require('./lsp-integration.js');
if (window.ipcRenderer) {
    window.ipcRenderer.invoke('log-to-debug-file', `[Editor] Loaded LSPIntegration. Keys: ${Object.keys(LSPIntegration).join(', ')}`);
}

// Language Packages
const LangJs = getModule('@codemirror/lang-javascript');
const LangJson = getModule('@codemirror/lang-json');
const LangHtml = getModule('@codemirror/lang-html');
const LangCss = getModule('@codemirror/lang-css');
const LangMd = getModule('@codemirror/lang-markdown');
const LangPy = getModule('@codemirror/lang-python');
const LangXml = getModule('@codemirror/lang-xml');
const LangJava = getModule('@codemirror/lang-java');
const LangCpp = getModule('@codemirror/lang-cpp');
const LangRust = getModule('@codemirror/lang-rust');
const LangGo = getModule('@codemirror/lang-go');
const LangPhp = getModule('@codemirror/lang-php');
const LangSql = getModule('@codemirror/lang-sql');
const LangYaml = getModule('@codemirror/lang-yaml');

let editorView = null;
let saveTimeout = null;
let debounceDiagnostics = null;
// NEW: Store the theme compartment so we can update it later
let themeCompartment = null;

// --- THEME ---
function loadVSCodeTheme(isDarkMode) {
    try {
        const themePkg = getModule('@uiw/codemirror-theme-vscode');
        if (isDarkMode && themePkg.vscodeDark) return themePkg.vscodeDark;
        if (!isDarkMode && themePkg.vscodeLight) return themePkg.vscodeLight;
    } catch (e) { }
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
            case 'cpp': case 'c': case 'h': case 'hpp': case 'cc':
                return LangCpp.cpp ? LangCpp.cpp() : [];
            case 'rs': case 'rust':
                return LangRust.rust ? LangRust.rust() : [];
            case 'go':
                return LangGo.go ? LangGo.go() : [];
            case 'php':
                return LangPhp.php ? LangPhp.php() : [];
            case 'sql':
                return LangSql.sql ? LangSql.sql() : [];
            case 'yaml': case 'yml':
                return LangYaml.yaml ? LangYaml.yaml() : [];
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
        exts.push(Language.syntaxHighlighting(Language.defaultHighlightStyle, { fallback: true }));
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

// NEW: Listener function to handle theme changes
function onThemeChange(e) {
    if (editorView && themeCompartment) {
        editorView.dispatch({
            effects: themeCompartment.reconfigure(loadVSCodeTheme(e.matches))
        });
    }
}

// NEW: Generic Syntax Linter
const syntaxLinter = (view) => {
    const diagnostics = [];

    // DEBUG: Check if syntaxTree is available
    if (!syntaxTree) {
        // diagnostics.push({ from: 0, to: 0, severity: 'error', message: 'System: syntaxTree is undefined. Linter cannot run.', source: 'System' });
        return diagnostics;
    }

    try {
        const tree = syntaxTree(view.state);
        if (!tree) {
            return diagnostics;
        }

        tree.iterate({
            enter: (node) => {
                if (node.type.isError) {
                    let msg = "Syntax Error";
                    const parent = node.node.parent;
                    const doc = view.state.doc;

                    // Heuristics for better error messages
                    if (parent) {
                        const parentName = parent.type.name;
                        if (parentName === 'Block') msg = "Unexpected token or missing '}' in Block";
                        else if (parentName === 'ArgList') msg = "Missing ')' or invalid argument list";
                        else if (parentName === 'ParamList') msg = "Missing ')' or invalid parameter list";
                        else if (parentName === 'ArrayExpression') msg = "Missing ']' or invalid array element";
                        else if (parentName === 'ObjectExpression') msg = "Missing '}' or invalid object property";
                        else if (parentName === 'String') msg = "Unterminated string literal";
                        else if (parentName === 'TemplateString') msg = "Unterminated template string";
                        else if (parentName === 'BinaryExpression') msg = "Invalid binary expression";
                        else if (parentName === 'CallExpression') msg = "Invalid function call";
                        else if (parentName === 'IfStatement') msg = "Invalid If Statement syntax";
                        else if (parentName === 'ForStatement') msg = "Invalid For Statement syntax";
                        else if (parentName === 'FunctionDeclaration') msg = "Invalid Function Declaration";
                        else if (parentName === 'ClassBody') msg = "Invalid Class Body";
                        else msg = `Syntax Error in ${parentName}`;
                    }

                    // Check for specific tokens if node has length
                    if (node.to > node.from) {
                        const text = doc.sliceString(node.from, node.to);
                        if (text === ';') msg = "Unexpected ';'";
                        else if (text === ',') msg = "Unexpected ','";
                        else if (text === ')') msg = "Unexpected ')'";
                        else if (text === '}') msg = "Unexpected '}'";
                        else if (text === ']') msg = "Unexpected ']'";
                    }

                    diagnostics.push({
                        from: node.from,
                        to: node.to,
                        severity: 'error',
                        message: msg,
                        source: 'Syntax'
                    });
                }
            }
        });
    } catch (e) {
        console.error(e);
    }

    // DEBUG: Verify linter is running
    if (view.state.doc.toString().includes("debug")) {
        diagnostics.push({ from: 0, to: 0, severity: 'warning', message: 'Linter is active (Debug Mode)', source: 'Debug' });
    }

    return diagnostics;
};

// NEW: ESLint Linter (Async)
const esLinter = async (view) => {
    const diagnostics = [];
    const doc = view.state.doc;
    const content = doc.toString();

    // Only run for JS/TS
    // We can check the file extension from the view state if we stored it, or just rely on where we add this linter

    try {
        // We need the filePath. It's passed to setupCodeMirror but not directly stored in view.state
        // But we can get it from window.currentFilePath if it matches the content
        // Better: Pass it in the closure when creating the linter extension
    } catch (e) { console.error(e); }

    return diagnostics;
    // Wait, CodeMirror's linter function can be async and return a promise of diagnostics.
    // But we need the filePath.
};

// Factory to create the linter with filePath context
const createESLinter = (filePath) => {
    return async (view) => {
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('project:lint-file', `LOG: Running ESLint. LSPIntegration keys: ${Object.keys(LSPIntegration).join(', ')}`, '');
        }
        const diagnostics = [];
        try {
            const content = view.state.doc.toString();
            const rawErrors = await window.ipcRenderer.invoke('project:lint-file', filePath, content);

            if (rawErrors && Array.isArray(rawErrors)) {
                const doc = view.state.doc;
                rawErrors.forEach(err => {
                    // Convert line/col to pos
                    // ESLint is 1-based, CodeMirror lines are 1-based, but cols are 0-based?
                    // CodeMirror doc.line(n) throws if out of range
                    try {
                        const lineInfo = doc.line(err.line);
                        const from = Math.min(lineInfo.to, lineInfo.from + (err.col - 1));
                        const to = err.endLine ? Math.min(doc.line(err.endLine).to, doc.line(err.endLine).from + (err.endCol - 1)) : from;

                        diagnostics.push({
                            from: from,
                            to: Math.max(from, to), // Ensure to >= from
                            severity: err.severity,
                            message: err.message,
                            source: 'ESLint'
                        });
                    } catch (e) { /* ignore invalid ranges */ }
                });
            }
        } catch (e) { console.error("ESLint error:", e); }
        return diagnostics;
    };
};

function setupCodeMirror(container, content, filePath) {
    if (!State.EditorState || !View.EditorView) {
        container.innerHTML = `<div class="project-editor-placeholder error">CRITICAL ERROR: CodeMirror core components failed to load.</div>`;
        return null;
    }

    disposeEditor(editorView); // Cleanup existing

    const saveContent = (val) => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            await window.ipcRenderer.invoke('project:write-file', filePath, val);
        }, 500);
    };

    // Setup Theme Compartment
    themeCompartment = new State.Compartment();
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // --- DIAGNOSTICS LISTENER ---
    const diagnosticsListener = View.EditorView.updateListener.of((update) => {
        if (debounceDiagnostics) clearTimeout(debounceDiagnostics);

        debounceDiagnostics = setTimeout(() => {
            if (!editorView) return;
            try {
                const diagnostics = [];
                if (Lint.forEachDiagnostic) {
                    const doc = editorView.state.doc;
                    Lint.forEachDiagnostic(editorView.state, (d) => {
                        const lineInfo = doc.lineAt(d.from);
                        diagnostics.push({
                            from: d.from,
                            to: d.to,
                            line: lineInfo.number,
                            col: d.from - lineInfo.from,
                            severity: d.severity,
                            message: d.message,
                            source: d.source
                        });
                    });
                }
                window.dispatchEvent(new CustomEvent('peak-editor-diagnostics', {
                    detail: { diagnostics, filePath }
                }));
            } catch (e) { console.error("Diagnostics error:", e); }
        }, 600);

        if (update.docChanged) {
            const newText = update.state.doc.toString();
            saveContent(newText);

            // Notify LSP of document changes
            const languageId = LSPIntegration.getLanguageId(filePath);
            if (languageId !== 'plaintext') {
                LSPIntegration.notifyDocumentChange(filePath, newText);
            }
        }
    });

    const extensions = [
        ...getBaseExtensions(),
        getLanguageExtension(filePath),
        // Use the compartment for the theme
        themeCompartment.of(loadVSCodeTheme(isDarkMode)),
        Search.search ? Search.search() : [],
        diagnosticsListener,
        inlineChatField,
        inlineChatKeymap
    ];

    if (Lint.lintGutter) extensions.push(Lint.lintGutter());

    // FIX: Lint.lint is undefined in recent versions, use linter() directly
    // if (Lint.lint) extensions.push(Lint.lint()); 

    // Add generic syntax linter
    if (Lint.linter) {
        extensions.push(Lint.linter(syntaxLinter));

        // Add ESLint for JS/TS
        if (filePath.endsWith('.js') || filePath.endsWith('.jsx') || filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
            extensions.push(Lint.linter(createESLinter(filePath)));
        }
    }

    // Add LSP integration for supported languages
    let languageId = 'plaintext';
    try {
        languageId = LSPIntegration.getLanguageId(filePath);
        if (window.ipcRenderer) {
            window.ipcRenderer.invoke('log-to-debug-file', `[Editor] Setup LSP for ${filePath}, languageId: ${languageId}`);
            // Write a debug file to prove execution
            window.ipcRenderer.invoke('project:write-file', '/Users/vegarberentsen/Documents/peak-multiplatform/editor-debug.txt', `Setup LSP for ${filePath} at ${new Date().toISOString()}`);
        }
    } catch (e) {
        console.error('[Editor] Failed to get language ID:', e);
    }

    if (languageId !== 'plaintext') {
        // Get document text for LSP didOpen notification
        const documentText = content;

        // Notify LSP that document is open
        try {
            LSPIntegration.notifyDocumentOpen(filePath, languageId, documentText);
            if (window.ipcRenderer) window.ipcRenderer.send('log:info', `[Editor] Sent lsp:didOpen for ${filePath}`);
        } catch (err) {
            console.error('[Editor] Failed to notify LSP open:', err);
        }

        // Add LSP extensions
        extensions.push(LSPIntegration.createLSPAutocomplete(filePath, languageId));
        extensions.push(LSPIntegration.createLSPLinter(filePath, languageId));
        extensions.push(LSPIntegration.createLSPHover(filePath, languageId));

        // Add go-to-definition keymap (Cmd/Ctrl+B)
        const gotoDefinitionCallback = (targetPath, line, character) => {
            // Fire event to open file
            window.dispatchEvent(new CustomEvent('peak-goto-definition', {
                detail: { filePath: targetPath, line, character }
            }));
        };
        extensions.push(LSPIntegration.createLSPGotoDefinitionKeymap(filePath, gotoDefinitionCallback));
    }

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

    // NEW: Attach Theme Listener
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onThemeChange);

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
    // NEW: Remove Theme Listener
    try {
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', onThemeChange);
        }
    } catch (e) { console.warn("Failed to remove theme listener", e); }

    if (view) {
        if (saveTimeout) clearTimeout(saveTimeout);
        if (debounceDiagnostics) clearTimeout(debounceDiagnostics);

        // Notify LSP that document is closed
        if (window.currentFilePath) {
            const languageId = LSPIntegration.getLanguageId(window.currentFilePath);
            if (languageId !== 'plaintext') {
                LSPIntegration.notifyDocumentClose(window.currentFilePath);
            }
        }

        view.destroy();
    }
    editorView = null;
    window.dispatchEvent(new CustomEvent('peak-editor-diagnostics', { detail: { diagnostics: [], filePath: null } }));
}

// --- DIFF VIEW ---
const { MergeView, unifiedMergeView } = getModule('@codemirror/merge');

let diffView = null;
let unifiedDiffView = null;

function setupDiffEditor(container, originalContent, modifiedContent, filePath) {
    if (!MergeView) {
        container.innerHTML = `<div class="project-editor-placeholder error">Error: MergeView failed to load.</div>`;
        return null;
    }

    // Cleanup existing
    if (diffView) {
        diffView.destroy();
        diffView = null;
    }

    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const extensions = [
        ...getBaseExtensions(),
        getLanguageExtension(filePath),
        loadVSCodeTheme(isDarkMode),
        View.EditorView.editable.of(false) // Make read-only for now, or allow editing? Windsurf allows editing.
        // Let's keep it simple: Read-only comparison, user accepts "Modified".
    ];

    diffView = new MergeView({
        a: {
            doc: originalContent,
            extensions: extensions
        },
        b: {
            doc: modifiedContent,
            extensions: [
                ...extensions,
                View.EditorView.editable.of(true) // Allow editing the "Result" side
            ]
        },
        parent: container,
        highlightChanges: true,
        gutter: true,
        collapseUnchanged: { margin: 3 }, // Collapse unchanged regions to focus on diffs
        orientation: 'a-b' // Default is side-by-side
    });

    // FORCE VERTICAL LAYOUT (Stacked)
    // We inject a style tag to ensure these rules take precedence
    let style = container.querySelector('#diff-view-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'diff-view-style';
        style.textContent = `
            .cm-mergeView {
                flex-direction: column !important;
                height: 100% !important;
            }
            .cm-mergeViewEditors {
                flex-direction: column !important;
                height: 100% !important;
            }
            .cm-mergeViewEditor {
                width: 100% !important;
                height: 50% !important;
                overflow: auto !important;
            }
        `;
        container.appendChild(style);
    }

    return diffView;
}

function setupUnifiedDiffEditor(container, originalContent, modifiedContent, filePath) {
    if (!unifiedMergeView) {
        container.innerHTML = `<div class="project-editor-placeholder error">Error: unifiedMergeView failed to load.</div>`;
        return null;
    }

    // Cleanup existing
    if (unifiedDiffView) {
        unifiedDiffView.destroy();
        unifiedDiffView = null;
    }

    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const extensions = [
        ...getBaseExtensions(),
        getLanguageExtension(filePath),
        loadVSCodeTheme(isDarkMode),
        View.EditorView.editable.of(false), // Unified view usually read-only for comparison?
        View.EditorView.lineWrapping
    ];

    // Create a new EditorView with the unifiedMergeView extension
    const mergeExtension = unifiedMergeView({
        original: originalContent,
        highlightChanges: true,
        mergeControls: false, // We probably just want to see it, not merge interactions yet?
        gutter: true
    });

    const startState = State.EditorState.create({
        doc: modifiedContent, // The MAIN doc is the modified one
        extensions: [
            ...extensions,
            mergeExtension
        ]
    });

    unifiedDiffView = new View.EditorView({
        state: startState,
        parent: container
    });

    // Ensure height for scrolling
    let style = container.querySelector('#unified-diff-style');
    if (!style) {
        style = document.createElement('style');
        style.id = 'unified-diff-style';
        style.textContent = `
            .cm-editor { height: 100% !important; }
            .cm-scroller { overflow: auto !important; }
        `;
        container.appendChild(style);
    }

    return unifiedDiffView;
}

function getDiffContent() {
    if (!diffView) return null;
    return diffView.b.state.doc.toString();
}

function disposeDiffEditor() {
    if (diffView) {
        diffView.destroy();
        diffView = null;
    }
}

function disposeUnifiedDiffEditor() {
    if (unifiedDiffView) {
        unifiedDiffView.destroy();
        unifiedDiffView = null;
    }
}

function scanFileForErrors(content, filePath) {
    if (!State.EditorState || !syntaxTree) return [];

    try {
        const langExt = getLanguageExtension(filePath);
        if (!langExt || (Array.isArray(langExt) && langExt.length === 0)) return [];

        const state = State.EditorState.create({
            doc: content,
            extensions: [
                langExt,
                // We don't need the full UI extensions, just the language to build the tree
            ]
        });

        // Re-use the syntaxLinter logic, but we need to mock the 'view' object 
        // because syntaxLinter expects { state: ... }
        const mockView = { state };

        return syntaxLinter(mockView);
    } catch (e) {
        console.error("Scan error:", e);
        return [];
    }
}

module.exports = {
    setupCodeMirror,
    disposeEditor,
    setupDiffEditor,
    getDiffContent,
    disposeDiffEditor,
    setupUnifiedDiffEditor,
    disposeUnifiedDiffEditor,
    scanFileForErrors
};