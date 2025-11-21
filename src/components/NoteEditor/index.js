// src/components/NoteEditor/index.js
const { ipcRenderer } = require('electron');
let hljs;
try { hljs = require('highlight.js'); } catch (e) {}

function renderNoteEditorHTML(noteData) {
    const sortedBlocks = noteData.blocks ? noteData.blocks.sort((a, b) => a.orderIndex - b.orderIndex) : [];
    const tags = noteData.tags || []; 

    return `
        <div class="note-editor-container" data-note-id="${noteData.id}">
            <div class="active-tag-list">
                ${tags.map(tag => `
                    <span class="tag-pill">
                        ${tag} 
                        <i data-lucide="x" class="tag-remove" data-tag="${tag}"></i>
                    </span>
                `).join('')}
            </div>

            <div class="tag-input-row" style="display: none;">
                <input type="text" class="tag-input new-tag-input" placeholder="Type tag and press Enter...">
            </div>

            <div class="note-editor-scroller">
                ${sortedBlocks.length === 0 ? `
                    <div class="empty-state"><div class="empty-text">This note is empty.</div></div>
                ` : `
                    <div class="note-editor-content">
                        ${sortedBlocks.map(block => renderBlock(block)).join('')}
                    </div>
                `}
                <div style="height: 180px;"></div>
            </div>
            
            ${renderInputBar()}
        </div>
    `;
}

