// src/components/ProjectView/editor.js
// --- CodeMirror Editor Logic ---

// Helper function to safely extract a named export or check the default export
function SafeCjsImport(moduleName, exportName) {
    const module = require(moduleName);
    if (module && module[exportName]) return module[exportName];
    if (module && module.default && module.default[exportName]) return module.default[exportName];
    if (exportName === 'basicSetup' && module) return module;
    return undefined; 
}

// Helper function to safely extract a function export (like javascript)
function SafeCjsFuncImport(moduleName, funcName) {
    const module = require(moduleName);
    if (module && module[funcName]) return module[funcName];
    if (module && module.default && module.default[funcName]) return module.default[funcName];
    return () => []; 
}

// Core modules (These must load cleanly)
const EditorState = SafeCjsImport('@codemirror/state', 'EditorState');
const EditorView = SafeCjsImport('@codemirror/view', 'EditorView');
const basicSetup = SafeCjsImport('codemirror', 'basicSetup'); 
const search = SafeCjsImport('@codemirror/search', 'search'); 

// Language Modules 
const lang_js_func = SafeCjsFuncImport('@codemirror/lang-javascript', 'javascript');
const lang_json_func = SafeCjsFuncImport('@codemirror/lang-json', 'json');
const lang_html_func = SafeCjsFuncImport('@codemirror/lang-html', 'html');
const lang_css_func = SafeCjsFuncImport('@codemirror/lang-css', 'css'); 
const lang_markdown_func = SafeCjsFuncImport('@codemirror/lang-markdown', 'markdown');

// --- NEW/MAXIMIZED LANGUAGE IMPORTS ---
const lang_python_func = SafeCjsFuncImport('@codemirror/lang-python', 'python'); 
const lang_xml_func = SafeCjsFuncImport('@codemirror/lang-xml', 'xml');
const lang_java_func = SafeCjsFuncImport('@codemirror/lang-java', 'java'); 
// --- END NEW IMPORTS ---


// --- Local State ---
let editorView = null; 
let saveTimeout = null; 
// --- END Local State ---


// --- NEW THEME LOADER FUNCTION (FIXED) ---
function loadVSCodeTheme(isDarkMode) {
    let vscodeDark;
    let vscodeLight;
    
    try {
        // Dynamic loading inside a function to isolate the scope and failures
        const VSCodeThemeModule = require('@uiw/codemirror-theme-vscode');
        
        // Use robust access pattern for the theme extensions
        vscodeDark = VSCodeThemeModule.vscodeDark || (VSCodeThemeModule.default && VSCodeThemeModule.default.vscodeDark);
        vscodeLight = VSCodeThemeModule.vscodeLight || (VSCodeThemeModule.default && VSCodeThemeModule.default.vscodeLight);

    } catch (e) {
        console.warn("Could not load VSCode theme package. Falling back to base style.");
        // If theme loading fails, we proceed with undefined extensions
        vscodeDark = undefined;
        vscodeLight = undefined;
    }

    // Determine which theme to return, prioritizing dark mode, then light mode, then base theme.
    const themeExtension = isDarkMode && vscodeDark 
        ? vscodeDark 
        : vscodeLight 
        ? vscodeLight 
        : EditorView.baseTheme({}); // Fallback to CodeMirror's internal base theme
        
    return themeExtension;
}
// --- END NEW THEME LOADER FUNCTION ---


// --- CODE MIRROR HELPERS ---

function getLanguageExtension(filePath) {
    const ext = filePath.split('.').pop().toLowerCase();
    
    switch (ext) {
        // --- JavaScript / TypeScript ---
        case 'js':
        case 'jsx':
        case 'mjs':
        case 'ts':
        case 'tsx':
            return lang_js_func({ 
                jsx: ext.includes('jsx') || ext.includes('tsx'), 
                typescript: ext.includes('ts') || ext.includes('tsx') 
            });
            
        // --- Structured Data ---
        case 'json':
        case 'jsonc':
            return lang_json_func();
            
        // --- Markup / CSS ---
        case 'html':
        case 'htm':
            return lang_html_func();
        case 'css':
        case 'less':
        case 'sass':
            return lang_css_func();
        case 'md':
        case 'markdown':
            return lang_markdown_func();
            
        // --- Expanded Language Support ---
        case 'py':
        case 'python':
            return lang_python_func();
        case 'xml':
        case 'svg':
            return lang_xml_func();
        case 'java':
            return lang_java_func();
            
        // --- Plain Text / Writing Mode (No Highlighting) ---
        case 'txt': 
        case 'log':
        case '':    
            return []; 
            
        default:
            // Fallback to JavaScript as requested
            return lang_js_func(); 
    }
}

function setupCodeMirror(container, content, filePath) {
    if (typeof EditorState === 'undefined' || typeof EditorView === 'undefined' || typeof basicSetup === 'undefined') {
        console.error("CRITICAL ERROR: CodeMirror core components failed to load.");
        container.innerHTML = `<div class="project-editor-placeholder error">CRITICAL ERROR: Editor components failed to load.</div>`;
        return null;
    }
    
    if (editorView) {
        if (editorView.dom.parentNode) {
            editorView.destroy();
        }
        editorView = null;
    }
    
    // --- NEW: Debounce function for saving ---
    const saveContent = (content) => {
        if (saveTimeout) clearTimeout(saveTimeout);
        saveTimeout = setTimeout(async () => {
            console.log(`[Editor]: Auto-saving file: ${filePath}`);
            await window.ipcRenderer.invoke('project:write-file', filePath, content);
        }, 500); // Debounce save by 500ms
    };
    // --- END NEW ---
    
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const themeExtension = loadVSCodeTheme(isDarkMode); 
    
    const startState = EditorState.create({ 
        doc: content,
        extensions: [
            basicSetup, 
            getLanguageExtension(filePath),
            themeExtension, // Apply the selected VSCode theme
            search(), // Add the search functionality
            EditorView.updateListener.of((update) => {
                if (update.docChanged) {
                    saveContent(update.state.doc.toString());
                }
            })
        ]
    });

    editorView = new EditorView({
        state: startState,
        parent: container
    });
    
    console.log('[ProjectView]: CodeMirror Editor initialized successfully and mounted.');
    
    return editorView;
}

function disposeEditor(view) {
    if (view) {
        // IMPORTANT: Clear any pending save operation when closing the tab
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        view.destroy();
        editorView = null;
    }
}

module.exports = {
    setupCodeMirror,
    disposeEditor,
};