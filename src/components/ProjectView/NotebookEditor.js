
const { ipcRenderer } = require('electron');
const { createEditorInstance } = require('./editor.js');

// Icons
const ICONS = {
    play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>',
    plus: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>',
    moveUp: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>',
    moveDown: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>',
    code: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>',
    text: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3"></path><path d="M9 20h6"></path><path d="M12 4v16"></path></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    link: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>'
};

/**
 * Render a Notebook Editor
 */
function renderNotebookEditor(container, content, filePath) {
    container.innerHTML = '';
    container.classList.add('notebook-editor-active');

    // 1. Data Model Initialization
    let notebookData;
    try {
        notebookData = content && content.trim() !== '' ? JSON.parse(content) : createEmptyNotebook();
    } catch (e) {
        console.warn('Invalid JSON, creating empty notebook', e);
        notebookData = createEmptyNotebook();
    }

    if (!notebookData.cells) notebookData.cells = [];

    // --- Auto-Save Helper ---
    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    };

    // --- Save Logic ---
    const saveStatus = document.createElement('div');
    saveStatus.style.cssText = `
        font-size: 12px;
        color: var(--text-secondary);
        margin-left: auto;
        padding-right: 16px;
        opacity: 0.8;
    `;
    saveStatus.innerText = 'Saved';

    const saveNotebook = async (manual = false) => {
        saveStatus.innerText = 'Saving...';
        try {
            const json = JSON.stringify(notebookData, null, 2);
            await ipcRenderer.invoke('project:write-file', filePath, json);
            saveStatus.innerText = 'Saved';

            if (manual) {
                // Optional: Flash success or just rely on text
                const toast = document.createElement('div');
                toast.textContent = 'Notebook Saved';
                toast.style.cssText = `
                    position: fixed; bottom: 20px; right: 20px;
                    background: var(--accent-color); color: white;
                    padding: 8px 16px; border-radius: 4px;
                    z-index: 1000; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                    animation: fadeOut 2s forwards; animation-delay: 1s;
                `;
                document.body.appendChild(toast);
                setTimeout(() => toast.remove(), 3000);
            }
        } catch (err) {
            console.error('Save failed', err);
            saveStatus.innerText = 'Save Failed';
            saveStatus.style.color = '#ef4444';
        }
    };

    const autoSave = debounce(() => saveNotebook(false), 1000);

    // --- Cleanup Old Listeners ---
    if (container.dataset.hasListener) {
        // We can't easily remove specific anonymous functions unless we store them.
        // For this iteration, we accept a small risk or we should move listener setup outside.
        // Safest: Use a named handler attached to the container or a global map.
        if (window.notebookOutputHandler) {
            ipcRenderer.removeListener('notebook:cell-output', window.notebookOutputHandler);
        }
    }

    // --- Output Listener ---
    window.notebookOutputHandler = (event, targetPath, output) => {
        if (targetPath !== filePath) return;

        // Find the active executing cell
        const activeCell = notebookData.cells.find(c => c.is_executing);

        if (activeCell) {
            if (!activeCell.outputs) activeCell.outputs = [];
            activeCell.outputs.push(output);

            // Update DOM directly
            const cellIndex = notebookData.cells.indexOf(activeCell);
            const outputContainer = document.getElementById(`cell-output-${cellIndex}`);

            if (outputContainer) {
                appendOutputToContainer(outputContainer, output);
            }

            // Trigger auto-save on output
            autoSave();
        }
    };
    ipcRenderer.on('notebook:cell-output', window.notebookOutputHandler);

    // Completion Listener
    window.notebookCompleteHandler = (event, targetPath) => {
        if (targetPath !== filePath) return;
        const activeCell = notebookData.cells.find(c => c.is_executing);
        if (activeCell) {
            delete activeCell.is_executing;
            const cellIndex = notebookData.cells.indexOf(activeCell);
            const statusIndicator = document.getElementById(`cell-status-${cellIndex}`);
            if (statusIndicator) statusIndicator.style.background = 'transparent';

            // Final save after execution completes
            autoSave();
        }
    };
    ipcRenderer.on('notebook:cell-complete', window.notebookCompleteHandler);

    container.dataset.hasListener = 'true';

    // 2. Main Container Setup
    const wrapper = document.createElement('div');
    wrapper.className = 'notebook-wrapper';
    wrapper.style.cssText = `
        height: 100%;
        overflow-y: auto;
        background: var(--bg-color);
        display: flex;
        flex-direction: column;
        align-items: center; /* Center content like Colab */
        padding-bottom: 100px;
        position: relative;
    `;

    // Global Key Listener for Manual Save
    wrapper.tabIndex = 0;
    wrapper.addEventListener('keydown', async (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 's') {
            e.preventDefault();
            e.stopPropagation();
            await saveNotebook(true);
        }
    });

    // 3. Save Status (Top Right Overlay)
    saveStatus.style.cssText = `
        position: absolute;
        top: 10px;
        right: 20px;
        font-size: 12px;
        color: var(--text-secondary);
        opacity: 0.8;
        z-index: 20;
        pointer-events: none;
    `;
    wrapper.appendChild(saveStatus);


    // 4. Cells Container
    const cellsContainer = document.createElement('div');
    cellsContainer.style.cssText = `
        width: 100%;
        max-width: 900px;
        display: flex;
        flex-direction: column;
        gap: 16px; 
        padding-left: 40px;
        padding-right: 40px;
        box-sizing: border-box;
    `;
    wrapper.appendChild(cellsContainer);



    // --- Core: Add Cell ---
    function addCell(type, index = null) {
        const newCell = {
            cell_type: type,
            source: [],
            metadata: {},
            outputs: []
        };

        if (index === null) {
            notebookData.cells.push(newCell);
        } else {
            notebookData.cells.splice(index, 0, newCell);
        }
        renderCells();
        // save triggered by caller or implicitly by render?
        // render doesn't save. caller should.
    }

    // --- Core: Delete Cell ---
    function deleteCell(index) {
        notebookData.cells.splice(index, 1);
        renderCells();
        autoSave();
    }

    // --- Core: Move Cell ---
    function moveCell(index, direction) {
        if (direction === -1 && index > 0) {
            [notebookData.cells[index], notebookData.cells[index - 1]] = [notebookData.cells[index - 1], notebookData.cells[index]];
            renderCells();
            autoSave();
        } else if (direction === 1 && index < notebookData.cells.length - 1) {
            [notebookData.cells[index], notebookData.cells[index + 1]] = [notebookData.cells[index + 1], notebookData.cells[index]];
            renderCells();
            autoSave();
        }
    }

    // --- Core: Render All Cells ---
    function renderCells() {
        cellsContainer.innerHTML = '';

        // Initial Insertion Point (Top)
        cellsContainer.appendChild(createInsertionPoint(0));

        notebookData.cells.forEach((cell, index) => {
            const cellEl = createCell(cell, index);
            cellsContainer.appendChild(cellEl);

            // Insertion Point After Each Cell
            cellsContainer.appendChild(createInsertionPoint(index + 1));
        });
    }

    // --- Component: Insertion Point (Colab Style) ---
    function createInsertionPoint(index) {
        const div = document.createElement('div');
        div.className = 'notebook-insertion-point';
        div.style.cssText = `
            height: 24px;
            width: 100%;
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 0.2s;
            position: relative;
            z-index: 5;
            margin: 4px 0;
        `;

        const line = document.createElement('div');
        line.style.cssText = `
            width: 100%; height: 2px;
            background: var(--peak-accent);
            opacity: 0.3;
            position: absolute; left: 0; right: 0; top: 50%;
        `;

        const btnGroup = document.createElement('div');
        btnGroup.style.cssText = `
            display: flex; gap: 8px; 
            background: var(--bg-color); 
            padding: 0 8px; z-index: 2;
        `;

        const addBtn = (label, icon, type) => {
            const btn = document.createElement('button');
            btn.innerHTML = `${icon} <span style="margin-left:4px; font-size:11px; font-weight:600;">${label}</span>`;
            btn.style.cssText = `
                display: flex; align-items: center;
                border: 1px solid var(--border-color);
                background: var(--control-background-color);
                color: var(--text-color);
                border-radius: 14px; /* Pill Shape */
                padding: 4px 12px;
                cursor: pointer;
                transition: all 0.2s;
                box-shadow: 0 2px 4px rgba(0,0,0,0.05);
            `;
            btn.onmouseover = () => {
                btn.style.borderColor = 'var(--peak-accent)';
                btn.style.transform = 'translateY(-1px)';
            };
            btn.onmouseout = () => {
                btn.style.borderColor = 'var(--border-color)';
                btn.style.transform = 'translateY(0)';
            };

            btn.onclick = () => {
                addCell(type, index);
                autoSave();
            };
            return btn;
        };

        btnGroup.appendChild(addBtn('Code', ICONS.code, 'code'));
        btnGroup.appendChild(addBtn('Text', ICONS.text, 'markdown'));
        btnGroup.appendChild(addBtn('Link', ICONS.link, 'link'));

        div.appendChild(line);
        div.appendChild(btnGroup);

        div.onmouseenter = () => div.style.opacity = '1';
        div.onmouseleave = () => div.style.opacity = '0';

        return div;
    }

    // --- Component: Cell (Colab Style) ---
    function createCell(cell, index) {
        const wrapper = document.createElement('div');
        wrapper.className = 'notebook-cell-wrapper';
        wrapper.style.cssText = `
            display: flex;
            flex-direction: row;
            gap: 12px;
            width: 100%;
            position: relative; /* For Toolbar positioning */
            border-radius: 8px;
            padding: 4px; /* Slight breathing room */
            transition: box-shadow 0.2s;
        `;

        wrapper.onfocus = () => {
            wrapper.style.boxShadow = '0 0 0 2px rgba(var(--peak-accent-rgb), 0.1)';
        };
        wrapper.onblur = () => {
            wrapper.style.boxShadow = 'none';
        };

        // --- Toolbar (Top Right of Row) ---
        const toolbar = document.createElement('div');
        toolbar.className = 'cell-toolbar';
        toolbar.style.cssText = `
            position: absolute; right: 0; top: -12px;
            display: flex; gap: 4px;
            background: var(--bg-color);
            padding: 4px; border-radius: 6px;
            border: 1px solid var(--border-color);
            opacity: 0; pointer-events: none;
            transition: opacity 0.2s;
            z-index: 20;
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
        `;

        wrapper.onmouseenter = () => { toolbar.style.opacity = '1'; toolbar.style.pointerEvents = 'auto'; };
        wrapper.onmouseleave = () => { toolbar.style.opacity = '0'; toolbar.style.pointerEvents = 'none'; };

        const toolBtn = (icon, title, action) => {
            const btn = document.createElement('button');
            btn.innerHTML = icon;
            btn.title = title;
            btn.style.cssText = `
                width: 24px; height: 24px;
                border: none; background: transparent; color: var(--text-secondary);
                cursor: pointer; padding: 4px; border-radius: 4px;
                display: flex; align-items: center; justify-content: center;
            `;
            btn.onmouseover = () => { btn.style.background = 'var(--hover-color)'; btn.style.color = 'var(--text-color)'; };
            btn.onmouseout = () => { btn.style.background = 'transparent'; btn.style.color = 'var(--text-secondary)'; };
            btn.onclick = (e) => { e.stopPropagation(); action(); };
            return btn;
        };

        toolbar.appendChild(toolBtn(ICONS.moveUp, 'Move Up', () => moveCell(index, -1)));
        toolbar.appendChild(toolBtn(ICONS.moveDown, 'Move Down', () => moveCell(index, 1)));
        toolbar.appendChild(toolBtn(ICONS.trash, 'Delete Cell', () => deleteCell(index)));

        wrapper.appendChild(toolbar);

        // Left Gutter (Play/Status)
        const gutter = document.createElement('div');
        gutter.style.cssText = "display:flex; flex-direction:column; align-items:flex-end; gap:8px; width: 40px; flex-shrink:0; padding-top: 4px;";

        // Run Button (code & link)
        if (cell.cell_type === 'code' || cell.cell_type === 'link') {
            const runBtn = document.createElement('button');
            runBtn.innerHTML = ICONS.play;
            runBtn.id = `cell-status-${index}`;
            runBtn.style.cssText = `
                width: 28px; height: 28px; border-radius: 50%;
                background: var(--surface-color); border: 1px solid var(--border-color);
                color: var(--text-color); cursor: pointer; display: flex; align-items: center; justify-content: center;
                transition: all 0.2s;
                box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            `;
            runBtn.onmouseover = () => runBtn.style.color = 'var(--accent-color)';
            runBtn.onmouseout = () => runBtn.style.color = 'var(--text-color)';
            runBtn.onclick = () => runCell(cell, index);
            gutter.appendChild(runBtn);
        }

        // Cell Content
        const contentCol = document.createElement('div');
        contentCol.style.cssText = "flex: 1; min-width: 0; display:flex; flex-direction:column; gap: 8px;";

        // Editor Container
        const editorContainer = document.createElement('div');
        editorContainer.className = 'notebook-cell-editor';
        editorContainer.style.cssText = `
            border: 1px solid var(--border-color);
            border-radius: 4px;
            overflow: hidden;
            background: var(--surface-color);
            position: relative;
        `;

        if (cell.cell_type === 'link') {
            const inputContainer = document.createElement('div');
            inputContainer.style.cssText = "padding: 8px; display: flex; gap: 8px; align-items: center;";

            const label = document.createElement('span');
            label.innerText = 'Link:';
            label.style.cssText = "color: var(--text-secondary); font-size: 12px; width: 40px;";

            const input = document.createElement('input');
            input.type = 'text';
            input.placeholder = 'https://...';
            input.value = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
            input.style.cssText = `
                flex: 1;
                background: var(--bg-color);
                border: 1px solid var(--border-color);
                color: var(--text-color);
                padding: 6px 12px;
                border-radius: 4px;
                outline: none;
                font-family: inherit;
            `;
            input.onfocus = () => input.style.borderColor = 'var(--accent-color)';
            input.onblur = () => input.style.borderColor = 'var(--border-color)';
            input.oninput = (e) => {
                cell.source = [e.target.value];
                autoSave();
            };
            input.onkeydown = (e) => {
                if (e.key === 'Enter') runCell(cell, index);
            };

            const openBtn = document.createElement('button');
            openBtn.innerHTML = ICONS.link + ' Open';
            openBtn.style.cssText = `
                background: var(--accent-color);
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                display:flex; gap:4px; align-items:center;
            `;
            openBtn.onclick = () => runCell(cell, index);

            inputContainer.appendChild(label);
            inputContainer.appendChild(input);
            inputContainer.appendChild(openBtn);
            editorContainer.appendChild(inputContainer);
        } else {
            // CodeMirror Instance Host (Code/Markdown)
            const editorHost = document.createElement('div');
            editorContainer.appendChild(editorHost);

            const sourceText = Array.isArray(cell.source) ? cell.source.join('') : cell.source;

            createEditorInstance(editorHost, sourceText, filePath, {
                languageId: cell.cell_type === 'code' ? 'python' : 'markdown',
                lineWrapping: true,
                minimal: false,
                onUpdate: (newText) => {
                    cell.source = [newText];
                    autoSave();
                }
            });
        }


        // Output Area
        const outputArea = document.createElement('div');
        outputArea.id = `cell-output-${index}`;
        outputArea.className = 'notebook-cell-output';
        outputArea.style.cssText = `
            margin-top: 4px;
            padding: 8px;
            display: ${cell.outputs && cell.outputs.length > 0 ? 'block' : 'none'};
            border-left: 2px solid var(--border-color);
            margin-left: 4px;
        `;

        if (cell.cell_type === 'code' && cell.outputs) {
            cell.outputs.forEach(out => appendOutputToContainer(outputArea, out));
        }

        contentCol.appendChild(editorContainer);
        contentCol.appendChild(outputArea);

        wrapper.appendChild(gutter);
        wrapper.appendChild(contentCol);

        return wrapper;
    }

    function runCell(cell, index) {
        const rawCode = Array.isArray(cell.source) ? cell.source.join('') : cell.source;
        const code = rawCode ? rawCode.trim() : '';

        // Helper to transform URLs for embedding
        const transformUrlForEmbed = (originalUrl) => {
            console.log('[Notebook] Transforming URL:', originalUrl);
            let embedUrl = originalUrl;
            try {
                const urlObj = new URL(originalUrl);
                let videoId = null;

                if (urlObj.hostname.includes('youtu.be')) {
                    // https://youtu.be/ID
                    videoId = urlObj.pathname.slice(1);
                } else if (urlObj.hostname.includes('youtube.com')) {
                    // https://www.youtube.com/watch?v=ID
                    // https://www.youtube.com/embed/ID
                    if (urlObj.searchParams.has('v')) {
                        videoId = urlObj.searchParams.get('v');
                    } else if (urlObj.pathname.startsWith('/embed/')) {
                        videoId = urlObj.pathname.split('/')[2];
                    } else if (urlObj.pathname.startsWith('/v/')) {
                        videoId = urlObj.pathname.split('/')[2];
                    }
                }

                if (videoId) {
                    // Revert to standard youtube.com as nocookie can cause playback issues (Error 153)
                    embedUrl = `https://www.youtube.com/embed/${videoId}`;
                }
            } catch (e) { console.warn('URL transform failed', e); }
            return embedUrl;
        };

        // -- Link Execution --
        if (cell.cell_type === 'link') {
            if (code && (code.startsWith('http://') || code.startsWith('https://'))) {
                // Clear and Prepare Output
                cell.outputs = []; // We don't persist iframe state in 'outputs' usually, or maybe we should?
                // For now, ephemeral rendering.

                const outputContainer = document.getElementById(`cell-output-${index}`);
                if (outputContainer) {
                    outputContainer.innerHTML = '';
                    outputContainer.style.display = 'block';

                    // 1. Header (Fallback Link)
                    const header = document.createElement('div');
                    header.style.cssText = "display:flex; justify-content:flex-end; padding-bottom:4px; margin-bottom:4px; border-bottom:1px dashed var(--border-color);";

                    const extLink = document.createElement('a');
                    extLink.href = '#';
                    extLink.innerText = 'Open Externally ↗';
                    extLink.style.cssText = "font-size:11px; color:var(--peak-accent); text-decoration:none; cursor:pointer;";
                    extLink.onclick = (e) => {
                        e.preventDefault();
                        ipcRenderer.invoke('app:open-url', code);
                    };
                    header.appendChild(extLink);
                    outputContainer.appendChild(header);

                    // 2. Iframe (Inline Browser with Smart Embed)
                    let embedUrl = transformUrlForEmbed(code);

                    const iframe = document.createElement('iframe');
                    iframe.src = embedUrl;
                    // Removed referrerpolicy to allow default behavior (often fixes restriction errors)
                    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
                    iframe.allowFullscreen = true;
                    iframe.style.cssText = "width:100%; height:500px; border:1px solid var(--border-color); background:white; border-radius:4px;";
                    outputContainer.appendChild(iframe);
                }
            } else {
                alert('Please enter a valid URL starting with http:// or https://');
            }
            return;
        }

        // -- Code Execution (Python) --

        // Clear outputs
        cell.outputs = [];
        const outputContainer = document.getElementById(`cell-output-${index}`);
        if (outputContainer) {
            outputContainer.innerHTML = '';
            outputContainer.style.display = 'none';
        }

        // Visual executing state
        const statusBtn = document.getElementById(`cell-status-${index}`);
        if (statusBtn) statusBtn.style.background = 'var(--accent-color-transparent)';

        cell.is_executing = true;

        // Code already extracted above
        ipcRenderer.send('notebook:execute-run', filePath, code);
        // Note: autoSave happens in output listener
    }

    // Initial Render
    renderCells();

    container.appendChild(wrapper);
}