function renderBlock(block) {
    const content = block.content || '';
    const safeContent = content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const rawContentEncoded = content.replace(/"/g, '&quot;');
    const commonAttrs = `draggable="true" data-id="${block.id}" data-type="${block.type}" data-raw-content="${rawContentEncoded}"`;

    switch(block.type) {
        case 'heading': return `<div class="note-block heading-block" ${commonAttrs}>${safeContent}</div>`;
        case 'paragraph': return `<div class="note-block paragraph-block" ${commonAttrs}>${safeContent.replace(/\n/g, '<br>')}</div>`;
        case 'todo':
            const isChecked = content.startsWith('[x] ');
            const todoText = safeContent.replace(/^\[[ x]\]\s?/, ''); 
            return `
                <div class="note-block todo-block" ${commonAttrs}>
                    <button class="todo-toggle ${isChecked ? 'checked' : ''}" 
                            onclick="event.stopPropagation(); window.handleTodoToggle('${block.noteId || ''}', '${block.id}', !${isChecked})">
                        <i data-lucide="${isChecked ? 'check-circle-2' : 'circle'}"></i>
                    </button>
                    <span class="todo-text ${isChecked ? 'completed' : ''}">${todoText}</span>
                </div>
            `;
        case 'image':
            return `<div class="note-block image-block" ${commonAttrs}><img src="${content}" style="max-width: 100%; border-radius: 8px;" onerror="this.style.display='none'"><div class="image-caption">${safeContent}</div></div>`;
        case 'code':
            // HIGHLIGHTING LOGIC
            let codeText = content;
            const langMatch = content.match(/^```(\w+)\n/);
            let lang = 'text';
            if (langMatch) {
                lang = langMatch[1];
                codeText = codeText.substring(langMatch[0].length);
            }
            if (codeText.endsWith('```')) codeText = codeText.substring(0, codeText.length - 3);
            
            let highlighted = safeContent;
            if (hljs) {
                try {
                    if (lang !== 'text' && hljs.getLanguage(lang)) {
                        highlighted = hljs.highlight(codeText, { language: lang }).value;
                    } else {
                        highlighted = hljs.highlightAuto(codeText).value;
                    }
                } catch (e) { highlighted = codeText.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
            } else {
                highlighted = codeText.replace(/&/g, '&amp;').replace(/</g, '&lt;');
            }

            return `<div class="note-block code-block" ${commonAttrs}>
                <div class="code-header"><span class="lang-badge">${lang}</span><button class="copy-btn" onclick="event.stopPropagation()"><i data-lucide="copy"></i></button></div>
                <pre><code class="hljs">${highlighted}</code></pre>
            </div>`;
        case 'separator': return `<div class="note-block separator-block" ${commonAttrs}><hr></div>`;
        default: return `<div class="note-block paragraph-block" ${commonAttrs}>${safeContent}</div>`;
    }
}

function renderInputBar() {
    return `
        <div class="note-input-wrapper">
            <div class="note-input-glass-panel">
                <div class="input-row-top">
                    <textarea class="note-input-textarea" placeholder="Add a block..." rows="1"></textarea>
                </div>
                <div class="input-row-bottom">
                    <div class="toolbar-left">
                        <button class="icon-btn btn-image" title="Add Image"><i data-lucide="image"></i></button>
                        <button class="icon-btn btn-tag" title="Add Tag"><i data-lucide="tag"></i></button>
                        <div class="type-selector-container">
                            <select class="block-type-select">
                                <option value="paragraph">Text</option>
                                <option value="heading">Heading</option>
                                <option value="todo">To-Do</option>
                                <option value="code">Code</option>
                                <option value="separator">Line</option>
                            </select>
                        </div>
                    </div>
                    <div class="toolbar-spacer"></div>
                    <div class="toolbar-right">
                        <button class="note-submit-button submit-circle-btn" disabled><i data-lucide="arrow-up"></i></button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function attachNoteEditorListeners(noteData, container) {
    window.ipcRenderer.send('did-finish-content-swap');
    const root = container || document; 
    const noteId = noteData.id;
    const contentArea = root.querySelector('.note-editor-content');
    const textarea = root.querySelector('.note-input-textarea');
    const submitButton = root.querySelector('.note-submit-button');
    const typeSelect = root.querySelector('.block-type-select');
    const scroller = root.querySelector('.note-editor-scroller');

    let draggedBlockId = null;
    if (contentArea) {
        contentArea.addEventListener('dragstart', (e) => {
            const block = e.target.closest('.note-block');
            if (!block) return;
            draggedBlockId = block.dataset.id;
            block.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', draggedBlockId);
        });
        contentArea.addEventListener('dragend', (e) => {
            if (draggedBlockId) {
                const block = contentArea.querySelector(`[data-id="${draggedBlockId}"]`);
                if (block) block.classList.remove('dragging');
            }
            document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(el => el.classList.remove('drag-over-top', 'drag-over-bottom'));
            draggedBlockId = null;
        });
        contentArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            const block = e.target.closest('.note-block');
            if (block && block.dataset.id !== draggedBlockId) {
                const rect = block.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                block.classList.remove('drag-over-top', 'drag-over-bottom');
                if (e.clientY < midpoint) block.classList.add('drag-over-top');
                else block.classList.add('drag-over-bottom');
            }
        });
        contentArea.addEventListener('dragleave', (e) => {
             const block = e.target.closest('.note-block');
             if (block) block.classList.remove('drag-over-top', 'drag-over-bottom');
        });
        contentArea.addEventListener('drop', (e) => {
            e.preventDefault();
            const targetBlock = e.target.closest('.note-block');
            if (targetBlock && draggedBlockId && targetBlock.dataset.id !== draggedBlockId) {
                const targetId = targetBlock.dataset.id;
                const rect = targetBlock.getBoundingClientRect();
                const position = e.clientY < (rect.top + rect.height / 2) ? 'before' : 'after';
                window.moveNoteBlock(noteId, draggedBlockId, targetId, position);
            }
        });
    }

    const activeTagList = root.querySelector('.active-tag-list');
    const tagInputRow = root.querySelector('.tag-input-row');
    const tagBtn = root.querySelector('.btn-tag');
    const tagInput = root.querySelector('.new-tag-input');

    if (tagBtn && tagInputRow) {
        tagBtn.addEventListener('click', () => {
            const isHidden = tagInputRow.style.display === 'none';
            tagInputRow.style.display = isHidden ? 'block' : 'none';
            if (isHidden) setTimeout(() => tagInput.focus(), 50);
            tagBtn.style.color = isHidden ? 'var(--peak-accent)' : 'var(--peak-secondary)';
        });
    }

    if (tagInput) {
        tagInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && tagInput.value.trim() !== '') {
                window.addNoteTag(noteId, tagInput.value.trim());
                tagInput.value = '';
            }
        });
    }
    
    if (activeTagList) {
        activeTagList.addEventListener('click', (e) => {
            if (e.target.closest('.tag-remove')) {
                const pill = e.target.closest('.tag-remove');
                const tagName = pill.dataset.tag;
                window.removeNoteTag(noteId, tagName);
            }
        });
    }

    const imgBtn = root.querySelector('.btn-image');
    if (imgBtn) {
        imgBtn.addEventListener('click', async () => {
            const filePath = await ipcRenderer.invoke('select-image');
            if (filePath) window.addNoteBlock(noteId, 'image', filePath);
        });
    }

    if (contentArea) {
        contentArea.addEventListener('click', (e) => {
            const block = e.target.closest('.note-block');
            if (!block || block.classList.contains('editing')) return;
            if (['separator', 'image'].includes(block.dataset.type)) return;
            if (e.target.closest('button, input, textarea')) return;

            block.classList.add('editing');
            const txt = document.createElement('textarea');
            txt.className = 'edit-textarea';
            let raw = block.dataset.rawContent || '';
            if(block.dataset.type === 'todo') raw = raw.replace(/^\[[ x]\]\s?/, '');
            txt.value = raw;
            
            block.innerHTML = '';
            block.appendChild(txt);
            txt.focus();
            txt.style.height = txt.scrollHeight + 'px';
            
            const save = () => {
                const val = txt.value;
                if (!val.trim()) window.deleteNoteBlock(noteId, block.dataset.id);
                else window.updateNoteBlock(noteId, block.dataset.id, block.dataset.type === 'todo' ? `[ ] ${val}` : val);
            };
            txt.addEventListener('blur', save);
            txt.addEventListener('keydown', (k) => { if(k.key === 'Enter' && !k.shiftKey) { k.preventDefault(); txt.blur(); }});
        });
        contentArea.addEventListener('contextmenu', (e) => {
            const block = e.target.closest('.note-block');
            if (block) {
                e.preventDefault();
                ipcRenderer.send('show-block-context-menu', { noteId, blockId: block.dataset.id });
            }
        });
    }

    const adjustHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        const isValid = textarea.value.trim().length > 0 || typeSelect.value === 'separator';
        submitButton.disabled = !isValid;
        submitButton.style.backgroundColor = isValid ? 'var(--peak-accent)' : 'transparent';
        submitButton.style.color = isValid ? 'white' : 'var(--peak-secondary)';
    };

    const onSubmit = () => {
        const content = textarea.value;
        const type = typeSelect.value;
        if (content.trim().length === 0 && type !== 'separator') return;
        let finalContent = content;
        if (type === 'todo') finalContent = `[ ] ${content}`;
        window.addNoteBlock(noteId, type, finalContent);
        textarea.value = '';
        adjustHeight();
        textarea.focus();
        setTimeout(() => { if(scroller) scroller.scrollTop = scroller.scrollHeight; }, 50);
    };

    if (textarea) {
        textarea.addEventListener('input', adjustHeight);
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(); }
        });
        adjustHeight();
    }
    if (submitButton) submitButton.addEventListener('click', onSubmit);

    const deleteHandler = (e, d) => { if (d.noteId === noteId) window.deleteNoteBlock(d.noteId, d.blockId); };
    ipcRenderer.on('delete-block-command', deleteHandler);

    return () => { ipcRenderer.removeListener('delete-block-command', deleteHandler); };
}

module.exports = { renderNoteEditorHTML, attachNoteEditorListeners };