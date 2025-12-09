// src/components/ProjectView/lsp-integration.js
// LSP Integration for CodeMirror Editor

const { ipcRenderer } = require('electron');
const { autocompletion } = require('@codemirror/autocomplete');
const { linter } = require('@codemirror/lint');
const { hoverTooltip } = require('@codemirror/view');
const { keymap } = require('@codemirror/view');

/**
 * Create LSP-powered autocomplete source for CodeMirror
 * @param {string} filePath - Current file path
 * @param {string} languageId - Language identifier (e.g., 'python', 'javascript')
 */
function createLSPAutocomplete(filePath, languageId) {
    return autocompletion({
        override: [
            async (context) => {
                try {
                    const doc = context.state.doc;
                    const pos = context.pos;

                    // Convert CodeMirror position to LSP position (line, character)
                    const line = doc.lineAt(pos);
                    const lspPosition = {
                        line: line.number - 1, // LSP is 0-indexed
                        character: pos - line.from
                    };

                    // Request completions from LSP
                    const uri = `file://${filePath}`;
                    const completions = await ipcRenderer.invoke('lsp:completion', uri, lspPosition);

                    if (!completions || completions.length === 0) {
                        return null;
                    }

                    // Convert LSP completion items to CodeMirror format
                    const options = completions.map(item => ({
                        label: item.label,
                        type: mapCompletionKind(item.kind),
                        detail: item.detail || '',
                        info: item.documentation?.value || item.documentation || '',
                        apply: item.insertText || item.label,
                        boost: item.sortText ? -parseFloat(item.sortText) : 0
                    }));

                    return {
                        from: pos,
                        options,
                        validFor: /^[\w$]*$/
                    };
                } catch (err) {
                    console.error('[LSP] Autocomplete failed:', err);
                    return null;
                }
            }
        ],
        activateOnTyping: true,
        maxRenderedOptions: 50
    });
}

/**
 * Map LSP completion kind to CodeMirror type
 */
function mapCompletionKind(kind) {
    const kindMap = {
        1: 'text',          // Text
        2: 'method',        // Method
        3: 'function',      // Function
        4: 'constructor',   // Constructor
        5: 'field',         // Field
        6: 'variable',      // Variable
        7: 'class',         // Class
        8: 'interface',     // Interface
        9: 'module',        // Module
        10: 'property',     // Property
        11: 'unit',         // Unit
        12: 'value',        // Value
        13: 'enum',         // Enum
        14: 'keyword',      // Keyword
        15: 'snippet',      // Snippet
        16: 'color',        // Color
        17: 'file',         // File
        18: 'reference',    // Reference
        19: 'folder',       // Folder
        20: 'enum-member',  // EnumMember
        21: 'constant',     // Constant
        22: 'struct',       // Struct
        23: 'event',        // Event
        24: 'operator',     // Operator
        25: 'type'          // TypeParameter
    };
    return kindMap[kind] || 'text';
}

/**
 * Create LSP-powered linter for CodeMirror
 * @param {string} filePath - Current file path
 * @param {string} languageId - Language identifier
 */
function createLSPLinter(filePath, languageId) {
    let cachedDiagnostics = [];

    // Listen for diagnostic updates from main process
    const uri = `file://${filePath}`;
    const diagnosticsHandler = (event, data) => {
        if (data.uri === uri) {
            cachedDiagnostics = data.diagnostics || [];
        }
    };

    ipcRenderer.on('lsp:diagnostics', diagnosticsHandler);

    const linterExtension = linter(async (view) => {
        try {
            const doc = view.state.doc;

            // Convert LSP diagnostics to CodeMirror diagnostics
            const cmDiagnostics = cachedDiagnostics.map(diag => {
                // Bounds check: ensure line numbers are valid
                const startLine = Math.max(0, Math.min(diag.range.start.line, doc.lines - 1));
                const endLine = Math.max(0, Math.min(diag.range.end.line, doc.lines - 1));

                // Skip if line is out of bounds
                if (startLine >= doc.lines) {
                    console.warn('[LSP] Diagnostic line out of bounds:', diag);
                    return null;
                }

                const from = posToOffset(doc, { line: startLine, character: diag.range.start.character || 0 });
                const to = posToOffset(doc, { line: endLine, character: diag.range.end.character || 0 });

                return {
                    from,
                    to,
                    severity: mapSeverity(diag.severity),
                    message: diag.message,
                    source: diag.source || 'LSP'
                };
            }).filter(Boolean); // Remove null entries

            return cmDiagnostics;
        } catch (err) {
            console.error('[LSP] Linter failed:', err);
            return [];
        }
    }, {
        delay: 500 // Debounce diagnostic updates
    });

    // Attach cleanup function
    linterExtension.cleanup = () => {
        ipcRenderer.removeListener('lsp:diagnostics', diagnosticsHandler);
    };

    return linterExtension;
}

/**
 * Map LSP severity to CodeMirror severity
 */
function mapSeverity(severity) {
    const severityMap = {
        1: 'error',       // Error
        2: 'warning',     // Warning
        3: 'info',        // Information
        4: 'info'         // Hint
    };
    return severityMap[severity] || 'info';
}

/**
 * Create LSP-powered hover tooltip for CodeMirror
 * @param {string} filePath - Current file path
 * @param {string} languageId - Language identifier
 */
