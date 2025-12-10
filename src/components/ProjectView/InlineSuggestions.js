// src/components/ProjectView/InlineSuggestions.js
const { EditorView, WidgetType, Decoration, keymap, ViewPlugin } = require('@codemirror/view');
const { StateField, StateEffect } = require('@codemirror/state');

// Effects to update the suggestion state
const setSuggestionEffect = StateEffect.define();
const clearSuggestionEffect = StateEffect.define();

// Widget to render the ghost text
class GhostTextWidget extends WidgetType {
    constructor(text) {
        super();
        this.text = text;
    }

    toDOM() {
        const span = document.createElement('span');
        span.textContent = this.text;
        span.className = 'cm-ghost-text';
        span.style.cssText = `
            opacity: 0.5;
            font-style: italic;
            pointer-events: none;
            white-space: pre; 
        `;
        return span;
    }

    eq(other) {
        return other.text === this.text;
    }
}

// State Field to hold the current suggestion and managing decorations
const inlineSuggestionField = StateField.define({
    create() {
        return { active: false, text: null, decoration: Decoration.none };
    },
    update(value, tr) {
        let { active, text, decoration } = value;

        for (let e of tr.effects) {
            if (e.is(setSuggestionEffect)) {
                // Determine position: usually selection head
                const pos = tr.state.selection.main.head;
                text = e.value;
                if (!text) {
                    active = false;
                    decoration = Decoration.none;
                } else {
                    active = true;
                    // Create widget decoration
                    const widget = Decoration.widget({
                        widget: new GhostTextWidget(text),
                        side: 1
                    });
                    decoration = Decoration.set([widget.range(pos)]);
                }
            } else if (e.is(clearSuggestionEffect)) {
                active = false;
                text = null;
                decoration = Decoration.none;
            }
        }

        // Auto-clear on document changes (user typing)
        if (tr.docChanged) {
            active = false;
            text = null;
            decoration = Decoration.none;
        } else if (tr.selectionSet && active) {
            // Clear on cursor move? 
            // Yes, typically ghost text disappears if you move cursor away.
            active = false;
            text = null;
            decoration = Decoration.none;
        }

        return { active, text, decoration };
    },
    provide: f => EditorView.decorations.from(f, v => v.decoration)
});

// View Plugin to handle debouncing and triggering fetches
const inlineSuggestionPlugin = ViewPlugin.fromClass(class {
    constructor(view) {
        this.view = view;
        this.debounceHandle = null;
        this.abortController = null;
    }

    update(update) {
        if (update.docChanged) {
            // Cancel previous
            if (this.abortController) {
                this.abortController.abort();
                this.abortController = null;
            }
            clearTimeout(this.debounceHandle);

            // Debounce new fetch
            this.debounceHandle = setTimeout(() => this.fetchSuggestion(), 700); // 700ms debounce
        }
    }

    async fetchSuggestion() {
        const state = this.view.state;
        const pos = state.selection.main.head;
        const filePath = window.currentFilePath;

        // CHECK SETTINGS
        try {
            const settings = JSON.parse(localStorage.getItem('peak-ai-settings') || '{}');
            if (settings.inlineSuggestions !== true) {
                // Feature disabled by default or by user
                return;
            }
        } catch (e) {
            return;
        }

        // Prepare context
        // Get 500 chars before and after
        const prefix = state.sliceDoc(Math.max(0, pos - 1000), pos);
        const suffix = state.sliceDoc(pos, Math.min(state.doc.length, pos + 1000));

        // Callback handling
        const applySuggestion = (text) => {
            if (!text) return;
            // Check if context is still valid? 
            // The StateField update logic clears on docChange, so if user typed more, this effect will be ignored/cleared 
            // BUT we should dispatch it against the *current* view state.
            // If the view state has changed since request, the decoration might be misplaced.
            // But we pass 'text'. The decoration is created at 'head'. 
            // If head moved, it's fine?
            // Actually StateField clears on selection change, so if user moved cursor, we shouldn't show it.
            // So we dispatch the effect. If state changed (selection moved), the StateField `update` logic will seeing `selectionSet` in the transaction? 
            // No, `dispatch` creates a transaction. 
            // We'll trust the Keymap to insert it at current head.

            this.view.dispatch({
                effects: setSuggestionEffect.of(text)
            });
        };

        window.dispatchEvent(new CustomEvent('peak-fetch-suggestion', {
            detail: {
                prefix,
                suffix,
                filePath,
                callback: applySuggestion
            }
        }));
    }

    destroy() {
        clearTimeout(this.debounceHandle);
    }
});

// Keymap
const inlineSuggestionKeymap = keymap.of([
    {
        key: "Tab",
        run: (view) => {
            const state = view.state.field(inlineSuggestionField);
            if (state.active && state.text) {
                // Accept suggestion
                const pos = view.state.selection.main.head;
                view.dispatch({
                    changes: { from: pos, insert: state.text },
                    effects: clearSuggestionEffect.of(null),
                    scrollIntoView: true
                });
                return true; // Handled
            }
            return false; // Propagate (indent)
        }
    },
    {
        key: "Escape",
        run: (view) => {
            const state = view.state.field(inlineSuggestionField);
            if (state.active) {
                view.dispatch({ effects: clearSuggestionEffect.of(null) });
                return true;
            }
            return false;
        }
    }
]);

module.exports = {
    inlineSuggestionField,
    inlineSuggestionPlugin,
    inlineSuggestionKeymap
};
