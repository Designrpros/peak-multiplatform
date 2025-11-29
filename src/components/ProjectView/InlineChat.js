// src/components/ProjectView/InlineChat.js
const { EditorView, WidgetType, Decoration, keymap } = require('@codemirror/view');
const { StateField, StateEffect } = require('@codemirror/state');
const { ipcRenderer } = require('electron');

// Effects to toggle the widget
const toggleChatEffect = StateEffect.define();
const closeChatEffect = StateEffect.define();

class InlineChatWidget extends WidgetType {
    constructor(view, pos) {
        super();
        this.view = view;
        this.pos = pos;
    }

    toDOM() {
        const container = document.createElement('div');
        container.className = 'inline-chat-widget';
        container.style.cssText = `
            position: absolute;
            z-index: 1000;
            background: var(--window-background-color);
            border: 1px solid var(--peak-accent);
            border-radius: 8px;
            padding: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            width: 400px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        `;

        const input = document.createElement('textarea');
        input.placeholder = "Ask AI to edit code... (Cmd+Enter to run)";
        input.style.cssText = `
            width: 100%;
            min-height: 40px;
            background: var(--control-background-color);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            color: var(--peak-primary);
            padding: 8px;
            font-family: inherit;
            resize: vertical;
            outline: none;
        `;
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                this.submit(input.value);
            }
            if (e.key === 'Escape') {
                this.close();
            }
        });

        const toolbar = document.createElement('div');
        toolbar.style.cssText = "display: flex; justify-content: flex-end; gap: 8px;";

        const btnSubmit = document.createElement('button');
        btnSubmit.textContent = "Generate";
        btnSubmit.className = "msg-action-btn"; // Reuse existing class
        btnSubmit.style.background = "var(--peak-accent)";
        btnSubmit.style.color = "white";
        btnSubmit.onclick = () => this.submit(input.value);

        const btnClose = document.createElement('button');
        btnClose.textContent = "Cancel";
        btnClose.className = "msg-action-btn";
        btnClose.onclick = () => this.close();

        toolbar.appendChild(btnClose);
        toolbar.appendChild(btnSubmit);
        container.appendChild(input);
        container.appendChild(toolbar);

        // Auto-focus
        setTimeout(() => input.focus(), 50);

        return container;
    }

    submit(prompt) {
        if (!prompt.trim()) return;

        // Get context
        const state = this.view.state;
        const selection = state.selection.main;
        const selectedText = state.sliceDoc(selection.from, selection.to);
        const fullText = state.doc.toString();
        const context = {
            fileContent: fullText,
            selection: selectedText,
            selectionRange: { from: selection.from, to: selection.to },
            filePath: window.currentFilePath
        };

        // Dispatch event for the main ProjectView to handle (it has access to diff view)
        window.dispatchEvent(new CustomEvent('peak-inline-chat-submit', {
            detail: { prompt, context }
        }));

        this.close();
    }

    close() {
        this.view.dispatch({
            effects: closeChatEffect.of(null)
        });
        this.view.focus();
    }
}

// State Field to manage the decoration
const inlineChatField = StateField.define({
    create() { return Decoration.none; },
    update(decorations, tr) {
        decorations = decorations.map(tr.changes);
        for (let e of tr.effects) {
            if (e.is(toggleChatEffect)) {
                const { pos, view } = e.value;
                // Create a widget decoration at the cursor
                const widget = Decoration.widget({
                    widget: new InlineChatWidget(view, pos),
                    side: 1,
                    block: true
                });
                return Decoration.set([widget.range(pos)]);
            } else if (e.is(closeChatEffect)) {
                return Decoration.none;
            }
        }
        return decorations;
    },
    provide: f => EditorView.decorations.from(f)
});

// Keymap
const inlineChatKeymap = keymap.of([
    {
        key: "Mod-k",
        run: (view) => {
            const pos = view.state.selection.main.head;
            view.dispatch({
                effects: toggleChatEffect.of({ pos, view })
            });
            return true;
        }
    }
]);

module.exports = {
    inlineChatField,
    inlineChatKeymap
};