function createLSPHover(filePath, languageId) {
    return hoverTooltip(async (view, pos) => {
        try {
            const doc = view.state.doc;
            const line = doc.lineAt(pos);

            // Convert to LSP position
            const lspPosition = {
                line: line.number - 1,
                character: pos - line.from
            };

            const uri = `file://${filePath}`;
            const hover = await ipcRenderer.invoke('lsp:hover', uri, lspPosition);

            if (!hover || !hover.contents) {
                return null;
            }

            // Extract hover content
            let content = '';
            if (typeof hover.contents === 'string') {
                content = hover.contents;
            } else if (hover.contents.value) {
                content = hover.contents.value;
            } else if (Array.isArray(hover.contents)) {
                content = hover.contents.map(c => c.value || c).join('\n\n');
            }

            if (!content) return null;

            return {
                pos,
                above: true,
                create: () => {
                    const dom = document.createElement('div');
                    dom.className = 'cm-tooltip-hover lsp-hover';
                    dom.style.padding = '8px';
                    dom.style.maxWidth = '500px';
                    dom.style.fontSize = '12px';
                    dom.style.lineHeight = '1.4';

                    // Render markdown if available
                    if (window.marked) {
                        dom.innerHTML = window.marked.parse(content);
                    } else {
                        dom.textContent = content;
                    }

                    return { dom };
                }
            };
        } catch (err) {
            console.error('[LSP] Hover failed:', err);
            return null;
        }
    });
}

/**
 * Create LSP go-to-definition keymap
 * @param {string} filePath - Current file path
 * @param {Function} openFileCallback - Callback to open file at position
 */
function createLSPGotoDefinitionKeymap(filePath, openFileCallback) {
    return keymap.of([
        {
            key: 'Mod-b',
            run: async (view) => {
                try {
                    const pos = view.state.selection.main.head;
                    const doc = view.state.doc;
                    const line = doc.lineAt(pos);

                    const lspPosition = {
                        line: line.number - 1,
                        character: pos - line.from
                    };

                    const uri = `file://${filePath}`;
                    const definition = await ipcRenderer.invoke('lsp:definition', uri, lspPosition);

                    if (definition) {
                        let targetUri, targetRange;

                        if (Array.isArray(definition)) {
                            if (definition.length === 0) return false;
                            targetUri = definition[0].uri || definition[0].targetUri;
                            targetRange = definition[0].range || definition[0].targetRange;
                        } else {
                            targetUri = definition.uri || definition.targetUri;
                            targetRange = definition.range || definition.targetRange;
                        }

                        if (targetUri) {
                            // Convert file:// URI to path
                            const targetPath = targetUri.replace('file://', '');
                            const targetLine = targetRange?.start?.line || 0;
                            const targetCharacter = targetRange?.start?.character || 0;

                            // Call callback to open file
                            if (openFileCallback) {
                                openFileCallback(targetPath, targetLine, targetCharacter);
                            }
                        }
                    }

                    return true;
                } catch (err) {
                    console.error('[LSP] Go to definition failed:', err);
                    return false;
                }
            }
        }
    ]);
}

/**
 * Convert LSP position to CodeMirror offset
 */
function posToOffset(doc, pos) {
    const line = doc.line(pos.line + 1); // CodeMirror is 1-indexed
    return line.from + pos.character;
}

/**
 * Notify LSP that a document was opened
 * @param {string} filePath - File path
 * @param {string} languageId - Language ID
 * @param {string} text - Document text
 */
function notifyDocumentOpen(filePath, languageId, text) {
    const uri = `file://${filePath}`;
    ipcRenderer.invoke('lsp:didOpen', uri, languageId, text, 1);
}

/**
 * Notify LSP that a document changed
 * @param {string} filePath - File path
 * @param {string} newText - New document text
 */
function notifyDocumentChange(filePath, newText) {
    const uri = `file://${filePath}`;
    ipcRenderer.send('lsp:didChange', uri, [], newText);
}

/**
 * Notify LSP that a document was closed
 * @param {string} filePath - File path
 */
function notifyDocumentClose(filePath) {
    const uri = `file://${filePath}`;
    ipcRenderer.send('lsp:didClose', uri);
}

/**
 * Get language ID from file extension
 */
function getLanguageId(filePath) {
    const ext = filePath.split('.').pop()?.toLowerCase();
    const langMap = {
        'js': 'javascript',
        'jsx': 'javascriptreact',
        'ts': 'typescript',
        'tsx': 'typescriptreact',
        'py': 'python',
        'java': 'java',
        'c': 'c',
        'cpp': 'cpp',
        'cs': 'csharp',
        'go': 'go',
        'rs': 'rust',
        'php': 'php',
        'rb': 'ruby',
        'swift': 'swift',
        'kt': 'kotlin',
        'scala': 'scala',
        'html': 'html',
        'css': 'css',
        'scss': 'scss',
        'json': 'json',
        'md': 'markdown',
        'yaml': 'yaml',
        'yml': 'yaml',
        'xml': 'xml',
        'sql': 'sql',
        'sh': 'shellscript',
        'bash': 'shellscript'
    };
    return langMap[ext] || 'plaintext';
}

module.exports = {
    createLSPAutocomplete,
    createLSPLinter,
    createLSPHover,
    createLSPGotoDefinitionKeymap,
    notifyDocumentOpen,
    notifyDocumentChange,
    notifyDocumentClose,
    getLanguageId
};