function createEmptyNotebook() {
    return {
        cells: [
            { cell_type: "markdown", metadata: {}, source: ["# Data Science Project\n"] }
        ],
        metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
        nbformat: 4,
        nbformat_minor: 5
    };
}


// --- Helper: Append Output ---
function appendOutputToContainer(container, output) {
    const outDiv = document.createElement('div');
    outDiv.style.cssText = "margin-bottom: 8px; white-space: pre-wrap; font-family: 'Geist Mono', monospace; font-size: 12px;";

    if (output.output_type === 'stream') {
        outDiv.innerText = output.text;
        outDiv.style.color = output.name === 'stderr' ? '#ef4444' : 'var(--text-color)';
    } else if (output.output_type === 'error') {
        outDiv.style.color = '#ef4444';
        outDiv.innerHTML = `<strong>${output.ename}</strong>: ${output.evalue}`;
        if (Array.isArray(output.traceback)) {
            const tb = document.createElement('pre');
            tb.innerText = output.traceback.join('\n');
            tb.style.cssText = "margin-top:4px; font-size:11px; opacity:0.8; overflow-x:auto;";
            outDiv.appendChild(tb);
        }
    } else if (output.output_type === 'execute_result' || output.output_type === 'display_data') {
        const data = output.data;
        if (data['image/png']) {
            const img = document.createElement('img');
            img.src = `data:image/png;base64,${data['image/png']}`;
            img.style.maxWidth = '100%';
            outDiv.appendChild(img);
        } else if (data['text/html']) {
            const html = Array.isArray(data['text/html']) ? data['text/html'].join('') : data['text/html'];
            outDiv.innerHTML = html;
        } else if (data['text/plain']) {
            outDiv.innerText = Array.isArray(data['text/plain']) ? data['text/plain'].join('') : data['text/plain'];
            outDiv.style.color = 'var(--text-color)';
        }
    }
    container.appendChild(outDiv);
    container.scrollTop = container.scrollHeight;
    container.style.display = 'block'; // Ensure output area is visible
}



module.exports = { renderNotebookEditor };
