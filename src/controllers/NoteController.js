// src/controllers/NoteController.js
module.exports = {
    addNoteBlock: (noteId, type, content) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if(note) {
            note.blocks.push({ id: Date.now(), type, content, orderIndex: note.blocks.length });
            store.set('notes', notes);
            window.tabManager.renderView();
        }
    },

    handleTodoToggle: (noteId, blockId, checked) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if(note) {
            const b = note.blocks.find(x => x.id == blockId);
            if(b) {
                b.content = checked ? '[x] ' + b.content.replace(/^\[[ x]\]\s?/, '') : '[ ] ' + b.content.replace(/^\[[ x]\]\s?/, '');
                store.set('notes', notes);
            }
        }
    },

    updateNoteBlock: (noteId, blockId, content) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if(note) {
            const b = note.blocks.find(x => x.id == blockId);
            if(b) { b.content = content; store.set('notes', notes); }
        }
    },

    deleteNoteBlock: (noteId, blockId) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if(note) {
            note.blocks = note.blocks.filter(x => x.id != blockId);
            store.set('notes', notes);
            window.tabManager.renderView();
        }
    },

    moveNoteBlock: (noteId, blockId, targetId, position) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if (note) {
            const fromIndex = note.blocks.findIndex(b => b.id == blockId);
            const toIndex = note.blocks.findIndex(b => b.id == targetId);
            if (fromIndex > -1 && toIndex > -1) {
                const item = note.blocks.splice(fromIndex, 1)[0];
                let insertAt = toIndex;
                if (fromIndex < toIndex) insertAt--; 
                if (position === 'after') insertAt++;
                note.blocks.splice(insertAt, 0, item);
                note.blocks.forEach((b, i) => b.orderIndex = i);
                store.set('notes', notes);
                window.tabManager.renderView();
            }
        }
    },

    addNoteTag: (noteId, tag) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if (note) {
            if (!note.tags) note.tags = [];
            if (!note.tags.includes(tag)) {
                note.tags.push(tag);
                store.set('notes', notes);
                window.tabManager.renderView();
                // FIX: Live update sidebar
                if(window.tabManager.refreshInspector) window.tabManager.refreshInspector();
            }
        }
    },

    removeNoteTag: (noteId, tag) => {
        if (!window.tabManager || !window.tabManager.noteStore) return;
        const store = window.tabManager.noteStore;
        const notes = store.get('notes', []);
        const note = notes.find(n => n.id === noteId);
        if (note && note.tags) {
            note.tags = note.tags.filter(t => t !== tag);
            store.set('notes', notes);
            window.tabManager.renderView();
            // FIX: Live update sidebar
            if(window.tabManager.refreshInspector) window.tabManager.refreshInspector();
        }
    }
};