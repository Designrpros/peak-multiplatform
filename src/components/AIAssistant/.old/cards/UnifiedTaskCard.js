/**
 * UnifiedTaskCard.js
 * 
 * Combines the compact, modern UI of TaskCardCompact with the robust state management
 * and history/live container separation of TaskCard.
 * 
 * Features:
 * - Compact, VS Code-like aesthetics
 * - Distinct "History" (completed steps) vs "Live" (streaming) areas
 * - Phase detection (Plan, Execute, Review)
 * - Status bar for active state feedback
 * - File chips for context
 */

const ProgressList = require('./ProgressList');

class UnifiedTaskCard {
    constructor(userPrompt, agentId = 'general', commitHash = null) {
        this.userPrompt = userPrompt;
        this.agentId = agentId;
        this.commitHash = commitHash;
        this.startTime = Date.now();
        this.status = 'active';

        // State tracking
        this.stepCount = 0;
        this.currentStepNumber = 0;
        this.filesEdited = new Set();
        this.lastProcessedLength = 0;
        this.lastContentLength = 0; // Track HTML length for shrinking detection
        this.isCollapsed = false;

        // --- DOM Structure ---
        this.element = document.createElement('div');
        this.element.className = 'task-card-compact unified-task-card';
        this.element.style.background = 'transparent';
        this.element.style.border = '1px solid var(--border-color)';
        this.element.style.borderRadius = '8px';
        this.element.style.overflow = 'hidden';
        this.element.style.paddingBottom = '0px';
        this.element.dataset.agent = agentId;
        this.element.dataset.status = 'active';



        // 1. Header
        this.renderHeader();

        // 2. Files Section
        this.renderFilesSection();

        // 3. Progress Updates Section
        const progressHeader = document.createElement('div');
        progressHeader.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-top: 12px; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid var(--border-color);';
        progressHeader.innerHTML = `
            <span style="font-size: 11px; font-weight: 600; color: var(--text-muted);">Progress Updates</span>
            <button class="collapse-all-btn" style="background:none; border:none; font-size:10px; color:var(--text-muted); cursor:pointer; display:flex; align-items:center; gap:4px;">
                Collapse all <i data-lucide="chevron-down" style="width:10px; height:10px;"></i>
            </button>
        `;
        this.element.appendChild(progressHeader);

        // Create progress list container
        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = 'max-height: 300px; overflow-y: auto; padding: 0; margin: 0;';
        this.element.appendChild(progressContainer);

        // Initialize ProgressList
        this.progressList = new ProgressList(progressContainer);

        // Collapse All Logic
        progressHeader.querySelector('.collapse-all-btn').onclick = (e) => {
            const btn = e.currentTarget;
            const isCollapsed = btn.dataset.collapsed === 'true';

            if (isCollapsed) {
                this.progressList.expandAll();
            } else {
                this.progressList.collapseAll();
            }

            btn.dataset.collapsed = !isCollapsed;
            btn.innerHTML = isCollapsed ?
                `Collapse all <i data-lucide="chevron-down" style="width:10px; height:10px;"></i>` :
                `Expand all <i data-lucide="chevron-right" style="width:10px; height:10px;"></i>`;
            if (window.lucide) window.lucide.createIcons();
        };

        // 5. Status Bar removed

        if (window.lucide) window.lucide.createIcons();
    }

    getTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    }

    renderHeader() {
        const header = document.createElement('div');
        header.className = 'task-card-header-compact';
        header.style.cssText = 'display: flex; align-items: flex-start; justify-content: space-between; padding-bottom: 6px; margin-bottom: 4px; border-bottom: 1px solid var(--border-color);';

        const title = this.extractTitle(this.cleanPrompt(this.userPrompt));

        header.innerHTML = `
            <div class="header-content" style="flex: 1; min-width: 0; cursor: pointer; display: flex; flex-direction: column; gap: 2px;">
                <div class="header-title-row" style="display: flex; align-items: center; gap: 6px;">
                    <span class="header-title" style="font-weight: 600; font-size: 13px; color: var(--peak-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
                    <i data-lucide="chevron-down" class="title-chevron" style="width: 12px; height: 12px; opacity: 0.5; transition: transform 0.2s;"></i>
                </div>
                <div class="header-full-prompt" style="display: none; font-size: 11px; color: var(--text-muted); margin-top: 4px; white-space: pre-wrap; word-break: break-word;">${this.userPrompt}</div>
            </div>
            <div class="header-actions" style="display: flex; align-items: center; gap: 6px;">
                <button class="icon-btn-compact" title="Copy Prompt" id="copy-prompt-btn" style="background: transparent; border: none; padding: 2px; cursor: pointer; color: var(--text-muted); opacity: 0.5; transition: opacity 0.2s;">
                    <i data-lucide="copy" style="width: 14px; height: 14px;"></i>
                </button>
                <button class="icon-btn-compact" title="Reset Task" id="reset-task-btn" style="background: transparent; border: none; padding: 2px; cursor: pointer; color: var(--peak-error); opacity: 0.5; transition: opacity 0.2s;">
                    <i data-lucide="rotate-ccw" style="width: 14px; height: 14px;"></i>
                </button>
            </div>
        `;

        // Event Listeners
        const contentDiv = header.querySelector('.header-content');
        const fullPromptDiv = header.querySelector('.header-full-prompt');
        const titleChevron = header.querySelector('.title-chevron');

        contentDiv.addEventListener('click', () => {
            const isExpanded = fullPromptDiv.style.display !== 'none';
            fullPromptDiv.style.display = isExpanded ? 'none' : 'block';
            titleChevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
            header.querySelector('.header-title').style.whiteSpace = isExpanded ? 'nowrap' : 'normal';
        });

        // Copy
        const copyBtn = header.querySelector('#copy-prompt-btn');
        copyBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(this.userPrompt);
            // Visual feedback logic here
        });

        // Reset
        const resetBtn = header.querySelector('#reset-task-btn');
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.gitResetToPoint();
        });

        // Hover effects for minimal buttons
        [copyBtn, resetBtn].forEach(btn => {
            btn.addEventListener('mouseenter', () => btn.style.opacity = '1');
            btn.addEventListener('mouseleave', () => btn.style.opacity = '0.5');
        });

        this.element.appendChild(header);
    }



    renderFilesSection() {
        this.filesSection = document.createElement('div');
        this.filesSection.className = 'task-files-compact';
        this.filesSection.style.display = 'none';
        this.fileChipsContainer = document.createElement('div');
        this.fileChipsContainer.className = 'file-chips-container';
        this.filesSection.appendChild(this.fileChipsContainer);
        this.element.appendChild(this.filesSection);
    }

    // renderStatusBar removed as per user request

    /**
     * Core Update Logic
     * Handles streaming HTML updates, diffing, and state transitions.
     */
    update(fullHtml) {
        // 1. Clean noise
        let cleanedHtml = fullHtml.replace(/<tool_definition>[\s\S]*?<\/tool_definition>/gi, '');
        cleanedHtml = cleanedHtml.replace(/Start working now\. Use tools immediately\./gi, '');

        // 2. Parse into temp DOM
        const temp = document.createElement('div');
        temp.innerHTML = cleanedHtml;
        const allNodes = Array.from(temp.childNodes);

        // 3. Handle shrinking content (reset if needed)
        // FIX: Use HTML length instead of node count to prevent spurious resets during streaming
        // Node count can fluctuate during streaming even when content is growing
        // Handle pending reset resolution from previous frame
        if (this.pendingReset) {
            const confirmsShrink = cleanedHtml.length < (this.staleContentLength * 0.8);
            if (confirmsShrink) {
                console.warn('[UnifiedTaskCard] Stream restart confirmed. Appending retry divider.');
                // FIX: Smart Merge - Do NOT clear history. Just add a divider.
                this.progressList.addDivider('Stream Restarted');
                // Reset processing pointer to 0 to re-process the new stream from start
                this.lastProcessedLength = 0;
                // Reset baseline to current length so we don't trigger shrink logic again immediately
                this.lastContentLength = 0;
            } else {
                console.log('[UnifiedTaskCard] Stream glitch recovered. Resuming.');
            }
            this.pendingReset = false;
            this.staleContentLength = 0;
        }

        if (cleanedHtml.length < this.lastContentLength) {
            // FIX: Robustly distinguish between stream restart and stream backspace/buffering
            // If content shrank significantly (e.g. by more than 20% or to < 100 chars), it's likely a restart/reset
            const isSignificantShrink = cleanedHtml.length < (this.lastContentLength * 0.8) || cleanedHtml.length < 100;

            if (isSignificantShrink) {
                console.warn('[UnifiedTaskCard] Potential stream restart detected. Debouncing...');
                this.pendingReset = true;
                this.staleContentLength = this.lastContentLength;
                return; // SKIP processing this frame to see if it persists
            } else {
                console.log('[UnifiedTaskCard] Content shrank slightly (backspace). Adjusting sync point.');
                // Just adjust pointer to valid range
                if (this.lastProcessedLength > allNodes.length) {
                    this.lastProcessedLength = allNodes.length;
                }
            }
        }
        this.lastContentLength = cleanedHtml.length;

        // 4. Process new nodes
        const newContentNodes = allNodes.filter((node, index) => index >= this.lastProcessedLength);

        if (newContentNodes.length > 0) {
            for (const node of newContentNodes) {
                this.processNode(node);
            }
            this.lastProcessedLength = allNodes.length;
        }

        // 5. Update Status Bar & Summary based on latest content
        this.updateStatusAndSummary(temp);

        // 6. Extract File Edits
        this.extractFileEdits(temp);
        this.renderFileChips();

        if (window.lucide) window.lucide.createIcons();
    }

    processNode(node) {
        // Skip empty text nodes
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) return;

        // Skip very short text nodes (intermediate streaming artifacts like "<")
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length < 3) return;

        // Detect Tool Cards
        const isTool = this.isToolNode(node);

        // Detect Headers (Phase Changes)
        const isHeader = this.isHeaderNode(node);

        if (isTool) {
            this.addStep('tool', [node.cloneNode(true)]);
        } else if (isHeader) {
            const title = node.textContent.replace(/^[#\s]+/, '').trim();
            this.addStep('phase', [node.cloneNode(true)], title);
        } else {
            // Text/Thought content - just add as new step
            this.addStep('text', [node.cloneNode(true)]);
        }
    }

    isToolNode(node) {
        return node.nodeType === Node.ELEMENT_NODE && (
            node.classList.contains('tool-card') ||
            node.classList.contains('tool-card-compact') ||
            node.classList.contains('file-edit-card-compact') ||
            node.classList.contains('command-card') ||
            node.classList.contains('list-directory-card') ||
            node.querySelector('.tool-card') ||
            node.querySelector('.tool-card-compact') ||
            node.querySelector('.file-edit-card-compact')
        );
    }

    addStep(type, contentNodes, customTitle = null) {
        // Skip system messages - hide them from the UI
        if (type === 'system') {
            return;
        }

        console.log('[UnifiedTaskCard] addStep called:', { type, nodeCount: contentNodes.length, customTitle });

        // Determine the title for this step
        let displayTitle = customTitle || 'Step';

        if (type === 'tool') {
            const toolNode = contentNodes[0];
            const toolName = toolNode.dataset?.toolName || toolNode.querySelector?.('[data-tool-name]')?.dataset?.toolName || 'Tool';

            // Try to get more context
            let toolContext = '';
            if (toolName === 'view_file' || toolName === 'read_file' || toolName === 'create_file' || toolName === 'update_file') {
                const path = toolNode.dataset?.path || toolNode.querySelector?.('[data-path]')?.dataset?.path;
                if (path) toolContext = path.split(/[/\\]/).pop();
            } else if (toolName === 'run_command') {
                // Try to extract command summary
                const cmdText = toolNode.textContent || '';
                // Simple heuristic: first 2 words or first 20 chars
                toolContext = cmdText.trim().split(/\s+/).slice(0, 2).join(' ');
                if (toolContext.length > 20) toolContext = toolContext.slice(0, 20) + '...';
            }

            displayTitle = toolContext ? `Running: ${toolName} (${toolContext})` : `Running: ${toolName}`;

        } else if (type === 'text' && !customTitle) {
            // Extract summary from text content
            const textContent = contentNodes.map(n => n.textContent).join(' ').trim();
            if (textContent) {
                // Get first sentence or first 50 chars
                const firstSentence = textContent.split(/[.!?\n]/)[0].trim();
                displayTitle = firstSentence.length > 50 ? firstSentence.slice(0, 50) + '...' : firstSentence;
                if (!displayTitle) displayTitle = 'Thinking...';
            } else {
                displayTitle = 'Thinking...';
            }
        } else if (type === 'phase') {
            displayTitle = customTitle || 'Phase';
        }

        console.log('[UnifiedTaskCard] Calling progressList.addItem with title:', displayTitle);

        // Add to progress list
        this.progressList.addItem(type, contentNodes, displayTitle);
        this.currentStepNumber++;
    }


    updateStatusAndSummary(dom) {
        // Update global summary
        // Logic to extract "Working on X..."
        // Update global summary
        // Logic to extract "Working on X..."
        // Status text removed as per user request
    }

    extractFileEdits(dom) {
        const fileCards = dom.querySelectorAll('[data-action="create"], [data-action="update"], [data-action="modify"], .tool-create-btn, .tool-update-btn');
        fileCards.forEach(card => {
            const path = card.dataset.path || card.closest('[data-path]')?.dataset.path;
            if (path) this.filesEdited.add(decodeURIComponent(path));
        });
    }

    renderFileChips() {
        if (this.filesEdited.size === 0) {
            this.filesSection.style.display = 'none';
            return;
        }
        this.filesSection.style.display = 'block';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--text-muted); margin-bottom: 6px;';
        header.textContent = 'Files Edited';

        // Chips Container
        this.fileChipsContainer.innerHTML = '';
        this.fileChipsContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 6px;';

        const files = Array.from(this.filesEdited);
        const maxVisible = 5;
        const visibleFiles = files.slice(0, maxVisible);
        const remaining = files.length - maxVisible;

        visibleFiles.forEach(path => {
            const fileName = path.split('/').pop();
            const ext = fileName.split('.').pop();
            let iconColor = '#888';
            if (ext === 'js' || ext === 'jsx') iconColor = '#f7df1e';
            if (ext === 'ts' || ext === 'tsx') iconColor = '#3178c6';
            if (ext === 'css') iconColor = '#563d7c';
            if (ext === 'html') iconColor = '#e34c26';
            if (ext === 'json') iconColor = '#cbcb41';

            const chip = document.createElement('div');
            chip.className = 'file-chip-compact';
            chip.style.cssText = 'display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--peak-primary); cursor: pointer; padding: 2px 6px; background: transparent; border: 1px solid transparent; opacity: 0.8;';
            chip.innerHTML = `<span style="color: ${iconColor}; font-weight: bold; font-size: 9px;">${ext.toUpperCase()}</span> ${fileName}`;
            chip.title = path;
            chip.onclick = () => window.dispatchEvent(new CustomEvent('peak-open-file', { detail: { path: path } }));
            this.fileChipsContainer.appendChild(chip);
        });

        if (remaining > 0) {
            const moreChip = document.createElement('div');
            moreChip.style.cssText = 'font-size: 11px; color: var(--text-muted); padding: 2px 4px;';
            moreChip.textContent = `+ ${remaining} more`;
            this.fileChipsContainer.appendChild(moreChip);
        }

        this.filesSection.innerHTML = '';
        this.filesSection.appendChild(header);
        this.filesSection.appendChild(this.fileChipsContainer);
    }

    complete() {
        this.status = 'completed';
        this.element.dataset.status = 'completed';
        // No need to mark steps as finished since ProgressList handles this
        // Update Status Bar - Hide it on completion as per user request
        if (this.statusBar) {
            this.statusBar.style.display = 'none';
        }

        if (window.lucide) window.lucide.createIcons();
    }

    // Helpers
    extractTitle(prompt) {
        return typeof prompt === 'string' && prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
    }

    isHeaderNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE && /^H[1-6]$/.test(node.tagName)) return true;
        if (node.nodeType === Node.TEXT_NODE && /^\s*#{1,6}\s+/.test(node.textContent)) return true;
        return false;
    }

    cleanPrompt(prompt) {
        if (!prompt) return '';
        // 1. Remove "Current Project: ... Content:" prefix
        let clean = prompt.replace(/^Current Project:[\s\S]*?Content:\s*/i, '');
        // 2. Remove "Walkthrough: ..." prefix if present
        clean = clean.replace(/^Walkthrough:[\s\S]*?##\s*/i, '');
        // 3. Remove markdown code block delimiters (```)
        clean = clean.replace(/^```\w*\s*/, '').replace(/\s*```$/, '');
        // 4. Remove leading markdown headers (#, ##, etc.)
        clean = clean.replace(/^[#\s]+/, '');
        return clean.trim();
    }

    gitResetToPoint() {
        const event = new CustomEvent('peak-task-reset', {
            detail: { prompt: this.userPrompt, timestamp: this.startTime, commitHash: this.commitHash },
            bubbles: true
        });
        this.element.dispatchEvent(event);
    }
}

module.exports = UnifiedTaskCard;
