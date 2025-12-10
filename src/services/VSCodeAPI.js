const path = require('path');
const fs = require('fs');
const os = require('os');
const { EventEmitter } = require('events');
const { v4: uuidv4 } = require('uuid');

/**
 * VSCode API Compatibility Layer
 * Implements core vscode.* namespaces for extension compatibility
 */
class VSCodeAPI {
    constructor(extensionHost) {
        this.extensionHost = extensionHost;
        this._onDidChangeConfiguration = new EventEmitter();
        this._onDidSaveTextDocument = new EventEmitter();
        this._onDidOpenTextDocument = new EventEmitter();
        this._onDidCloseTextDocument = new EventEmitter();
        this._onDidChangeExtensions = new EventEmitter(); // FIX: Add event emitter for extension changes
        this._onDidChangeTextDocument = new EventEmitter(); // Added for consistency with maxListeners
        this._onDidChangeWorkspaceFolders = new EventEmitter();

        // Increase max listeners for all emitters
        this._onDidOpenTextDocument.setMaxListeners(100);
        this._onDidCloseTextDocument.setMaxListeners(100);
        this._onDidChangeTextDocument.setMaxListeners(100);
        this._onDidSaveTextDocument.setMaxListeners(100);
        this._onDidChangeConfiguration.setMaxListeners(100);
        this._onDidChangeExtensions.setMaxListeners(100);

        this._statusBarItems = [];
        this._outputChannels = new Map();

        // FIX: Add language provider registries
        this._languageProviders = {
            completion: new Map(),        // languageId -> [{selector, provider, extensionId}]
            hover: new Map(),
            definition: new Map(),
            signature: new Map(),
            documentSymbol: new Map(),
            documentLink: new Map(),      // languageId -> [{selector, provider, extensionId}]
            workspaceSymbol: [],          // No language filter
            formatting: new Map(),
            rangeFormatting: new Map(),
            onTypeFormatting: new Map(),
            rename: new Map(),
            reference: new Map(),
            codeAction: new Map(),
            fold: new Map(),
            color: new Map(),
            selectionRange: new Map(),
            documentHighlight: new Map(),  // FIX: Missing provider type
            linkedEditingRange: new Map(), // FIX: Missing provider type
            documentSemanticTokens: new Map() // FIX: Missing provider type
        };

        // FIX: Cache the API object so class constructors remain consistent
        // This is critical for instanceof checks in extensions
        this._cachedAPI = null;

        // FIX: Track open documents for provider lookups
        this._documents = new Map(); // uri -> { languageId, version, text }
    }

    /**
     * Internal helper to create a VS Code compatible Event function
     * @param {EventEmitter} emitter - Node.js EventEmitter
     * @param {string} eventName - Event name to listen for
     * @returns {Function} VS Code Event function: (listener, thisArgs, disposables) => Disposable
     */
    _createEvent(emitter, eventName) {
        return (listener, thisArgs, disposables) => {
            // FIX: Bind listener to thisArgs if provided
            const effectiveListener = thisArgs ? listener.bind(thisArgs) : listener;

            emitter.on(eventName, effectiveListener);

            const disposable = {
                dispose: () => {
                    emitter.removeListener(eventName, effectiveListener);
                }
            };

            if (disposables) {
                disposables.push(disposable);
            }

            return disposable;
        };
    }

    /**
     * Internal helper to create output channels
     */

