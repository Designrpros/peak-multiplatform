// src/components/Kanban/index.js
const { ipcRenderer } = require('electron');

const DEFAULT_BOARD = {
    id: 'main',
    columns: [
        { id: 'col-todo', title: 'To Do', items: [] },
        { id: 'col-progress', title: 'In Progress', items: [] },
        { id: 'col-done', title: 'Done', items: [] }
    ]
};

function renderKanbanHTML(kanbanData) {
    if (!kanbanData || !Array.isArray(kanbanData.columns)) {
        kanbanData = DEFAULT_BOARD;
    }

    const columnsHtml = kanbanData.columns.map(col => renderColumn(col)).join('');

    return `
        <div class="kanban-container" id="kanban-board-${kanbanData.id}">
            <div class="kanban-header">
                <div class="header-left">
                    <h2 contenteditable="true" class="board-title-edit">${kanbanData.title || 'Task Board'}</h2>
                    <div class="board-desc" contenteditable="true">${kanbanData.description || 'Add description...'}</div>
                </div>
                <span class="board-stats">${kanbanData.columns.reduce((acc, c) => acc + c.items.length, 0)} tasks</span>
            </div>
            <div class="kanban-board-scroller">
                <div class="kanban-board">
                    ${columnsHtml}
                    
                    <div class="add-column-wrapper">
                        <div class="add-column-ghost" id="btn-add-column">
                            <i data-lucide="plus"></i> Add Column
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderColumn(col) {
    return `
        <div class="kanban-column" data-col-id="${col.id}">
            <div class="column-header">
                <div class="column-title-wrapper">
                    <span class="column-title" contenteditable="true" data-col-id="${col.id}">${col.title}</span>
                    <span class="column-count">${col.items.length}</span>
                </div>
                <div class="column-actions">
                    <button class="icon-btn danger delete-col-btn" title="Delete Column"><i data-lucide="trash-2"></i></button>
                </div>
            </div>
            <div class="column-content" id="col-content-${col.id}">
                ${col.items.map(item => renderCard(item)).join('')}
            </div>
            <div class="column-footer">
                <button class="add-task-btn"><i data-lucide="plus"></i> New</button>
            </div>
        </div>
    `;
}

function renderCard(item) {
    const tagsHtml = (item.tags || []).map(color => 
        `<span class="card-tag" style="background-color: ${color};"></span>`
    ).join('');

    return `
        <div class="kanban-card" draggable="true" data-id="${item.id}">
            ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
            <div class="card-content">${escapeHtml(item.text)}</div>
        </div>
    `;
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function attachKanbanListeners(kanbanData, container, onSave) {
    if (!kanbanData || !Array.isArray(kanbanData.columns)) {
        kanbanData = JSON.parse(JSON.stringify(DEFAULT_BOARD));
    }

    const board = container.querySelector('.kanban-board');
    const addColWrapper = container.querySelector('.add-column-wrapper');

    const save = () => { 
        if (onSave) onSave(kanbanData); 
    };

    const refreshUI = () => {
        container.innerHTML = renderKanbanHTML(kanbanData);
        if(window.lucide) window.lucide.createIcons();
        attachKanbanListeners(kanbanData, container, onSave);
    };

    // --- 1. INLINE EDITING ---
    const enableInlineEdit = (element, onSaveCallback) => {
        const currentText = element.innerText;
        const input = document.createElement('textarea');
        input.className = 'task-input';
        input.value = currentText;
        input.rows = 2; 
        
        const autoResize = () => {
            input.style.height = 'auto';
            input.style.height = input.scrollHeight + 'px';
        };

        element.innerHTML = '';
        element.appendChild(input);
        input.focus();
        autoResize();

        input.addEventListener('input', autoResize);
        
        const commit = () => {
            const val = input.value.trim();
            if (val !== currentText) {
                onSaveCallback(val);
            } else {
                element.innerText = currentText; 
            }
        };

        input.addEventListener('blur', commit);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                input.blur(); 
            }
        });
    };

    board.addEventListener('dblclick', (e) => {
        const card = e.target.closest('.kanban-card');
        if (card) {
            const contentEl = card.querySelector('.card-content');
            if (contentEl.querySelector('textarea')) return; 

            const colId = card.closest('.kanban-column').dataset.colId;
            const taskId = card.dataset.id;
            
            enableInlineEdit(contentEl, (newText) => {
                const col = kanbanData.columns.find(c => c.id === colId);
                const task = col.items.find(t => t.id === taskId);
                if (task) {
                    task.text = newText || "Untitled Task";
                    save();
                    refreshUI();
                }
            });
        }
    });

    // --- 2. INLINE CREATION & DELETION ---
    board.addEventListener('click', (e) => {
        if (e.target.closest('.add-task-btn')) {
            const btn = e.target.closest('.add-task-btn');
            const columnEl = btn.closest('.kanban-column');
            const contentEl = columnEl.querySelector('.column-content');
            const colId = columnEl.dataset.colId;

            btn.style.display = 'none';

            const tempCard = document.createElement('div');
            tempCard.className = 'kanban-card';
            tempCard.innerHTML = `<textarea class="task-input" placeholder="Type a task..." rows="2"></textarea>`;
            contentEl.appendChild(tempCard);
            
            const input = tempCard.querySelector('textarea');
            input.focus();
            
            let isFinalizing = false;
            const finalize = () => {
                if (isFinalizing) return;
                isFinalizing = true;

                const text = input.value.trim();
                if (text) {
                    const col = kanbanData.columns.find(c => c.id === colId);
                    if (col) {
                        col.items.push({ id: 'task-' + Date.now(), text, tags: [] });
                        save();
                    }
                }
                refreshUI(); 
            };

            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    finalize();
                } else if (e.key === 'Escape') {
                    refreshUI(); 
                }
            });
            
            input.addEventListener('blur', (e) => {
                 setTimeout(finalize, 100);
            });
        }
        
        if (e.target.closest('.delete-col-btn')) {
            const colId = e.target.closest('.kanban-column').dataset.colId;
            if(confirm('Delete column?')) {
                kanbanData.columns = kanbanData.columns.filter(c => c.id !== colId);
                save();
                refreshUI();
            }
        }
    });

    // --- 3. ADD COLUMN ---
    const btnAddCol = container.querySelector('#btn-add-column');
    if (btnAddCol) {
        btnAddCol.addEventListener('click', () => {
            addColWrapper.innerHTML = `
                <div class="kanban-column add-column-form">
                    <input type="text" class="column-input" placeholder="Column Title">
                    <div style="display:flex; gap:8px;">
                        <button class="control-btn" id="confirm-col"><i data-lucide="check"></i></button>
                        <button class="control-btn" id="cancel-col"><i data-lucide="x"></i></button>
                    </div>
                </div>
            `;
            const input = addColWrapper.querySelector('input');
            const confirm = addColWrapper.querySelector('#confirm-col');
            const cancel = addColWrapper.querySelector('#cancel-col');
            
            if(window.lucide) window.lucide.createIcons();
            input.focus();
            
            const submit = () => {
                const title = input.value.trim() || 'New Column';
                kanbanData.columns.push({ id: 'col-' + Date.now(), title, items: [] });
                save();
                refreshUI();
            };

            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') refreshUI(); });
            confirm.addEventListener('click', submit);
            cancel.addEventListener('click', refreshUI);
        });
    }

    // --- 4. DRAG & DROP ---
    let draggedCardId = null;
    let sourceColId = null;

    board.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.kanban-card');
        if (!card) return;
        draggedCardId = card.dataset.id;
        sourceColId = card.closest('.kanban-column').dataset.colId;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', draggedCardId);
        setTimeout(() => card.classList.add('dragging'), 0);
    });

    board.addEventListener('dragend', (e) => {
        const card = e.target.closest('.kanban-card');
        if (card) card.classList.remove('dragging');
        document.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
        draggedCardId = null;
    });

    board.addEventListener('dragover', (e) => {
        e.preventDefault();
        const col = e.target.closest('.kanban-column');
        if (col) col.classList.add('drag-over');
    });

    board.addEventListener('dragleave', (e) => {
        const col = e.target.closest('.kanban-column');
        if (col && !col.contains(e.relatedTarget)) col.classList.remove('drag-over');
    });

    board.addEventListener('drop', (e) => {
        e.preventDefault();
        const col = e.target.closest('.kanban-column');
        if (!col || !draggedCardId) return;
        const targetColId = col.dataset.colId;
        col.classList.remove('drag-over');

        const sourceCol = kanbanData.columns.find(c => c.id === sourceColId);
        const targetCol = kanbanData.columns.find(c => c.id === targetColId);
        
        if (sourceCol && targetCol) {
            const itemIndex = sourceCol.items.findIndex(i => i.id === draggedCardId);
            if (itemIndex > -1) {
                const [item] = sourceCol.items.splice(itemIndex, 1);
                targetCol.items.push(item);
                save();
                refreshUI();
            }
        }
    });

    // --- 5. COLUMN & BOARD TITLES ---
    const titles = board.querySelectorAll('.column-title');
    titles.forEach(titleEl => {
        titleEl.addEventListener('blur', () => {
            const newTitle = titleEl.innerText.trim();
            const colId = titleEl.dataset.colId;
            const col = kanbanData.columns.find(c => c.id === colId);
            if (col && col.title !== newTitle) {
                col.title = newTitle;
                save();
            }
        });
        titleEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
    });

    const boardTitle = container.querySelector('.board-title-edit');
    const boardDesc = container.querySelector('.board-desc');

    if (boardTitle) {
        boardTitle.addEventListener('blur', () => {
            kanbanData.title = boardTitle.innerText;
            save();
        });
        boardTitle.addEventListener('keydown', (e) => { if(e.key==='Enter') { e.preventDefault(); boardTitle.blur(); } });
    }

    if (boardDesc) {
        boardDesc.addEventListener('blur', () => {
            kanbanData.description = boardDesc.innerText;
            save();
        });
    }

    // --- 6. CONTEXT MENU (New Logic) ---
    board.addEventListener('contextmenu', (e) => {
        const card = e.target.closest('.kanban-card');
        if (!card) return;
        e.preventDefault();
        
        const taskId = card.dataset.id;
        const colId = card.closest('.kanban-column').dataset.colId;
        
        ipcRenderer.send('show-kanban-context-menu', { boardId: kanbanData.id, colId, taskId });
    });

    // --- 7. IPC LISTENER FOR ACTIONS ---
    const onAction = (event, msg) => {
        if (msg.boardId !== kanbanData.id) return; // Only process for current board

        const col = kanbanData.columns.find(c => c.id === msg.colId);
        if (!col) return;

        if (msg.action === 'delete') {
            col.items = col.items.filter(i => i.id !== msg.taskId);
        } else if (msg.action === 'cycle-color') {
            const task = col.items.find(i => i.id === msg.taskId);
            if (task) {
                const COLORS = ['#FF6B6B', '#FF9F43', '#1DD1A1', '#54A0FF', '#5F27CD'];
                if (!task.tags) task.tags = [];
                const current = task.tags[0];
                let nextIdx = current ? COLORS.indexOf(current) + 1 : 0;
                
                if (nextIdx >= COLORS.length) task.tags = []; 
                else task.tags = [COLORS[nextIdx]];
            }
        }
        save();
        refreshUI();
    };

    ipcRenderer.on('kanban-action', onAction);

    if (window.lucide) window.lucide.createIcons();
    
    // Cleanup listeners
    return () => {
        ipcRenderer.removeListener('kanban-action', onAction);
        delete window.deleteKanbanTask;
    };
}

module.exports = { renderKanbanHTML, attachKanbanListeners };