    _createOutputChannel(name) {
        if (this._outputChannels.has(name)) {
            return this._outputChannels.get(name);
        }

        console.log(`[VSCodeAPI] _createOutputChannel creating new channel: '${name}'`);

        const self = this;
        const channel = {
            name,
            _content: [],
            append: (value) => {
                channel._content.push(value);
                console.log(`[OutputChannel: ${name}]`, value.trim());

                // FIX: Detect when TypeScript server finishes starting up
                if (String(name) === 'TypeScript') {
                    // Check full content history for startup messages (handles chunked output)
                    const fullContent = channel._content.join('');

                    if (!channel._syntaxStarted) {
                        channel._syntaxStarted = fullContent.includes('<syntax>') && fullContent.includes('Starting');
                        if (channel._syntaxStarted) console.log('[VSCodeAPI] Detected TypeScript Syntax Server starting!');
                    }

                    if (!channel._semanticStarted) {
                        channel._semanticStarted = fullContent.includes('<semantic>') && fullContent.includes('Starting');
                        if (channel._semanticStarted) console.log('[VSCodeAPI] Detected TypeScript Semantic Server starting!');
                    }

                    // Trigger re-emission if both started and not yet done
                    if (channel._syntaxStarted && channel._semanticStarted && !channel._documentsReEmitted) {
                        console.log('[VSCodeAPI] Both TypeScript servers started! Scheduling document re-emission...');
                        channel._documentsReEmitted = true;

                        // Wait 1s to ensure servers are fully ready
                        setTimeout(() => {
                            console.log('[VSCodeAPI] Re-emitting document events to TypeScript extension now');
                            let reEmittedCount = 0;

                            if (self._documents.size === 0) {
                                console.warn('[VSCodeAPI] No documents found in _documents map to re-emit!');
                            }

                            for (const [uriString, document] of self._documents.entries()) {
                                try {
                                    console.log(`[VSCodeAPI] Re-emitting for: ${uriString}`);
                                    self._onDidOpenTextDocument.emit('open', document);
                                    reEmittedCount++;
                                } catch (err) {
                                    console.error('[VSCodeAPI] Error re-emitting document event:', err);
                                }
                            }

                            console.log(`[VSCodeAPI] Re-emitted ${reEmittedCount} document event(s)`);
                        }, 1000);
                    }
                }
            },
            appendLine: (value) => {
                channel.append(value + '\n');
            },
            clear: () => {
                channel._content = [];
            },
            show: (preserveFocus) => {
                console.log(`[OutputChannel: ${name}] Showing output channel`);
                // Send to renderer
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:show-output-channel', {
                        name,
                        content: channel._content.join('')
                    });
                }
            },
            hide: () => { },
            dispose: () => {
                self._outputChannels.delete(name);
            },
            // LogOutputChannel methods
            trace: (message, ...args) => console.log(`[OutputChannel: ${name}] [TRACE]`, message, ...args),
            debug: (message, ...args) => console.log(`[OutputChannel: ${name}] [DEBUG]`, message, ...args),
            info: (message, ...args) => console.log(`[OutputChannel: ${name}] [INFO]`, message, ...args),
            warn: (message, ...args) => console.warn(`[OutputChannel: ${name}] [WARN]`, message, ...args),
            error: (error) => console.error(`[OutputChannel: ${name}] [ERROR]`, error),
            replace: (value) => { channel._content = [value]; },
            onDidChangeLogLevel: (listener) => ({ dispose: () => { } })
        };

        this._outputChannels.set(name, channel);
        return channel;
    }

    /**
     * Get the vscode module object that extensions import
     */
    getAPI() {
        // FIX: Return cached API to ensure consistent class constructors
        if (this._cachedAPI) {
            return this._cachedAPI;
        }

        const api = {
            window: this.getWindowAPI(),
            workspace: this.getWorkspaceAPI(),
            commands: this.getCommandsAPI(),
            env: this.getEnvAPI(),
            extensions: this.getExtensionsAPI(),
            languages: this.getLanguagesAPI(),
            tasks: this.getTasksAPI(),
            // FIX: Mock SCM (Source Control) namespace
            scm: {
                createSourceControl: (id, label, rootUri) => ({
                    dispose: () => { },
                    inputBox: { value: '' },
                    count: 0,
                    statusBarCommands: [],
                    acceptInputCommand: undefined,
                    quickDiffProvider: undefined,
                    commitTemplate: '',
                    createResourceGroup: (id, label) => ({
                        dispose: () => { },
                        resourceStates: []
                    })
                }),
                inputBox: { value: '' }
            },
            chat: {
                registerMappedEditsProvider: () => ({ dispose: () => { } })
            }, // FIX: Mock chat namespace
            notebooks: {
                createRendererMessaging: () => ({ postMessage: () => { }, onDidReceiveMessage: () => ({ dispose: () => { } }) }),
                registerSignatureHelpProvider: (selector, provider, ...triggerCharacters) => ({ dispose: () => { } }),
                registerDocumentSemanticTokensProvider: (selector, provider, legend) => ({ dispose: () => { } }),
                registerCodeLensProvider: (selector, provider) => ({ dispose: () => { } }),
                getLanguages: () => Promise.resolve(['python', 'javascript', 'json']),
                registerDocumentLinkProvider: (selector, provider) => ({ dispose: () => { } }),
                createNotebookControllerDetectionTask: (type) => ({ dispose: () => { } }),
                registerKernelSourceActionProvider: (selector, provider) => ({ dispose: () => { } }),
                createNotebookController: (id, notebookType, label) => {
                    return {
                        dispose: () => { },
                        updateNotebookAffinity: (notebook, affinity) => { }
                    };
                }
            },
            // FIX: Mock debug namespace for Jupyter
            debug: {
                onDidTerminateDebugSession: () => ({ dispose: () => { } }),
                onDidStartDebugSession: () => ({ dispose: () => { } }),
                onDidChangeActiveDebugSession: () => ({ dispose: () => { } }),
                onDidReceiveDebugSessionCustomEvent: () => ({ dispose: () => { } }),
                startDebugging: () => Promise.resolve(false),
                registerDebugAdapterDescriptorFactory: () => ({ dispose: () => { } }),
                registerDebugAdapterTrackerFactory: () => ({ dispose: () => { } }),
                activeDebugSession: undefined,
                breakpoints: [] // Added breakpoints array
            },
            // Types and enums
            StatusBarAlignment: { Left: 1, Right: 2 },
            OverviewRulerLane: { Left: 1, Center: 2, Right: 4, Full: 7 },
            DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
            DiagnosticTag: { Unnecessary: 1, Deprecated: 2 },
            CompletionItemTag: { Deprecated: 1 },
            ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
            TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2 },
            Disposable: class Disposable {
                constructor(callOnDispose) { this._callOnDispose = callOnDispose; }
                dispose() { if (this._callOnDispose) this._callOnDispose(); }
                static from(...disposables) { return new Disposable(() => disposables.forEach(d => d.dispose())); }
            },
            CancellationTokenSource: class CancellationTokenSource {
                constructor() { this.token = { isCancellationRequested: false, onCancellationRequested: (cb) => { this._onCancel = cb; } }; }
                cancel() { this.token.isCancellationRequested = true; if (this._onCancel) this._onCancel(); }
                dispose() { }
            },
            EventEmitter: class EventEmitter {
                constructor() {
                    this._listeners = [];
                    this.event = (listener, thisArgs, disposables) => {
                        const effectiveListener = thisArgs ? listener.bind(thisArgs) : listener;
                        this._listeners.push(effectiveListener);
                        const disposable = {
                            dispose: () => {
                                const i = this._listeners.indexOf(effectiveListener);
                                if (i > -1) this._listeners.splice(i, 1);
                            }
                        };
                        if (disposables) disposables.push(disposable);
                        return disposable;
                    };
                }
                fire(data) { this._listeners.forEach(l => { try { l(data); } catch (e) { console.error('[VSCodeAPI] EventEmitter Error:', e); } }); }
                dispose() { this._listeners = []; }
            },

            l10n: {
                t: (message, ...args) => {
                    // Simple placeholder replacement
                    if (typeof message === 'string') return message;
                    if (message && message.message) return message.message;
                    return '';
                },
                // FIX: Add translate alias for compatibility with some extensions/polyfills
                translate: (message, ...args) => {
                    if (typeof message === 'string') return message;
                    if (message && message.message) return message.message;
                    return '';
                },
                bundle: undefined,
                uri: undefined
            },
            Uri: class Uri {
                constructor(scheme, authority, path, query, fragment) {
                    this.scheme = scheme;
                    this.authority = authority;
                    this.path = path;
                    this.query = query;
                    this.fragment = fragment;
                }
                static file(path) { return new Uri('file', '', path, '', ''); }
                static parse(value) {
                    const match = value.match(/^([a-z]+):\/\/([^/]*)(.*)$/);
                    if (match) {
                        return new Uri(match[1], match[2], match[3], '', '');
                    }
                    return new Uri('file', '', value, '', '');
                }

                with(change) {
                    return new Uri(
                        change.scheme !== undefined ? change.scheme : this.scheme,
                        change.authority !== undefined ? change.authority : this.authority,
                        change.path !== undefined ? change.path : this.path,
                        change.query !== undefined ? change.query : this.query,
                        change.fragment !== undefined ? change.fragment : this.fragment
                    );
                }
                static joinPath(uri, ...pathSegments) {
                    return Uri.file(path.join(uri.fsPath, ...pathSegments));
                }
                get fsPath() {
                    return this._fsPath || (this.scheme === 'file' ? this.path : this.path);
                }
                toString() {
                    return `${this.scheme}://${this.authority}${this.path}`;
                }
                toJSON() {
                    return {
                        scheme: this.scheme,
                        authority: this.authority,
                        path: this.path,
                        query: this.query,
                        fragment: this.fragment,
                        fsPath: this.fsPath,
                        external: this.toString()
                    };
                }
            },
            // FIX: Add TextDocument and TextEditor classes for instanceof checks
            TextDocument: class TextDocument {
                constructor(uri, languageId, version, getText) {
                    this.uri = uri;
                    this.fileName = uri.fsPath;
                    this.isUntitled = false;
                    this.languageId = languageId || 'plaintext';
                    this.version = version || 1;
                    this.isDirty = false;
                    this.isClosed = false;
                    this.eol = 1; // LF
                    this._getText = getText || (() => '');
                    this.notebook = undefined; // Fix: Add notebook property
                }

                get lineCount() {
                    const text = this._getText();
                    return (text.match(/\n/g) || []).length + 1;
                }

                save() { return Promise.resolve(true); }

                getText(range) {
                    const text = this._getText();
                    if (!range) return text;

                    // Simple range extraction if needed
                    const startOffset = this.offsetAt(range.start);
                    const endOffset = this.offsetAt(range.end);
                    return text.slice(startOffset, endOffset);
                }

                getWordRangeAtPosition(position, regex) {
                    // Basic implementation
                    return undefined;
                }

                validateRange(range) { return range; }
                validatePosition(position) { return position; }

                lineAt(lineOrPosition) {
                    const line = typeof lineOrPosition === 'number' ? lineOrPosition : lineOrPosition.line;
                    const text = this._getText() || '';
                    const lines = text.split(/\r\n|\r|\n/);
                    const lineText = lines[line] || '';

                    // Mock TextLine object
                    return {
                        lineNumber: line,
                        text: lineText,
                        range: { start: { line, character: 0 }, end: { line, character: lineText.length } },
                        rangeIncludingLineBreak: { start: { line, character: 0 }, end: { line, character: lineText.length + 1 } },
                        firstNonWhitespaceCharacterIndex: lineText.search(/\S|$/),
                        isEmptyOrWhitespace: !/\S/.test(lineText)
                    };
                }

                offsetAt(position) {
                    const text = this._getText();
                    const lines = text.split(/\r\n|\r|\n/);
                    let offset = 0;
                    for (let i = 0; i < position.line && i < lines.length; i++) {
                        offset += lines[i].length + 1; // +1 for newline
                    }
                    return offset + position.character;
                }

                positionAt(offset) {
                    const text = this._getText();
                    const before = text.slice(0, offset);
                    const lines = before.split(/\r\n|\r|\n/);
                    const line = lines.length - 1;
                    const character = lines[line].length;
                    return { line, character }; // Return simple object, extension should handle it or use new Position()
                }
            },
            TextEditor: class TextEditor {
                constructor(document, selection, selections, visibleRanges, options, viewColumn) {
                    this.document = document;
                    this.selection = selection || { active: { line: 0, character: 0 }, anchor: { line: 0, character: 0 } };
                    this.selections = selections || [this.selection];
                    this.visibleRanges = visibleRanges || [];
                    this.options = options || {};
                    this.viewColumn = viewColumn || 1;
                }
                edit(callback) { return Promise.resolve(true); }
                insertSnippet(snippet, location, options) { return Promise.resolve(true); }
                setDecorations(decorationType, rangesOrOptions) { }
                revealRange(range, revealType) { }
                show(column) { }
                hide() { }
            },
            TextLine: class TextLine {
                constructor(lineNumber, text) {
                    this.lineNumber = lineNumber;
                    this.text = text || '';
                    this.range = { start: { line: lineNumber, character: 0 }, end: { line: lineNumber, character: this.text.length } };
                    this.rangeIncludingLineBreak = this.range;
                    this.firstNonWhitespaceCharacterIndex = 0;
                    this.isEmptyOrWhitespace = this.text.trim().length === 0;
                }
            },
            TextEditorDecorationType: class TextEditorDecorationType {
                constructor(key) {
                    this.key = key;
                }
                dispose() { }
            },
            TextDocumentChangeEvent: class TextDocumentChangeEvent {
                constructor(document, contentChanges) {
                    this.document = document;
                    this.contentChanges = contentChanges || [];
                }
            },
            TextDocumentContentChangeEvent: class TextDocumentContentChangeEvent {
                constructor(range, rangeOffset, rangeLength, text) {
                    this.range = range;
                    this.rangeOffset = rangeOffset || 0;
                    this.rangeLength = rangeLength || 0;
                    this.text = text || '';
                }
            },
            TextEditorSelectionChangeEvent: class TextEditorSelectionChangeEvent {
                constructor(textEditor, selections, kind) {
                    this.textEditor = textEditor;
                    this.selections = selections;
                    this.kind = kind;
                }
            },
            TextEditorEdit: class TextEditorEdit {
                replace(location, value) { }
                insert(location, value) { }
                delete(location) { }
                setEndOfLine(endOfLine) { }
            },
            EndOfLine: { LF: 1, CRLF: 2 },
            TextEditorRevealType: { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 },
            TextEditorCursorStyle: { Line: 1, Block: 2, Underline: 3, LineThin: 4, BlockOutline: 5, UnderlineThin: 6 },
            TextEditorLineNumbersStyle: { Off: 0, On: 1, Relative: 2 },
            TextDocumentSaveReason: { Manual: 1, AfterDelay: 2, FocusOut: 3 },
            TextEditorSelectionChangeKind: { Keyboard: 1, Mouse: 2, Command: 3 },

            // Tab Input classes
            TabInputText: class TabInputText { constructor(uri) { this.uri = uri; } },
            TabInputTextDiff: class TabInputTextDiff { constructor(original, modified) { this.original = original; this.modified = modified; } },
            TabInputCustom: class TabInputCustom { constructor(uri, viewType) { this.uri = uri; this.viewType = viewType; } },
            TabInputWebview: class TabInputWebview { constructor(viewType) { this.viewType = viewType; } },
            TabInputNotebook: class TabInputNotebook { constructor(uri, notebookType) { this.uri = uri; this.notebookType = notebookType; } },
            TabInputNotebookDiff: class TabInputNotebookDiff { constructor(original, modified, notebookType) { this.original = original; this.modified = modified; this.notebookType = notebookType; } },
            TabInputTerminal: class TabInputTerminal { constructor() { } },
            TabInputInteractiveWindow: class TabInputInteractiveWindow { constructor(uri, inputBoxUri) { this.uri = uri; this.inputBoxUri = inputBoxUri; } },

            // FIX: Add WebviewPanel and WebviewView classes
            WebviewPanel: class WebviewPanel {
                constructor(viewType, title, viewColumn, options) {
                    this.viewType = viewType;
                    this.title = title;
                    this.webview = {
                        html: '',
                        onDidReceiveMessage: () => ({ dispose: () => { } }),
                        postMessage: () => Promise.resolve(true),
                        asWebviewUri: (uri) => uri
                    };
                    this.onDidDispose = () => ({ dispose: () => { } });
                    this.onDidChangeViewState = () => ({ dispose: () => { } });
                }
                dispose() { }
            },
            WebviewView: class WebviewView {
                constructor(viewType) {
                    this.viewType = viewType;
                    this.webview = {
                        html: '',
                        onDidReceiveMessage: () => ({ dispose: () => { } }),
                        postMessage: () => Promise.resolve(true),
                        asWebviewUri: (uri) => uri
                    };
                    this.onDidDispose = () => ({ dispose: () => { } });
                    this.onDidChangeVisibility = () => ({ dispose: () => { } });
                }
            },
            Range: class Range {
                constructor(startLine, startChar, endLine, endChar) {
                    this.start = { line: startLine, character: startChar };
                    this.end = { line: endLine, character: endChar };
                }
            },
            Position: class Position {
                constructor(line, character) {
                    this.line = line;
                    this.character = character;
                }
            },
            Location: class Location {
                constructor(uri, rangeOrPosition) {
                    this.uri = uri;
                    this.range = rangeOrPosition;
                }
            },
            Selection: class Selection {
                constructor(anchorLine, anchorChar, activeLine, activeChar) {
                    this.anchor = { line: anchorLine, character: anchorChar };
                    this.active = { line: activeLine, character: activeChar };
                }
            },
            ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
            ThemeIcon: class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } },
            CodeAction: class CodeAction { constructor(title, kind) { this.title = title; this.kind = kind; } },
            CodeActionKind: class CodeActionKind {
                constructor(value) { this.value = value; }
                append(part) { return new CodeActionKind(this.value ? `${this.value}.${part}` : part); }
                static get Empty() { return new CodeActionKind('empty'); }
                static get QuickFix() { return new CodeActionKind('quickfix'); }
                static get Refactor() { return new CodeActionKind('refactor'); }
                static get RefactorExtract() { return new CodeActionKind('refactor.extract'); }
                static get RefactorInline() { return new CodeActionKind('refactor.inline'); }
                static get RefactorRewrite() { return new CodeActionKind('refactor.rewrite'); }
                static get Source() { return new CodeActionKind('source'); }
                static get SourceOrganizeImports() { return new CodeActionKind('source.organizeImports'); }
                static get SourceFixAll() { return new CodeActionKind('source.fixAll'); }
            },
            SnippetString: class SnippetString { constructor(value) { this.value = value || ''; } appendText(str) { this.value += str; return this; } append(str) { return this.appendText(str); } appendTabstop(n) { this.value += '$' + n; return this; } appendPlaceholder(value, n) { this.value += '${' + n + ':' + value + '}'; return this; } appendVariable(name, defaultValue) { this.value += '${' + name + (defaultValue ? ':' + defaultValue : '') + '}'; return this; } },
            ParameterInformation: class ParameterInformation { constructor(label, documentation) { this.label = label; this.documentation = documentation; } },
            SignatureInformation: class SignatureInformation { constructor(label, documentation) { this.label = label; this.documentation = documentation; this.parameters = []; } },
            DocumentLink: class DocumentLink { constructor(range, target) { this.range = range; this.target = target; } },
            Color: class Color { constructor(r, g, b, a) { this.red = r; this.green = g; this.blue = b; this.alpha = a; } },
            ColorInformation: class ColorInformation { constructor(range, color) { this.range = range; this.color = color; } },
            ColorPresentation: class ColorPresentation { constructor(label) { this.label = label; } },
            FoldingRange: class FoldingRange { constructor(start, end, kind) { this.start = start; this.end = end; this.kind = kind; } },
            FoldingRangeKind: { Comment: 1, Imports: 2, Region: 3 },
            WorkspaceEdit: class WorkspaceEdit { constructor() { this._edits = []; } replace(uri, range, newText) { this._edits.push({ uri, range, newText }); } },
            NotebookEdit: class NotebookEdit { constructor(range, newText) { this.range = range; this.newText = newText; } },
            UIKind: { Desktop: 1, Web: 2 },
            SymbolKind: { File: 0, Module: 1, Namespace: 2, Package: 3, Class: 4, Method: 5, Property: 6, Field: 7, Constructor: 8, Enum: 9, Interface: 10, Function: 11, Variable: 12, Constant: 13, String: 14, Number: 15, Boolean: 16, Array: 17, Object: 18, Key: 19, Null: 20, EnumMember: 21, Struct: 22, Event: 23, Operator: 24, TypeParameter: 25 },
            CompletionItemKind: { Text: 0, Method: 1, Function: 2, Constructor: 3, Field: 4, Variable: 5, Class: 6, Interface: 7, Module: 8, Property: 9, Unit: 10, Value: 11, Enum: 12, Keyword: 13, Snippet: 14, Color: 15, File: 16, Reference: 17, Folder: 18, EnumMember: 19, Constant: 20, Struct: 21, Event: 22, Operator: 23, TypeParameter: 24, User: 25, Issue: 26 },
            IndentAction: { None: 0, Indent: 1, IndentOutdent: 2, Outdent: 3 },
            Diagnostic: class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } },
            DiagnosticTag: { Unnecessary: 1, Deprecated: 2 },
            DiagnosticRelatedInformation: class DiagnosticRelatedInformation { constructor(location, message) { this.location = location; this.message = message; } },
            CompletionItem: class CompletionItem {
                constructor(label, kind) { this.label = label; this.kind = kind; }
            },
            CompletionItemTag: { Deprecated: 1 },
            CompletionList: class CompletionList {
                constructor(items = [], isIncomplete = false) { this.items = items; this.isIncomplete = isIncomplete; }
            },
            Hover: class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } },
            MarkdownString: class MarkdownString { constructor(value) { this.value = value || ''; } appendText(str) { this.value += str; return this; } append(str) { return this.appendText(str); } appendMarkdown(str) { this.value += str; return this; } appendCodeblock(code, lang) { this.value += '\n```' + (lang || '') + '\n' + code + '\n```\n'; return this; } },
            TextEdit: class TextEdit { constructor(range, newText) { this.range = range; this.newText = newText; } static replace(range, newText) { return new TextEdit(range, newText); } static insert(position, newText) { return new TextEdit({ start: position, end: position }, newText); } static delete(range) { return new TextEdit(range, ''); } },
            CodeLens: class CodeLens { constructor(range, command) { this.range = range; this.command = command; } },
            DocumentSymbol: class DocumentSymbol { constructor(name, detail, kind, range, selectionRange) { this.name = name; this.detail = detail; this.kind = kind; this.range = range; this.selectionRange = selectionRange; this.children = []; } },
            SymbolInformation: class SymbolInformation { constructor(name, kind, containerName, location) { this.name = name; this.kind = kind; this.containerName = containerName; this.location = location; } },
            SignatureHelp: class SignatureHelp { constructor() { this.signatures = []; this.activeSignature = 0; this.activeParameter = 0; } },
            DocumentHighlight: class DocumentHighlight { constructor(range, kind) { this.range = range; this.kind = kind; } },
            DocumentHighlightKind: { Text: 0, Read: 1, Write: 2 },
            SelectionRange: class SelectionRange {
                constructor(range, parent) { this.range = range; this.parent = parent; }
            },
            FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
            FileSystemError: class FileSystemError extends Error { static FileNotFound(uri) { return new FileSystemError('File not found'); } static FileExists(uri) { return new FileSystemError('File exists'); } static FileNotADirectory(uri) { return new FileSystemError('File is not a directory'); } static FileIsADirectory(uri) { return new FileSystemError('File is a directory'); } static NoPermissions(uri) { return new FileSystemError('No permissions'); } static Unavailable(uri) { return new FileSystemError('Unavailable'); } },
            ExtensionKind: { UI: 1, Workspace: 2 },
            ExtensionMode: { Production: 1, Development: 2, Test: 3 },
            ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
            TreeItem: class TreeItem { constructor(label, collapsibleState) { this.label = label; this.collapsibleState = collapsibleState; } },
            TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
            QuickPickItem: class QuickPickItem { constructor(label) { this.label = label; } },
            InputBoxValidationSeverity: { Info: 1, Warning: 2, Error: 3 },
            Task: class Task { constructor(definition, scope, name, source, execution, problemMatchers) { this.definition = definition; this.scope = scope; this.name = name; this.source = source; this.execution = execution; this.problemMatchers = problemMatchers; } },
            TaskGroup: class TaskGroup { static Clean = new TaskGroup('clean', 'Clean'); static Build = new TaskGroup('build', 'Build'); static Rebuild = new TaskGroup('rebuild', 'Rebuild'); static Test = new TaskGroup('test', 'Test'); constructor(id, label) { this.id = id; this.label = label; } },
            TaskPanelKind: { Shared: 1, Dedicated: 2, New: 3 },
            TaskRevealKind: { Always: 1, Silent: 2, Never: 3 },
            ShellExecution: class ShellExecution { constructor(command, args, options) { this.command = command; this.args = args; this.options = options; } },
            ProcessExecution: class ProcessExecution { constructor(process, args, options) { this.process = process; this.args = args; this.options = options; } },
            CustomExecution: class CustomExecution { constructor(callback) { this.callback = callback; } },
            RelativePattern: class RelativePattern { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
            GlobPattern: String,
            CancellationError: class CancellationError extends Error { constructor() { super('Canceled'); this.name = 'CancellationError'; } },
            TaskScope: { Global: 1, Workspace: 2 },
            ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },

            // Language features
            CallHierarchyItem: class CallHierarchyItem { constructor(kind, name, detail, uri, range, selectionRange) { this.kind = kind; this.name = name; this.detail = detail; this.uri = uri; this.range = range; this.selectionRange = selectionRange; } },
            TypeHierarchyItem: class TypeHierarchyItem { constructor(kind, name, detail, uri, range, selectionRange) { this.kind = kind; this.name = name; this.detail = detail; this.uri = uri; this.range = range; this.selectionRange = selectionRange; } },
            SemanticTokens: class SemanticTokens { constructor(data, resultId) { this.data = data; this.resultId = resultId; } },
            SemanticTokensLegend: class SemanticTokensLegend { constructor(tokenTypes, tokenModifiers) { this.tokenTypes = tokenTypes; this.tokenModifiers = tokenModifiers; } },
            SemanticTokensBuilder: class SemanticTokensBuilder { constructor(legend) { } push(line, char, length, tokenType, tokenModifiers) { } build() { return new Uint32Array(); } },
            ParameterInformation: class ParameterInformation { constructor(label, documentation) { this.label = label; this.documentation = documentation; } },
            SignatureInformation: class SignatureInformation { constructor(label, documentation) { this.label = label; this.documentation = documentation; this.parameters = []; } },
            DocumentLink: class DocumentLink { constructor(range, target) { this.range = range; this.target = target; } },
            Color: class Color { constructor(r, g, b, a) { this.red = r; this.green = g; this.blue = b; this.alpha = a; } },
            ColorInformation: class ColorInformation { constructor(range, color) { this.range = range; this.color = color; } },
            ColorPresentation: class ColorPresentation { constructor(label) { this.label = label; } },
            FoldingRange: class FoldingRange { constructor(start, end, kind) { this.start = start; this.end = end; this.kind = kind; } },
            FoldingRangeKind: { Comment: 1, Imports: 2, Region: 3 },
            InlayHint: class InlayHint {
                constructor(position, label, kind) {
                    this.position = position;
                    this.label = label;
                    this.kind = kind;
                    this.paddingLeft = false;
                    this.paddingRight = false;
                    this.tooltip = undefined;
                }
            },
            InlayHintKind: { Type: 1, Parameter: 2 },
            InlayHintLabelPart: class InlayHintLabelPart {
                constructor(value) {
                    this.value = value;
                    this.tooltip = undefined;
                    this.location = undefined;
                    this.command = undefined;
                }
            },
            LanguageStatusSeverity: {
                Information: 0,
                Warning: 1,
                Error: 2
            },
            LogLevel: {
                Off: 0,
                Trace: 1,
                Debug: 2,
                Info: 3,
                Warning: 4,
                Error: 5,
                Critical: 6
            },
            DocumentDropOrPasteEditKind: class DocumentDropOrPasteEditKind {
                static Empty = new DocumentDropOrPasteEditKind('empty');
                constructor(value) { this.value = value; }
                append(kind) { return new DocumentDropOrPasteEditKind(this.value ? `${this.value}.${kind}` : kind); }
            },
            ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
            ThemeIcon: class ThemeIcon { constructor(id, color) { this.id = id; this.color = color; } static get File() { return new ThemeIcon('file'); } static get Folder() { return new ThemeIcon('folder'); } },
            UIKind: { Desktop: 1, Web: 2 },
            ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },

            TimelineItem: class TimelineItem {
                constructor(label, tooltip, timestamp, iconPath, contextValue) {
                    this.label = label;
                    this.tooltip = tooltip;
                    this.timestamp = timestamp;
                    this.iconPath = iconPath;
                    this.contextValue = contextValue;
                }
            },
            // Missing Enums
            FileChangeType: { Changed: 1, Created: 2, Deleted: 3 },
            CompletionTriggerKind: { Invoke: 0, TriggerCharacter: 1, TriggerForIncompleteCompletions: 2 },
            SignatureHelpTriggerKind: { Invoke: 1, TriggerCharacter: 2, ContentChange: 3 },
            CodeActionTriggerKind: { Invoke: 1, Automatic: 2 },
            SymbolTag: { Deprecated: 1 },
            // Missing Notebook Classes
            NotebookCellKind: { Markup: 1, Code: 2 },
            NotebookRange: class NotebookRange { constructor(start, end) { this.start = start; this.end = end; } },
            NotebookCell: class NotebookCell {
                constructor(kind, document, metadata) {
                    this.kind = kind;
                    this.document = document;
                    this.metadata = metadata || {};
                    this.outputs = [];
                    this.executionSummary = undefined;
                }
            },
            NotebookDocument: class NotebookDocument {
                constructor(uri, notebookType, version, isDirty, isUntitled, isClosed, metadata, cellCount) {
                    this.uri = uri;
                    this.notebookType = notebookType;
                    this.version = version;
                    this.isDirty = isDirty;
                    this.isUntitled = isUntitled;
                    this.isClosed = isClosed;
                    this.metadata = metadata || {};
                    this.cellCount = cellCount || 0;
                }
                cellAt(index) { return undefined; }
                getCells(range) { return []; }
                save() { return Promise.resolve(true); }
            },


            version: '1.96.0',

            // FIX: Add __esModule for ES module compatibility
            __esModule: true
        };

        console.log('[VSCodeAPI] Creating API Proxy');
        console.log('[VSCodeAPI] Available keys:', Object.keys(api));
        console.log('[VSCodeAPI] Has TypeHierarchyItem:', !!api.TypeHierarchyItem);
        console.log('[VSCodeAPI] Has window.tabGroups:', !!api.window.tabGroups);

        // Proxy to debug missing API properties
        // Helper to create deep proxy for better debugging
        const createDeepProxy = (obj, path = 'vscode') => {
            return new Proxy(obj, {
                get: (target, prop) => {
                    const fullPath = `${path}.${String(prop)}`;

                    if (prop in target) {
                        const value = target[prop];
                        // If it's an object (but not a function or class), wrap it in a proxy too
                        if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Function)) {
                            return createDeepProxy(value, fullPath);
                        }
                        return value;
                    }

                    // Special handling for 'then' to avoid Promise confusion
                    if (prop === 'then') return undefined;

                    console.warn(`[VSCodeAPI] Accessing undefined property: ${fullPath}`);
                    return undefined;
                }
            });
        };

        const proxy = createDeepProxy(api, 'vscode');

        // FIX: Add default property for ESM interop (bundled extensions often check .default)
        proxy.default = proxy;

        this._cachedAPI = proxy;
        return proxy;
    }

    /**
     * getExtension implementation
     */
    getWindowAPI() {
        const self = this;

        return {
            showInformationMessage: (message, ...items) => {
                console.log(`[VSCode Window] Info: ${message}`);
                // Send to renderer via IPC
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:show-message', {
                        type: 'info',
                        message,
                        items
                    });
                }
                return Promise.resolve(items[0]);
            },

            showWarningMessage: (message, ...items) => {
                console.log(`[VSCode Window] Warning: ${message}`);
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:show-message', {
                        type: 'warning',
                        message,
                        items
                    });
                }
                return Promise.resolve(items[0]);
            },

            showErrorMessage: (message, ...items) => {
                console.error(`[VSCode Window] Error: ${message}`);
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:show-message', {
                        type: 'error',
                        message,
                        items
                    });
                }
                return Promise.resolve(items[0]);
            },

            // FIX: Mock createTextEditorDecorationType for Jupyter
            createTextEditorDecorationType: (options) => {
                return {
                    key: 'mock-decoration-type-' + Math.random().toString(36),
                    dispose: () => { }
                };
            },

            // FIX: Mock onDidChangeActiveNotebookEditor for Jupyter
            onDidChangeActiveNotebookEditor: (listener) => {
                return { dispose: () => { } };
            },

            // FIX: Mock activeNotebookEditor
            activeNotebookEditor: undefined,

            createStatusBarItem: (alignment = 1, priority = 0) => {
                const item = {
                    text: '',
                    tooltip: '',
                    command: null,
                    alignment,
                    priority,
                    show: function () {
                        self._statusBarItems.push(this);
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            // FIX: Map to DTO to avoid "Failed to serialize arguments" with circular function refs
                            const statusBarsDTO = self._statusBarItems.map(sb => ({
                                text: sb.text,
                                tooltip: sb.tooltip,
                                command: sb.command,
                                alignment: sb.alignment,
                                priority: sb.priority
                            }));
                            global.mainWindow.webContents.send('vscode:status-bar-update', statusBarsDTO);
                        }
                    },
                    hide: function () {
                        const index = self._statusBarItems.indexOf(this);
                        if (index > -1) {
                            self._statusBarItems.splice(index, 1);
                        }
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            // FIX: Map to DTO
                            const statusBarsDTO = self._statusBarItems.map(sb => ({
                                text: sb.text,
                                tooltip: sb.tooltip,
                                command: sb.command,
                                alignment: sb.alignment,
                                priority: sb.priority
                            }));
                            global.mainWindow.webContents.send('vscode:status-bar-update', statusBarsDTO);
                        }
                    },
                    dispose: function () {
                        this.hide();
                    }
                };
                return item;
            },

            createWebviewPanel: (viewType, title, showOptions, options) => {
                console.log('[VSCode Window] createWebviewPanel:', viewType, title);
                const panelId = self._cachedAPI.idGenerator ? self._cachedAPI.idGenerator() : Date.now().toString();

                // Notify Renderer to create a tab
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:create-webview-panel', {
                        panelId,
                        viewType,
                        title,
                        showOptions
                    });
                }

                const webview = {
                    html: '',
                    options: options || {},
                    asWebviewUri: (uri) => self._cachedAPI.Uri.parse(`vscode-resource://${uri.path}`),
                    cspSource: 'vscode-webview-resource:',
                    onDidReceiveMessage: (listener) => {
                        const channel = `vscode:webview-message:${panelId}`;
                        const handler = (event, data) => listener(data);
                        if (global.mainWindow) {
                            const { ipcMain } = require('electron');
                            ipcMain.on(channel, handler);
                        }
                        return {
                            dispose: () => {
                                const { ipcMain } = require('electron');
                                ipcMain.removeListener(channel, handler);
                            }
                        };
                    },
                    postMessage: (message) => {
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:webview-post-message', { viewId: panelId, message });
                        }
                        return Promise.resolve(true);
                    }
                };

                // Proxy HTML
                let currentHtml = '';
                Object.defineProperty(webview, 'html', {
                    get: () => currentHtml,
                    set: (val) => {
                        currentHtml = val;
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            // Reuse unified update channel
                            global.mainWindow.webContents.send('vscode:webview-update', { viewId: panelId, html: val });
                        }
                    }
                });

                return {
                    webview,
                    title,
                    viewType,
                    active: true,
                    visible: true,
                    onDidChangeViewState: (listener) => ({ dispose: () => { } }),
                    onDidDispose: (listener) => ({ dispose: () => { } }),
                    reveal: (column, preserveFocus) => {
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:reveal-webview-panel', { panelId, column, preserveFocus });
                        }
                    },
                    dispose: () => {
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:dispose-webview-panel', { panelId });
                        }
                    }
                };
            },

            registerWebviewPanelSerializer: (viewType, serializer) => {
                console.log('[VSCode Window] registerWebviewPanelSerializer:', viewType);
                return { dispose: () => { } };
            },

            registerCustomEditorProvider: (viewType, provider, options) => {
                console.log('[VSCode Window] registerCustomEditorProvider:', viewType);
                return { dispose: () => { } };
            },

            registerWebviewViewProvider: (viewId, provider, options) => {
                console.log('[VSCode Window] registerWebviewViewProvider:', viewId);

                // Store provider
                if (!self._webviewViewProviders) {
                    self._webviewViewProviders = new Map();
                }
                self._webviewViewProviders.set(viewId, provider);

                // Notify Renderer that a view provider is registered
                // This allows the UI to decide if it should show a button/tab for this view
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:webview-view-registered', { viewId });
                }

                return {
                    dispose: () => {
                        self._webviewViewProviders.delete(viewId);
                    }
                };
            },


            // Internal helper to trigger view resolution
            _resolveWebviewView: (viewId) => {
                console.log('[VSCode Window] _resolveWebviewView called for:', viewId);
                const provider = self._webviewViewProviders ? self._webviewViewProviders.get(viewId) : null;
                if (!provider) {
                    console.warn(`[VSCode Window] No provider found for viewId: ${viewId}`);
                    return;
                }

                // Create WebviewView object
                const webviewView = {
                    viewType: viewId,
                    webview: {
                        html: '',
                        options: {},
                        asWebviewUri: (uri) => {
                            // Basic transform
                            return self._cachedAPI.Uri.parse(`vscode-resource://${uri.path}`);
                        },
                        cspSource: 'vscode-webview-resource:',
                        onDidReceiveMessage: (listener) => {
                            // Listen for messages from Renderer -> Extension
                            const channel = `vscode:webview-message:${viewId}`;
                            const handler = (event, data) => {
                                console.log(`[VSCode Webview ${viewId}] Received message:`, data);
                                listener(data);
                            };
                            if (global.mainWindow) {
                                const { ipcMain } = require('electron');
                                ipcMain.on(channel, handler);
                            }
                            return {
                                dispose: () => {
                                    const { ipcMain } = require('electron');
                                    ipcMain.removeListener(channel, handler);
                                }
                            };
                        },
                        postMessage: (message) => {
                            // Send message Extension -> Renderer
                            console.log(`[VSCode Webview ${viewId}] Posting message:`, message);
                            if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                                global.mainWindow.webContents.send('vscode:webview-post-message', { viewId, message });
                            }
                            return Promise.resolve(true);
                        }
                    },
                    visible: true,
                    onDidDispose: (listener) => ({ dispose: () => { } }),
                    onDidChangeVisibility: (listener) => ({ dispose: () => { } }),
                    show: (preserveFocus) => { }
                };

                // Proxy html setter to send updates to Renderer
                let currentHtml = '';
                Object.defineProperty(webviewView.webview, 'html', {
                    get: () => currentHtml,
                    set: (val) => {
                        currentHtml = val;
                        console.log(`[VSCode Webview ${viewId}] HTML set (length: ${val.length})`);
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            // Send unified event
                            global.mainWindow.webContents.send('vscode:webview-update', { viewId, html: val });
                        }
                    }
                });

                // Call provider
                const context = { state: undefined };
                const token = { isCancellationRequested: false, onCancellationRequested: () => ({ dispose: () => { } }) };

                try {
                    provider.resolveWebviewView(webviewView, context, token);
                    console.log(`[VSCode Window] resolveWebviewView resolved for ${viewId}`);
                } catch (err) {
                    console.error(`[VSCode Window] Error resolving webview view ${viewId}:`, err);
                }
            },

            createLogOutputChannel: (name, options) => {
                console.log(`[VSCode Window] createLogOutputChannel called for: '${name}'`);
                // Use the internal helper method on VSCodeAPI instance
                return self._createOutputChannel(name);
            },

            createOutputChannel: (name) => {
                console.log(`[VSCode Window] createOutputChannel called for: '${name}'`);
                // Use the internal helper method on VSCodeAPI instance
                return self._createOutputChannel(name);
            },

            showQuickPick: (items, options) => {
                console.log('[VSCode Window] showQuickPick:', items);
                // Send to renderer for UI
                return new Promise((resolve) => {
                    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send('vscode:show-quick-pick', { items, options });
                        // TODO: Listen for result from renderer
                        // For now, resolve with first item
                        setTimeout(() => resolve(items[0]), 100);
                    } else {
                        resolve(null);
                    }
                });
            },

            showInputBox: (options) => {
                console.log('[VSCode Window] showInputBox:', options);
                return new Promise((resolve) => {
                    if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                        global.mainWindow.webContents.send('vscode:show-input-box', options);
                        // TODO: Listen for result from renderer
                        setTimeout(() => resolve(''), 100);
                    } else {
                        resolve(null);
                    }
                });
            },

            activeTextEditor: undefined, // Will be set by editor integration
            activeTextEditor: undefined, // Will be set by editor integration
            // FIX: explicitly define activeNotebookEditor as undefined for now, 
            // but ensure it's not null to match some checks, or use a getter if we want to mock one
            get activeNotebookEditor() {
                return undefined;
            },

            // FIX: Add visibleNotebookEditors
            get visibleNotebookEditors() {
                return [];
            },


            visibleTextEditors: [],
            terminals: [], // FIX: Add terminals array
            activeTerminal: undefined,

            // Implement createTerminal
            createTerminal: (nameOrOptions, shellPath, shellArgs) => {
                console.log('[VSCode Window] createTerminal called:', nameOrOptions);
                const self = this;

                let name, shell, args, cwd, env;
                if (typeof nameOrOptions === 'object') {
                    name = nameOrOptions.name;
                    shell = nameOrOptions.shellPath;
                    args = nameOrOptions.shellArgs;
                    cwd = nameOrOptions.cwd;
                    env = nameOrOptions.env;
                } else {
                    name = nameOrOptions;
                    shell = shellPath;
                    args = shellArgs;
                }

                // Generate a unique ID for this terminal
                const termId = `ext-term-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

                // Create the Terminal object that the extension interacts with
                const terminal = {
                    name: name || 'Extension Terminal',
                    processId: Promise.resolve(undefined), // Will be updated if possible
                    creationOptions: typeof nameOrOptions === 'object' ? nameOrOptions : { name, shellPath, shellArgs },
                    exitStatus: undefined,
                    state: { isInteractedWith: false },

                    // Methods
                    sendText: (text, addNewLine = true) => {
                        console.log(`[VSCode Terminal ${name}] sendText:`, text);
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:terminal-send-text', {
                                id: termId,
                                text: text + (addNewLine ? '\n' : '') // Add newline if requested (default true)
                            });
                        }
                    },
                    show: (preserveFocus) => {
                        console.log(`[VSCode Terminal ${name}] show`);
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:terminal-show', { id: termId, preserveFocus });
                        }
                    },
                    hide: () => {
                        console.log(`[VSCode Terminal ${name}] hide`);
                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:terminal-hide', { id: termId });
                        }
                    },
                    dispose: () => {
                        console.log(`[VSCode Terminal ${name}] dispose`);
                        // Remove from terminals list
                        const idx = self.getWindowAPI().terminals.indexOf(terminal);
                        if (idx > -1) self.getWindowAPI().terminals.splice(idx, 1);

                        if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                            global.mainWindow.webContents.send('vscode:terminal-dispose', { id: termId });
                        }
                    }
                };

                // Add to managed list
                self.getWindowAPI().terminals.push(terminal);
                // Set as active (extensions usually expect this, or we track focus)
                self.getWindowAPI().activeTerminal = terminal;

                // Send request to Renderer to create the actual terminal UI
                if (global.mainWindow && !global.mainWindow.isDestroyed()) {
                    global.mainWindow.webContents.send('vscode:create-terminal', {
                        id: termId,
                        name: terminal.name,
                        shellPath: shell,
                        shellArgs: args,
                        cwd: cwd,
                        env: env
                    });
                }

                return terminal;
            },

            // TODO: Implement proper event emitter logic for these if needed
            onDidChangeActiveTextEditor: (listener, thisArgs, disposables) => ({ dispose: () => { } }),
            onDidChangeVisibleTextEditors: (listener, thisArgs, disposables) => ({ dispose: () => { } }),
            onDidChangeTextEditorVisibleRanges: (listener, thisArgs, disposables) => ({ dispose: () => { } }),
            onDidChangeTextEditorSelection: (listener, thisArgs, disposables) => ({ dispose: () => { } }),

            // Terminal events
            onDidOpenTerminal: (listener) => ({ dispose: () => { } }),
            onDidCloseTerminal: (listener) => ({ dispose: () => { } }),
            onDidChangeActiveTerminal: (listener) => ({ dispose: () => { } }),

            // Notebook events
            onDidChangeVisibleNotebookEditors: (listener) => ({ dispose: () => { } }),
            onDidChangeActiveNotebookEditor: (listener) => ({ dispose: () => { } }),
            onDidChangeNotebookEditorSelection: (listener) => ({ dispose: () => { } }),



            withProgress: (options, task) => {
                return task({
                    report: (value) => { }
                });
            },

            tabGroups: {
                get all() {
                    // FIX: Use cached API from VSCodeAPI instance
                    // Access via self which is the VSCodeAPI instance
                    if (!self._cachedAPI) {
                        return []; // Return empty if API not yet initialized
                    }

                    const mockUri = new self._cachedAPI.Uri('file', '', '/mock/path', '', '');
                    const mockDoc = new self._cachedAPI.TextDocument(mockUri, 'typescript', 1, () => '');

                    const mockTab = {
                        input: mockDoc,
                        label: 'Mock Tab',
                        isActive: true,
                        isDirty: false,
                        isPinned: false,
                        isPreview: false
                    };
                    const mockGroup = {
                        isActive: true,
                        viewColumn: 1,
                        activeTab: mockTab,
                        tabs: [mockTab]
                    };
                    return [mockGroup];
                },
                get activeTabGroup() {
                    if (!self._cachedAPI) {
                        return null;
                    }

                    const mockUri = new self._cachedAPI.Uri('file', '', '/mock/path', '', '');
                    const mockDoc = new self._cachedAPI.TextDocument(mockUri, 'typescript', 1, () => '');

                    const mockTab = {
                        input: mockDoc,
                        label: 'Mock Tab',
                        isActive: true,
                        isDirty: false,
                        isPinned: false,
                        isPreview: false
                    };
                    return {
                        isActive: true,
                        viewColumn: 1,
                        activeTab: mockTab,
                        tabs: [mockTab]
                    };
                },
                onDidChangeTabGroups: (listener) => ({ dispose: () => { } }),
                onDidChangeTabs: (listener) => ({ dispose: () => { } }),
                close: () => Promise.resolve(true)
            }
        };
    }

    /**
     * vscode.workspace namespace
     */
    getWorkspaceAPI() {
        const self = this;

        return {
            rootPath: self.extensionHost.workspaceRoot,
            // textDocuments getter is defined below to return actual properties

            onDidSaveTextDocument: (listener) => {
                return { dispose: () => { } };
            },
            onDidCreateFiles: (listener) => {
                return { dispose: () => { } };
            },
            onDidDeleteFiles: (listener) => {
                return { dispose: () => { } };
            },
            onDidRenameFiles: (listener) => {
                return { dispose: () => { } };
            },
            // FIX: Use getter to avoid infinite recursion during API construction
            get workspaceFolders() {
                if (!self.extensionHost.workspaceRoot) return undefined;
                if (!self._cachedAPI) return undefined;

                const uri = self._cachedAPI.Uri.file(self.extensionHost.workspaceRoot);
                return [{
                    uri: uri,
                    name: path.basename(self.extensionHost.workspaceRoot),
                    index: 0
                }];
            },

            getWorkspaceFolder: (uri) => {
                if (!self.extensionHost.workspaceRoot) return undefined;
                if (!self._cachedAPI) return undefined;

                const folderUri = self._cachedAPI.Uri.file(self.extensionHost.workspaceRoot);
                return {
                    uri: folderUri,
                    name: path.basename(self.extensionHost.workspaceRoot),
                    index: 0
                };
            },
            fs: {
                stat: (uri) => Promise.resolve({ type: 1, ctime: 0, mtime: 0, size: 0 }),
                readDirectory: (uri) => Promise.resolve([]),
                readFile: (uri) => Promise.resolve(new Uint8Array()),
                writeFile: (uri, content) => Promise.resolve(),
                delete: (uri) => Promise.resolve(),
                rename: (source, target) => Promise.resolve(),
                copy: (source, target) => Promise.resolve(),
                createDirectory: (uri) => Promise.resolve(),
                isWritableFileSystem: (scheme) => scheme === 'file'
            },
            notebookDocuments: [],
            asRelativePath: (pathOrUri, includeWorkspaceFolder) => {
                // TODO: Implement asRelativePath
                console.warn('[VSCodeAPI] workspace.asRelativePath not implemented');
                if (typeof pathOrUri === 'string') {
                    return pathOrUri;
                }
                return pathOrUri.fsPath;
            },
            isTrusted: true, // FIX: Workspace trust API
            applyEdit: (edit) => {
                console.log('[VSCodeAPI] workspace.applyEdit called');
                return Promise.resolve(true);
            },
            getConfiguration: (section, resource) => {
                console.log(`[VSCodeAPI] getConfiguration called for section: '${section}'`);
                // FIX: Look up configuration defaults from loaded extensions
                const getConfigurationDefault = (key) => {
                    const fullKey = section ? `${section}.${key}` : key;
                    if (self.extensionHost && self.extensionHost.extensions) {
                        for (const ext of self.extensionHost.extensions.values()) {
                            const configContrib = ext.manifest.contributes?.configuration;
                            if (configContrib) {
                                // Configuration can be object (single) or array (multiple scopes)
                                const configs = Array.isArray(configContrib) ? configContrib : [configContrib];
                                for (const config of configs) {
                                    if (config.properties && config.properties[fullKey] && config.properties[fullKey].default !== undefined) {
                                        return config.properties[fullKey].default;
                                    }
                                }
                            }
                        }
                    }
                    return undefined;
                };

                const config = {
                    // Default TypeScript configuration to enable features
                    'typescript.suggest.completeFunctionCalls': true,
                    'typescript.suggest.includeAutomaticOptionalChainCompletions': true,
                    'typescript.suggest.includeCompletionsForImportStatements': true,
                    'typescript.validate.enable': true,
                    'javascript.validate.enable': true,
                    'typescript.updateImportsOnFileMove.enabled': 'always',
                    'typescript.tsserver.log': 'verbose',
                    'typescript.tsserver.trace': 'verbose'
                };

                return {
                    get: (key, defaultValue) => {
                        const fullKey = section ? `${section}.${key}` : key;
                        console.log(`[VSCodeAPI] config.get('${key}') -> fullKey: '${fullKey}'`);
                        if (fullKey in config) {
                            return config[fullKey];
                        }
                        // Try to find default in extensions
                        const extDefault = getConfigurationDefault(key);
                        if (extDefault !== undefined) return extDefault;

                        return defaultValue;
                    },
                    has: (key) => {
                        const fullKey = section ? `${section}.${key}` : key;
                        if (fullKey in config) return true;
                        // Check defaults
                        return getConfigurationDefault(key) !== undefined;
                    },
                    inspect: (key) => {
                        const fullKey = section ? `${section}.${key}` : key;
                        const value = config[fullKey];
                        const defaultValue = getConfigurationDefault(key);
                        return {
                            key: fullKey,
                            defaultValue,
                            globalValue: value,
                            workspaceValue: undefined,
                            workspaceFolderValue: undefined,
                            defaultLanguageValue: undefined,
                            globalLanguageValue: undefined,
                            workspaceLanguageValue: undefined,
                            workspaceFolderLanguageValue: undefined,
                            languageIds: undefined
                        };
                    },
                    update: (key, value) => Promise.resolve()
                };
            },
            onDidChangeConfiguration: self._createEvent(self._onDidChangeConfiguration, 'change'),
            onDidSaveTextDocument: self._createEvent(self._onDidSaveTextDocument, 'save'),
            onDidOpenTextDocument: self._createEvent(self._onDidOpenTextDocument, 'open'),
            onDidCloseTextDocument: self._createEvent(self._onDidCloseTextDocument, 'close'),
            onDidChangeTextDocument: self._createEvent(self._onDidChangeTextDocument, 'change'),

            get textDocuments() {
                // Return the stored TextDocument instances directly
                return Array.from(self._documents.values());
            },
            openTextDocument: (uriOrFileName) => {
                return new Promise((resolve, reject) => {
                    let uri;
                    if (typeof uriOrFileName === 'string') {
                        uri = uriOrFileName.startsWith('/') ? self._cachedAPI.Uri.file(uriOrFileName) : self._cachedAPI.Uri.parse(uriOrFileName);
                    } else {
                        uri = uriOrFileName;
                    }

                    const uriStr = uri.toString();
                    const docInfo = self._documents.get(uriStr);

                    if (docInfo) {
                        const TextDocument = self._cachedAPI.TextDocument;
                        resolve(new TextDocument(uri, docInfo.languageId, docInfo.version, () => docInfo.text));
                    } else {
                        // If not found, try to read from fs?
                        // For now, reject or return a dummy if we can't find it
                        // But wait, if it's on disk we should be able to read it.
                        // Let's try to read it if it's a file URI
                        if (uri.scheme === 'file') {
                            const fs = require('fs');
                            try {
                                const content = fs.readFileSync(uri.fsPath, 'utf8');
                                // We don't know language ID easily without looking it up
                                // But we can guess or default to plaintext
                                const TextDocument = self._cachedAPI.TextDocument;
                                // We don't add it to _documents because it's not "open" in the editor?
                                // Actually openTextDocument usually opens it.
                                resolve(new TextDocument(uri, 'plaintext', 1, () => content));
                            } catch (e) {
                                reject(new Error(`File not found: ${uri.fsPath}`));
                            }
                        } else {
                            reject(new Error(`Document not found: ${uriStr}`));
                        }
                    }
                });
            },
            onDidChangeWorkspaceFolders: self._createEvent(self._onDidChangeWorkspaceFolders, 'change'),

            onDidOpenNotebookDocument: (listener) => ({ dispose: () => { } }),
            onDidCloseNotebookDocument: (listener) => ({ dispose: () => { } }),
            onDidSaveNotebookDocument: (listener) => ({ dispose: () => { } }),
            onDidChangeNotebookDocument: (listener) => ({ dispose: () => { } }),
            // FIX: Implement onDidGrantWorkspaceTrust for TypeScript extension
            onDidGrantWorkspaceTrust: (listener) => {
                // We assume workspace is always trusted for now
                // Immediately fire the listener if needed, or just return disposable
                return { dispose: () => { } };
            },
            notebookDocuments: [],
            createFileSystemWatcher: (pattern) => {
                return {
                    onDidCreate: (listener) => ({ dispose: () => { } }),
                    onDidChange: (listener) => ({ dispose: () => { } }),
                    onDidDelete: (listener) => ({ dispose: () => { } }),
                    dispose: () => { }
                };
            },
            fs: {
                stat: (uri) => Promise.resolve({ type: 1, ctime: Date.now(), mtime: Date.now(), size: 0 }),
                readFile: (uri) => Promise.resolve(new Uint8Array()),
                writeFile: (uri, content) => Promise.resolve(),
                delete: (uri) => Promise.resolve(),
                rename: (source, target) => Promise.resolve(),
                copy: (source, target) => Promise.resolve(),
                readDirectory: (uri) => Promise.resolve([]),
                createDirectory: (uri) => Promise.resolve(),
                isWritableFileSystem: (scheme) => scheme === 'file'
            },
            findFiles: (include, exclude, maxResults, token) => Promise.resolve([]),
            asRelativePath: (pathOrUri, includeWorkspaceFolder) => {
                const pathStr = pathOrUri.toString();
                if (self.extensionHost.workspaceRoot) {
                    return path.relative(self.extensionHost.workspaceRoot, pathStr);
                }
                return pathStr;
            },
            get rootPath() {
                return self.extensionHost.workspaceRoot;
            },

        };
    }
    /**
     * vscode.commands namespace
     */
    getCommandsAPI() {
        const self = this;

        return {
            registerCommand: (command, callback) => {
                return self.extensionHost.registerCommand(command, callback);
            },

            executeCommand: (command, ...args) => {
                return self.extensionHost.executeCommand(command, ...args);
            },

            getCommands: (filterInternal = false) => {
                return Promise.resolve(Array.from(self.extensionHost.commandRegistry.keys()));
            }
        };
    }

    /**
     * vscode.env namespace
     */
    getEnvAPI() {
        const env = {
            appName: 'Peak',
            appRoot: process.cwd(),
            appHost: 'desktop',
            appQuality: 'stable',
            uriScheme: 'vscode',
            isNewAppInstall: false,
            isTelemetryEnabled: false,
            remoteName: '', // FIX: Set to empty string instead of undefined to prevent length check crash
            sessionId: 'mock-session-id',
            machineId: 'mock-machine-id',
            shell: '',
            language: 'en',
            clipboard: {
                readText: () => {
                    const { clipboard } = require('electron');
                    return Promise.resolve(clipboard.readText());
                },
                writeText: (text) => {
                    const { clipboard } = require('electron');
                    clipboard.writeText(text);
                    return Promise.resolve();
                }
            },
            openExternal: (uri) => {
                const { shell } = require('electron');
                return shell.openExternal(uri.toString());
            },
            uiKind: 1,
            createTelemetryLogger: (sender) => {
                // FIX: Create proper EventEmitter for telemetry state changes
                // onDidChangeEnableStates must be an Event (function), not have an event property
                const onDidChangeEmitter = new EventEmitter();

                return {
                    logUsage: (eventName, data) => {
                        // No-op telemetry logging
                    },
                    logError: (eventNameOrError, data) => {
                        // No-op telemetry error logging
                    },
                    dispose: () => {
                        onDidChangeEmitter.removeAllListeners();
                    },
                    // FIX: onDidChangeEnableStates is an Event<TelemetryLogger> - a function that returns Disposable
                    onDidChangeEnableStates: (listener, thisArgs, disposables) => {
                        const handler = (logger) => {
                            if (thisArgs) {
                                listener.call(thisArgs, logger);
                            } else {
                                listener(logger);
                            }
                        };

                        onDidChangeEmitter.on('change', handler);

                        const disposable = {
                            dispose: () => {
                                onDidChangeEmitter.removeListener('change', handler);
                            }
                        };

                        if (disposables) {
                            disposables.push(disposable);
                        }

                        return disposable;
                    }
                };
            },
            onDidChangeLogLevel: (listener) => ({ dispose: () => { } }),
            appHost: 'desktop',
            sessionId: 'mock-session-id',
            machineId: 'mock-machine-id',
            logLevel: 1, // Info
        };

        console.log('[VSCodeAPI] getEnvAPI returning env:', env);


        return new Proxy(env, {
            get: (target, prop) => {
                // console.log(`[VSCodeAPI] Accessing env.${String(prop)}`);
                if (prop in target) {
                    return target[prop];
                }
                console.log(`[VSCodeAPI] Accessing undefined env property: ${String(prop)}`);
                return undefined;
            }
        });
    }

    /**
     * vscode.extensions namespace
     */
    getExtensionsAPI() {
        const self = this;

        return {
            getExtension: (extensionId) => {
                console.log(`[VSCodeAPI] getExtension called for ${extensionId}`);

                // FIX: Mock Microsoft.vscode-markdown to prevent telemetry crash
                if (extensionId === 'Microsoft.vscode-markdown') {
                    console.log('[VSCodeAPI] Mocking Microsoft.vscode-markdown for telemetry');
                    return {
                        id: 'Microsoft.vscode-markdown',
                        packageJSON: {
                            name: 'vscode-markdown',
                            version: '1.0.0',
                            aiKey: 'mock-ai-key-0000000000000000000000000000000000000000000000000000000000000000' // 74 chars? No, just a string.
                        },
                        exports: undefined,
                        extensionPath: '',
                        isActive: true,
                        activate: () => Promise.resolve(),
                    };
                }

                if (typeof self.extensionHost.getExtension !== 'function') {
                    console.error('[VSCodeAPI] CRITICAL: extensionHost.getExtension is not a function!');
                    if (self.extensionHost.extensions) {
                        const ext = self.extensionHost.extensions.get(extensionId);
                        if (ext) return ext;
                    }
                    return {
                        id: extensionId,
                        extensionPath: '',
                        extensionUri: self._cachedAPI.Uri.file(''),
                        isActive: false,
                        packageJSON: {},
                        exports: undefined,
                        activate: () => Promise.resolve()
                    };
                }

                let descriptor = self.extensionHost.getExtension(extensionId);

                // FIX: Alias ms-python.python to vscode.python if missing
                if (!descriptor && extensionId === 'ms-python.python') {
                    console.log('[VSCodeAPI] Aliasing ms-python.python to vscode.python');
                    descriptor = self.extensionHost.getExtension('vscode.python');
                }

                if (!descriptor) {
                    console.warn(`[VSCodeAPI] Extension not found: ${extensionId}. Available:`, self.extensionHost.getExtensions().map(e => e.id));
                    // Return dummy to prevent crash
                    return {
                        id: extensionId,
                        extensionPath: '',
                        extensionUri: self._cachedAPI.Uri.file(''),
                        isActive: false,
                        packageJSON: {},
                        exports: undefined,
                        activate: () => Promise.resolve()
                    };
                }

                // FIX: Mock Python extension exports if they don't support Jupyter
                if (descriptor.id === 'vscode.python' || descriptor.id === 'ms-python.python') {
                    if (!descriptor.exports) descriptor.exports = {};

                    // Helper: Ensure packageJSON exists for version checks
                    if (!descriptor.packageJSON) descriptor.packageJSON = {};
                    if (!descriptor.packageJSON.version) descriptor.packageJSON.version = '2023.0.0';

                    if (!descriptor.exports.jupyter) {
                        console.log('[VSCodeAPI] Injecting mock Jupyter API into Python extension exports');
                        descriptor.exports.jupyter = {
                            registerHooks: () => ({ dispose: () => { } })
                        };
                    }

                    if (!descriptor.exports.settings) {
                        descriptor.exports.settings = {
                            getExecutionDetails: () => ({ execCommand: ['python3'] })
                        };
                    }

                    // Always ensure environments mocking, merging with existing if present
                    console.log('[VSCodeAPI] Injecting/Updating mock Environments API');
                    descriptor.exports.environments = {
                        ...(descriptor.exports.environments || {}),
                        known: descriptor.exports.environments?.known || [],
                        resolveEnvironment: descriptor.exports.environments?.resolveEnvironment || (() => undefined),
                        onDidChangeEnvironments: descriptor.exports.environments?.onDidChangeEnvironments || (() => ({ dispose: () => { } })),
                        onDidEnvironmentVariablesChange: descriptor.exports.environments?.onDidEnvironmentVariablesChange || (() => ({ dispose: () => { } })),
                        getEnvironmentVariables: descriptor.exports.environments?.getEnvironmentVariables || (() => Promise.resolve(undefined)),
                    };
                }

                console.log(`[VSCodeAPI] getExtension: Found '${extensionId}'`);

                const result = {
                    id: descriptor.id,
                    extensionPath: descriptor.extensionPath,
                    extensionUri: self._cachedAPI.Uri.file(descriptor.extensionPath),
                    isActive: descriptor.isActive,
                    packageJSON: descriptor.packageJSON || descriptor.manifest || {},
                    exports: descriptor.exports,
                    activate: () => self.extensionHost.activateExtension(descriptor.id)
                };

                // console.log(`[VSCodeAPI] getExtension returning for ${extensionId}:`, result);
                return result;
            },

            get all() {
                return self.extensionHost.getExtensions().map(d => ({
                    id: d.id,
                    extensionPath: d.extensionPath,
                    extensionUri: self._cachedAPI.Uri.file(d.extensionPath),
                    isActive: d.isActive,
                    packageJSON: d.manifest,
                    exports: d.exports,
                    activate: () => self.extensionHost.activateExtension(d.id)
                }));
            },
            get allAcrossExtensionHosts() {
                return this.all;
            },
            onDidChange: self._createEvent(self._onDidChangeExtensions, 'change'),

            onDidOpenTextDocument: (listener) => {
                console.log('[VSCodeAPI] onDidOpenTextDocument subscription added');
                const handler = (doc) => listener(doc);
                self._onDidOpenTextDocument.on('open', handler);
                // Replay for existing documents
                self._documents.forEach(doc => {
                    console.log('[VSCodeAPI] Replaying onDidOpenTextDocument for:', doc.uri.toString());
                    listener(doc);
                });
                return {
                    dispose: () => {
                        self._onDidOpenTextDocument.removeListener('open', handler);
                    }
                };
            },
        };
    }

    /**
     * vscode.languages namespace (basic implementation)
     */
    getLanguagesAPI() {
        const self = this;

        return {
            match: (selector, document) => {
                return 10; // Always match for now
            },
            registerCompletionItemProvider: (selector, provider, ...triggerCharacters) => {
                console.log('[VSCode Languages] registerCompletionItemProvider:', selector);

                const registration = {
                    selector,
                    provider,
                    triggerCharacters,
                    extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown'
                };

                // Extract ALL languages from selector and register for each
                const languages = self._getAllLanguagesFromSelector(selector);
                console.log(`[VSCode Languages] registerCompletionItemProvider: Extracted languages: ${JSON.stringify(languages)} from selector: ${JSON.stringify(selector)}`);

                if (languages.length === 0) {
                    console.warn('[VSCode Languages] Invalid selector for completion provider:', selector);
                    return { dispose: () => { } };
                }

                // Register provider for ALL languages in the selector
                for (const languageId of languages) {
                    if (!self._languageProviders.completion.has(languageId)) {
                        self._languageProviders.completion.set(languageId, []);
                    }
                    self._languageProviders.completion.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.completion.get(languageId);
                            if (providers) {
                                const index = providers.indexOf(registration);
                                if (index > -1) {
                                    providers.splice(index, 1);
                                }
                            }
                        }
                    }
                };
            },
            // FIX: Add registerInlineCompletionItemProvider
            registerInlineCompletionItemProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerInlineCompletionItemProvider:', selector);
                // We don't implement inline completions yet, but we must return a disposable
                return { dispose: () => { } };
            },
            registerHoverProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerHoverProvider:', selector);

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                // Extract ALL languages from selector and register for each
                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) {
                    return { dispose: () => { } };
                }

                // Register provider for ALL languages in the selector
                for (const languageId of languages) {
                    if (!self._languageProviders.hover.has(languageId)) {
                        self._languageProviders.hover.set(languageId, []);
                    }
                    self._languageProviders.hover.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.hover.get(languageId);
                            if (providers) {
                                const index = providers.indexOf(registration);
                                if (index > -1) providers.splice(index, 1);
                            }
                        }
                    }
                };
            },
            registerDefinitionProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDefinitionProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) {
                    return { dispose: () => { } };
                }

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.definition.has(languageId)) {
                        self._languageProviders.definition.set(languageId, []);
                    }
                    self._languageProviders.definition.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.definition.get(languageId);
                            if (providers) {
                                const index = providers.indexOf(registration);
                                if (index > -1) providers.splice(index, 1);
                            }
                        }
                    }
                };
            },
            registerSignatureHelpProvider: (selector, provider, ...triggerCharacters) => {
                console.log('[VSCode Languages] registerSignatureHelpProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) {
                    return { dispose: () => { } };
                }

                const registration = { selector, provider, triggerCharacters, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.signature.has(languageId)) {
                        self._languageProviders.signature.set(languageId, []);
                    }
                    self._languageProviders.signature.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.signature.get(languageId);
                            if (providers) {
                                const index = providers.indexOf(registration);
                                if (index > -1) providers.splice(index, 1);
                            }
                        }
                    }
                };
            },
            registerDocumentSymbolProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDocumentSymbolProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) {
                    return { dispose: () => { } };
                }

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.documentSymbol.has(languageId)) {
                        self._languageProviders.documentSymbol.set(languageId, []);
                    }
                    self._languageProviders.documentSymbol.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.documentSymbol.get(languageId);
                            if (providers) {
                                const index = providers.indexOf(registration);
                                if (index > -1) providers.splice(index, 1);
                            }
                        }
                    }
                };
            },
            registerWorkspaceSymbolProvider: (provider) => {
                console.log('[VSCode Languages] registerWorkspaceSymbolProvider');

                const registration = { provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };
                self._languageProviders.workspaceSymbol.push(registration);

                return {
                    dispose: () => {
                        const index = self._languageProviders.workspaceSymbol.indexOf(registration);
                        if (index > -1) {
                            self._languageProviders.workspaceSymbol.splice(index, 1);
                        }
                    }
                };
            },
            registerDocumentFormattingEditProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDocumentFormattingEditProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.formatting.has(languageId)) {
                        self._languageProviders.formatting.set(languageId, []);
                    }
                    self._languageProviders.formatting.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.formatting.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerDocumentRangeFormattingEditProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDocumentRangeFormattingEditProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.rangeFormatting.has(languageId)) {
                        self._languageProviders.rangeFormatting.set(languageId, []);
                    }
                    self._languageProviders.rangeFormatting.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.rangeFormatting.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerOnTypeFormattingEditProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerOnTypeFormattingEditProvider:', selector);
                return { dispose: () => { } };
            },
            registerRenameProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerRenameProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.rename.has(languageId)) {
                        self._languageProviders.rename.set(languageId, []);
                    }
                    self._languageProviders.rename.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.rename.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerReferenceProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerReferenceProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.reference.has(languageId)) {
                        self._languageProviders.reference.set(languageId, []);
                    }
                    self._languageProviders.reference.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.reference.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerDocumentHighlightProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDocumentHighlightProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.documentHighlight.has(languageId)) {
                        self._languageProviders.documentHighlight.set(languageId, []);
                    }
                    self._languageProviders.documentHighlight.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.documentHighlight.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerLinkedEditingRangeProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerLinkedEditingRangeProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.linkedEditingRange.has(languageId)) {
                        self._languageProviders.linkedEditingRange.set(languageId, []);
                    }
                    self._languageProviders.linkedEditingRange.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.linkedEditingRange.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerDocumentSemanticTokensProvider: (selector, provider, legend) => {
                console.log('[VSCode Languages] registerDocumentSemanticTokensProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, legend, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.documentSemanticTokens.has(languageId)) {
                        self._languageProviders.documentSemanticTokens.set(languageId, []);
                    }
                    self._languageProviders.documentSemanticTokens.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.documentSemanticTokens.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerDocumentDropEditProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDocumentDropEditProvider:', selector);
                return { dispose: () => { } };
            },
            registerDocumentPasteEditProvider: (selector, provider, metadata) => {
                console.log('[VSCode Languages] registerDocumentPasteEditProvider:', selector);
                return { dispose: () => { } };
            },
            registerFoldingRangeProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerFoldingRangeProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.fold.has(languageId)) {
                        self._languageProviders.fold.set(languageId, []);
                    }
                    self._languageProviders.fold.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.fold.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerColorProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerColorProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.color.has(languageId)) {
                        self._languageProviders.color.set(languageId, []);
                    }
                    self._languageProviders.color.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.color.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerSelectionRangeProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerSelectionRangeProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.selectionRange.has(languageId)) {
                        self._languageProviders.selectionRange.set(languageId, []);
                    }
                    self._languageProviders.selectionRange.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.selectionRange.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            getDiagnostics: (resource) => {
                // Return all diagnostics or diagnostics for a specific resource
                const allDiagnostics = [];
                // TODO: Aggregate diagnostics from all collections
                return allDiagnostics;
            },
            registerTypeDefinitionProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerTypeDefinitionProvider:', selector);
                return { dispose: () => { } };
            },
            registerDocumentRangeSemanticTokensProvider: (selector, provider, legend) => {
                console.log('[VSCode Languages] registerDocumentRangeSemanticTokensProvider:', selector);
                return { dispose: () => { } };
            },
            createLanguageStatusItem: (id, selector) => {
                console.log('[VSCode Languages] createLanguageStatusItem:', id, selector);
                return {
                    id,
                    selector,
                    name: id,
                    severity: 0, // Information
                    text: '',
                    detail: '',
                    busy: false,
                    command: undefined,
                    dispose: () => { }
                };
            },
            registerCodeActionsProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerCodeActionsProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.codeAction.has(languageId)) {
                        self._languageProviders.codeAction.set(languageId, []);
                    }
                    self._languageProviders.codeAction.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.codeAction.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            registerCodeLensProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerCodeLensProvider:', selector);
                return { dispose: () => { } };
            },
            registerDocumentLinkProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerDocumentLinkProvider:', selector);

                const languages = self._getAllLanguagesFromSelector(selector);
                if (languages.length === 0) return { dispose: () => { } };

                const registration = { selector, provider, extensionId: self.extensionHost.currentActivatingExtension?.id || 'unknown' };

                for (const languageId of languages) {
                    if (!self._languageProviders.documentLink.has(languageId)) {
                        self._languageProviders.documentLink.set(languageId, []);
                    }
                    self._languageProviders.documentLink.get(languageId).push(registration);
                }

                return {
                    dispose: () => {
                        for (const languageId of languages) {
                            const providers = self._languageProviders.documentLink.get(languageId);
                            if (providers) {
                                const idx = providers.indexOf(registration);
                                if (idx > -1) providers.splice(idx, 1);
                            }
                        }
                    }
                };
            },
            setLanguageConfiguration: (language, configuration) => {
                console.log('[VSCode Languages] setLanguageConfiguration:', language);
                return { dispose: () => { } };
            },
            getLanguages: () => {
                // Return a promise that resolves to an array of language identifiers
                // This is used by the Jupyter extension and likely others
                return Promise.resolve(['python', 'javascript', 'json', 'typescript', 'markdown']);
            },
            createDiagnosticCollection: (name) => {
                const diagnostics = new Map();
                return {
                    name,
                    set: (uri, diags) => {
                        // console.log('[Diagnostics] Set:', uri, diags);
                        diagnostics.set(uri.toString(), diags);
                    },
                    delete: (uri) => {
                        diagnostics.delete(uri.toString());
                    },
                    clear: () => {
                        diagnostics.clear();
                    },
                    forEach: (callback) => {
                        diagnostics.forEach((diags, uri) => callback(self._cachedAPI.Uri.parse(uri), diags, this));
                    },
                    get: (uri) => {
                        return diagnostics.get(uri.toString()) || [];
                    },
                    has: (uri) => {
                        return diagnostics.has(uri.toString());
                    },
                    dispose: () => { diagnostics.clear(); }
                };
            },
            match: (selector, document) => {
                // Simple match implementation
                if (selector === '*') return 10;
                if (typeof selector === 'string') return selector === document.languageId ? 10 : 0;
                if (Array.isArray(selector)) {
                    return selector.some(s => self.getLanguagesAPI().match(s, document) > 0) ? 10 : 0;
                }
                if (typeof selector === 'object') {
                    if (selector.language && selector.language !== document.languageId) return 0;
                    if (selector.scheme && selector.scheme !== document.uri.scheme) return 0;
                    if (selector.pattern) {
                        // TODO: Implement glob matching if needed
                        return 5;
                    }
                    return 10;
                }
                return 0;
            },
            registerImplementationProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerImplementationProvider:', selector);
                return { dispose: () => { } };
            },
            registerInlayHintsProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerInlayHintsProvider:', selector);
                return { dispose: () => { } };
            },
            registerCallHierarchyProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerCallHierarchyProvider:', selector);
                return { dispose: () => { } };
            },
            registerMultiDocumentHighlightProvider: (selector, provider) => {
                console.log('[VSCode Languages] registerMultiDocumentHighlightProvider:', selector);
                return { dispose: () => { } };
            }
        };
    }

    getVSCodeAPI() {
        // Ensure cached API is populated
        if (!this._cachedAPI) {
            this.getAPI();
        }

        // Create the API object by extending the base API
        const api = {
            ...this._cachedAPI,
            // Override specific namespaces if needed for the proxy
            tasks: {
                registerTaskProvider: (type, provider) => ({ dispose: () => { } }),
                fetchTasks: () => Promise.resolve([]),
                executeTask: () => Promise.resolve(),
                onDidStartTask: () => ({ dispose: () => { } }),
                onDidEndTask: () => ({ dispose: () => { } }),
                onDidStartTaskProcess: () => ({ dispose: () => { } }),
                onDidEndTaskProcess: () => ({ dispose: () => { } })
            },
            env: this.getEnvAPI(),
            commands: this.getCommandsAPI(),
            window: this.getWindowAPI(),
            workspace: this.getWorkspaceAPI(),
            languages: this.getLanguagesAPI(),
            extensions: this.getExtensionsAPI(),
            // No need to manually map individual classes anymore as they are spread from _cachedAPI
            ThemeIcon: this._cachedAPI.ThemeIcon,
            SnippetString: this._cachedAPI.SnippetString,
            MarkdownString: this._cachedAPI.MarkdownString,
            ParameterInformation: this._cachedAPI.ParameterInformation,
            SignatureInformation: this._cachedAPI.SignatureInformation,
            DocumentLink: this._cachedAPI.DocumentLink,
            CodeActionKind: this._cachedAPI.CodeActionKind,
            Diagnostic: this._cachedAPI.Diagnostic,
            DiagnosticSeverity: this._cachedAPI.DiagnosticSeverity,
            DiagnosticTag: this._cachedAPI.DiagnosticTag,
            CompletionItemTag: this._cachedAPI.CompletionItemTag,
            CompletionList: this._cachedAPI.CompletionList,
            SelectionRange: this._cachedAPI.SelectionRange,
            ExtensionKind: this._cachedAPI.ExtensionKind,
            ExtensionMode: this._cachedAPI.ExtensionMode,
            TextEdit: this._cachedAPI.TextEdit,
            WorkspaceEdit: this._cachedAPI.WorkspaceEdit,
            SymbolKind: this._cachedAPI.SymbolKind,
            SymbolInformation: this._cachedAPI.SymbolInformation,
            DocumentSymbol: this._cachedAPI.DocumentSymbol,
            CompletionItem: this._cachedAPI.CompletionItem,
            CompletionItemKind: this._cachedAPI.CompletionItemKind,
            CompletionItemTag: this._cachedAPI.CompletionItemTag,
            CompletionList: this._cachedAPI.CompletionList,
            Hover: this._cachedAPI.Hover,
            CancellationTokenSource: this._cachedAPI.CancellationTokenSource,
            EventEmitter: this._cachedAPI.EventEmitter,
            Disposable: this._cachedAPI.Disposable,
            Color: this._cachedAPI.Color,
            ColorInformation: this._cachedAPI.ColorInformation,
            ColorPresentation: this._cachedAPI.ColorPresentation,
            SelectionRange: this._cachedAPI.SelectionRange,
            FoldingRange: this._cachedAPI.FoldingRange,
            FoldingRangeKind: this._cachedAPI.FoldingRangeKind,
            ProgressLocation: this._cachedAPI.ProgressLocation,
            ViewColumn: this._cachedAPI.ViewColumn,
            TreeItem: this._cachedAPI.TreeItem,
            TreeItemCollapsibleState: this._cachedAPI.TreeItemCollapsibleState,
            FileType: this._cachedAPI.FileType,
            UIKind: this._cachedAPI.UIKind,
            LogLevel: this._cachedAPI.LogLevel,
            ExtensionKind: this._cachedAPI.ExtensionKind,
            ExtensionMode: this._cachedAPI.ExtensionMode,
            TaskRevealKind: { Always: 1, Silent: 2, Never: 3 },
            TaskPanelKind: { Shared: 1, Dedicated: 2, New: 3 },
        };

        // DEBUG PROXY: Trace all property accesses on the main API object
        return new Proxy(api, {
            get: (target, prop) => {
                // Filter out common/noisy properties if needed, but for now log everything relevant
                if (typeof prop === 'string' && !['then', 'toString', 'toJSON'].includes(prop)) {
                    // console.log(`[VSCodeAPI Proxy] Accessing vscode.${prop}`);
                }

                const value = target[prop];

                // If accessing a namespace (like workspace, languages), proxy that too?
                // For now, let's just log top-level access. 
                // Actually, let's try to catch the 'has' access.
                // If 'has' is being read from undefined, it means some property X was accessed, returned undefined, and then X.has was called.
                // So we need to find which property returned undefined recently.

                if (value === undefined) {
                    console.warn(`[VSCodeAPI Proxy] WARNING: Accessing undefined property vscode.${String(prop)}`);
                }

                return value;
            }
        });
    }

    getTasksAPI() {
        return {
            registerTaskProvider: (type, provider) => {
                console.log('[VSCode Tasks] registerTaskProvider:', type);
                return { dispose: () => { } };
            },
            fetchTasks: (filter) => Promise.resolve([]),
            executeTask: (task) => Promise.resolve(undefined),
            onDidStartTask: (listener) => ({ dispose: () => { } }),
            onDidEndTask: (listener) => ({ dispose: () => { } }),
            onDidStartTaskProcess: (listener) => ({ dispose: () => { } }),
            onDidEndTaskProcess: (listener) => ({ dispose: () => { } }),
            taskExecutions: []
        };
    }

    /**
     * Handle document change from ExtensionHost
     */
    /**
     * Handle document change from ExtensionHost
     */
    handleDidChangeTextDocument(uri, changes, newText) {
        const uriStr = uri.toString();
        // docInfo is now the TextDocument instance itself
        const document = this._documents.get(uriStr);
        if (!document) {
            console.warn(`[VSCodeAPI] Document not found for change: ${uriStr}`);
            return;
        }

        // Ensure API is initialized to access classes
        if (!this._cachedAPI) {
            this.getAPI();
        }

        const oldText = document.getText();

        // Update stored state in the existing document instance
        document.version = (document.version || 0) + 1;
        document._getText = () => newText; // Update the internal getText closure

        // Synthesize a full-text replacement change since we only get the new text
        // Calculate correct end position from old text
        const lines = oldText.split(/\r\n|\r|\n/);
        const endLine = Math.max(0, lines.length - 1);
        const endCharacter = lines[lines.length - 1].length;

        const fullRange = new this._cachedAPI.Range(
            new this._cachedAPI.Position(0, 0),
            new this._cachedAPI.Position(endLine, endCharacter)
        );

        const contentChanges = [{
            range: fullRange,
            rangeOffset: 0,
            rangeLength: oldText.length,
            text: newText
        }];

        const event = {
            document, // Pass the SAME document instance
            contentChanges
        };

        console.log(`[VSCodeAPI] Emitting onDidChangeTextDocument for ${uriStr}`, {
            documentUri: document.uri ? document.uri.toString() : 'undefined',
            contentChangesLength: contentChanges.length,
            documentHasGetText: typeof document.getText === 'function',
            documentHasUri: !!document.uri
        });

        this.emitDocumentChange(event);
    }

    handleWorkspaceFoldersChange() {
        console.log('[VSCodeAPI] handleWorkspaceFoldersChange called');
        const event = {
            added: this.getWorkspaceAPI().workspaceFolders || [],
            removed: []
        };

        try {
            this._onDidChangeWorkspaceFolders.emit('change', event);
        } catch (error) {
            console.error('[VSCodeAPI] Error in onDidChangeWorkspaceFolders handler:', error);
        }
    }

    emitDocumentChange(event) {
        try {
            this._onDidChangeTextDocument.emit('change', event);
        } catch (error) {
            console.error('[VSCodeAPI] Error in onDidChangeTextDocument handler:', error);
            if (error.stack) {
                console.error('[VSCodeAPI] Stack trace:', error.stack);
            }
        }
    }

    /**
     * Handle document open from ExtensionHost
     */
    handleDidOpenTextDocument(document) {
        const uri = document.uri.toString();
        const isAlreadyOpen = this._documents.has(uri);

        console.log('[VSCodeAPI] handleDidOpenTextDocument called:', {
            uri,
            languageId: document.languageId,
            isAlreadyOpen,
            hasListeners: this._onDidOpenTextDocument.listenerCount ? this._onDidOpenTextDocument.listenerCount('open') : 'unknown'
        });

        if (isAlreadyOpen) {
            // CRITICAL FIX: Preserve object identity!
            // Extensions (like TypeScript) use the TextDocument instance as a key in WeakMaps.
            // If we replace the instance, the extension loses its state associated with the document.
            const existingDoc = this._documents.get(uri);
            existingDoc.version = document.version;
            existingDoc.languageId = document.languageId;
            existingDoc._getText = document._getText;
            console.log('[VSCodeAPI] Updated existing TextDocument instance:', uri);
        } else {
            // Store the new TextDocument instance
            this._documents.set(uri, document);
            console.log('[VSCodeAPI] Emitting onDidOpenTextDocument event for:', uri);
            this.emitDocumentOpen(document);
        }
    }

    /**
     * Handle document close from ExtensionHost
     */
    handleDidCloseTextDocument(document) {
        const uri = document.uri.toString();
        const docInfo = this._documents.get(uri);

        // Reconstruct document with all necessary properties for extensions
        const fullDocument = {
            uri: document.uri,
            fileName: document.fileName || document.uri.fsPath,
            isUntitled: document.isUntitled || false,
            languageId: docInfo ? docInfo.languageId : (document.languageId || 'plaintext'),
            version: docInfo ? docInfo.version : (document.version || 0),
            isClosed: true,
            isDirty: false,
            eol: 1, // EndOfLine.LF
            lineCount: 0,
            getText: () => '',
            lineAt: () => ({ text: '', range: null }),
            positionAt: () => new this.Position(0, 0),
            offsetAt: () => 0,
            getWordRangeAtPosition: () => null,
            validateRange: (range) => range,
            validatePosition: (pos) => pos,
            save: () => Promise.resolve(true),
            // Add closeResource method that TypeScript extension expects
            closeResource: function () { }
        };

        // Log for debugging
        console.log('[VSCodeAPI] handleDidCloseTextDocument - closeResource type:', typeof fullDocument.closeResource);

        this._documents.delete(uri);
        this.emitDocumentClose(fullDocument);
    }

    /**
     * Get language ID for a URI
     */
    getLanguageId(uri) {
        const doc = this._documents.get(uri.toString());
        return doc ? doc.languageId : null;
    }

    /**
     * Emit events to extensions
     */
    emitConfigurationChange() {
        this._onDidChangeConfiguration.emit('change', {});
    }

    emitDocumentSave(document) {
        this._onDidSaveTextDocument.emit('save', document);
    }

    emitDocumentOpen(document) {
        const listenerCount = this._onDidOpenTextDocument.listenerCount ? this._onDidOpenTextDocument.listenerCount('open') : 'unknown';
        console.log(`[VSCodeAPI] emitDocumentOpen: Calling ${listenerCount} listeners for ${document.uri.toString()}`);

        try {
            this._onDidOpenTextDocument.emit('open', document);
            console.log('[VSCodeAPI] emitDocumentOpen: Event emitted successfully');
        } catch (error) {
            // Catch errors from extension handlers to prevent crashes
            console.error('[VSCodeAPI] Error in onDidOpenTextDocument handler:', error.message);
            console.error('[VSCodeAPI] Full error:', error);
        }
    }

    emitDocumentClose(document) {
        try {
            this._onDidCloseTextDocument.emit('close', document);
        } catch (error) {
            // Catch errors from extension handlers to prevent crashes
            console.error('[VSCodeAPI] Error in onDidCloseTextDocument handler:', error.message);
        }
    }

    /**
     * Emit extension changes event
     */
    emitExtensionsChange() {
        if (this._onDidChangeExtensions) {
            this._onDidChangeExtensions.emit('change');
        }
    }

    resolveWebviewView(viewId) {
        if (this._cachedAPI && this._cachedAPI.window && this._cachedAPI.window._resolveWebviewView) {
            this._cachedAPI.window._resolveWebviewView(viewId);
        } else {
            console.warn(`[VSCodeAPI] Cannot resolve webview view ${viewId}, API not ready or missing method.`);
        }
    }

    /**
     * Get all providers of a specific type for a language
     * @param {string} type - Provider type (e.g., 'completion', 'hover')
     * @param {string} languageId - Language ID (e.g., 'typescript', 'python')
     * @returns {Array} Matching providers
     */
    getProvidersForLanguage(type, languageId) {
        if (!this._languageProviders[type]) {
            return [];
        }

        // Special case for workspace symbol providers (no language filter)
        if (type === 'workspaceSymbol') {
            return this._languageProviders[type];
        }

        // Get providers from Map
        const providers = this._languageProviders[type].get(languageId);
        return providers || [];
    }

    /**
     * Helper to  extract language ID from selector
     * @param {string|object} selector - Document selector
     * @returns {string|null} Language ID
     */
    /**
     * Helper to extract ALL language IDs from selector (for multi-language registration)
     * @param {string|object|Array} selector - Document selector
     * @returns {Array<string>} Array of language IDs
     */
    _getAllLanguagesFromSelector(selector) {
        if (!selector) return [];

        if (typeof selector === 'string') {
            return [selector];
        }

        if (Array.isArray(selector)) {
            //Flatten and collect all languages from array
            const languages = [];
            for (const item of selector) {
                languages.push(...this._getAllLanguagesFromSelector(item));
            }
            return [...new Set(languages)]; // Remove duplicates
        }

        if (typeof selector === 'object') {
            if (selector.language) {
                return [selector.language];
            }
            return [];
        }

        return [];
    }



    /**
     * Helper to extract language ID from selector
     * @param {string|object|Array} selector - Document selector
     * @returns {string|null} Language ID
     */
    _getLanguageFromSelector(selector) {
        if (!selector) return null;

        if (typeof selector === 'string') {
            return selector;
        }

        if (Array.isArray(selector)) {
            // Return first valid language found in array
            for (const item of selector) {
                const lang = this._getLanguageFromSelector(item);
                if (lang) return lang;
            }
            return null;
        }

        if (typeof selector === 'object') {
            if (selector.language) {
                return selector.language;
            }
            // Handle scheme/pattern only selectors (often used for all files or specific patterns)
            // If no language is specified but it's a valid selector, we might return '*' or null
            // For now, if it has a pattern but no language, we can't easily map it to a languageId
            // unless we check the file extension against the pattern.
            return null;
        }

        return null;
    }
}

module.exports = VSCodeAPI;
