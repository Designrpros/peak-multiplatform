/**
 * TaskCard.js
 * Represents a single "Unit of Work" or "Session" in the chat.
 * Groups user request, AI steps (thinking, tools), and final output into a cohesive card.
 */

class TaskCard {
    constructor(userPrompt, agentId = 'general') {
        this.userPrompt = userPrompt;
        this.agentId = agentId;
        this.startTime = Date.now();
        this.status = 'active'; // active, completed, error
        this.steps = []; // Array of { type, content, status, element }
        this.lastParsedContent = '';
        this.status = 'active'; // active, completed, error
        this.steps = []; // Array of { type, content, status, element }
        this.lastParsedContent = '';
        this.previousStepCount = 0; // Track steps from previous turns
        this.turnCount = 1; // Track the current turn number

        // Create Main Element
        this.element = document.createElement('div');
        this.element.className = 'task-card';
        this.element.style.cssText = `
            margin-bottom: 16px;
            background: var(--window-background-color);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        `;

        this.renderInitialStructure();
    }

    renderInitialStructure() {
        // 1. Header (Live Summary)
        this.header = document.createElement('div');
        this.header.className = 'task-card-header';
        this.header.style.cssText = `
            padding: 12px 16px;
            background: var(--control-background-color);
            border-bottom: 1px solid var(--border-color);
            display: flex;
            align-items: center;
            gap: 10px;
        `;
        this.header.innerHTML = `
            <div class="task-spinner" style="width: 14px; height: 14px; border: 2px solid var(--peak-accent); border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="flex: 1; font-size: 12px; font-weight: 600; color: var(--peak-primary);">Processing request...</div>
            <div style="font-size: 10px; color: var(--peak-secondary);">${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        `;

        // 2. Body (Steps)
        this.body = document.createElement('div');
        this.body.className = 'task-card-body';
        this.body.style.cssText = 'padding:0; display:flex; flex-direction:column; gap:0px;';

        // Live Phase Indicator
        this.phaseIndicator = document.createElement('div');
        this.phaseIndicator.className = 'phase-indicator';
        this.phaseIndicator.style.cssText = 'padding: 8px 12px; font-size: 11px; font-weight: 600; color: var(--peak-accent); background: var(--peak-hover-bg); border-bottom: 1px solid var(--peak-border); display: none; letter-spacing: 0.5px; text-transform: uppercase;';

        // 3. Footer (Output)
        this.footer = document.createElement('div');
        this.footer.className = 'task-card-footer';
        this.footer.style.cssText = 'padding:12px; font-size:13px; line-height:1.5; color:var(--peak-text); border-top:1px solid var(--peak-border); display:none;';

        // User Prompt Section (Optional, maybe at top or separate?)
        // The user request is usually the "Title" of the task context.
        // Let's add it above the header or integrated.
        // For now, let's keep it simple: The TaskCard IS the response container.
        // The user message bubble is separate in ChatView? 
        // The prompt says: "User Request -> One Dynamic Card".
        // So maybe we should include the user request IN the card?
        // Let's try to include it as a "Context" section at the top.

        const contextSection = document.createElement('div');
        contextSection.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid var(--border-color);
            background: var(--window-background-color);
            font-size: 13px;
            color: var(--peak-primary);
        `;
        // Handle multimodal prompt
        if (Array.isArray(this.userPrompt)) {
            const textPart = this.userPrompt.find(p => p.type === 'text')?.text || '';
            const images = this.userPrompt.filter(p => p.type === 'image_url');
            let html = '';
            if (images.length > 0) {
                html += `<div style="display:flex; gap:8px; margin-bottom:8px;">${images.map(img => `<img src="${img.image_url.url}" style="height:40px; border-radius:4px;">`).join('')}</div>`;
            }
            html += `<div>${textPart}</div>`;
            contextSection.innerHTML = html;
        } else {
            contextSection.textContent = this.userPrompt;
        }

        this.element.appendChild(contextSection);
        this.element.appendChild(this.header);
        this.element.appendChild(this.body);
        this.element.appendChild(this.footer);

        // Add styles for animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            .step-item { padding: 8px 16px; border-bottom: 1px solid var(--border-color); font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
            .step-item:last-child { border-bottom: none; }
            .step-header { display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; }
            .step-content { margin-left: 0; margin-top: 8px; display: none; }
            .step-content.expanded { display: block; }
            .step-icon { width: 12px; height: 12px; }
        `;
        this.element.appendChild(style);
    }

    update(fullHtml) {
        // AGGRESSIVE PRE-FILTER: Remove tool definition blocks from raw HTML
        // Strip out everything between <tool_definition> tags (including the tags themselves)
        let cleanedHtml = fullHtml;

        // Remove tool_definition blocks
        cleanedHtml = cleanedHtml.replace(/<tool_definition>[\s\S]*?<\/tool_definition>/gi, '');

        // Remove any remaining system instruction signatures
        cleanedHtml = cleanedHtml.replace(/Start working now\. Use tools immediately\./gi, '');

        // 1. Parse Full HTML
        const temp = document.createElement('div');
        temp.innerHTML = cleanedHtml;
        const children = Array.from(temp.children);

        // 2. Split into Phases
        // We scan the children and group them by Phase Headers
        const phases = [];
        let currentPhaseContent = [];
        let currentPhaseTitle = 'Initialization'; // Default start

        // Check if first child is a phase header?
        // Usually LLM outputs "## PHASE 1: PLAN" as text (h2 or p)

        // Helper function to normalize phase titles (remove continuation markers)
        const normalizePhaseTitle = (title) => {
            return title.replace(/\s*\((?:Cont(?:inuation)?\.?|Continued)\)\s*/i, '').trim();
        };

        const processChild = (child) => {
            // Unwrap markdown-content containers
            if (child.classList && child.classList.contains('markdown-content')) {
                Array.from(child.children).forEach(subChild => processChild(subChild));
                return;
            }


            // Filter out internal/system tags and tool definitions
            // Check tagName, innerHTML, and textContent for tool definitions
            if (child.tagName === 'TOOL_DEFINITION') return;
            if (child.innerHTML && (child.innerHTML.includes('&lt;tool_definition&gt;') || child.innerHTML.includes('<tool_definition>'))) return;
            if (child.textContent) {
                const text = child.textContent;
                // Filter if contains tool definition tags
                if (text.includes('<tool_definition>')) return;
                // Filter if contains multiple tool usage patterns (likely a tool definitions block)
                if (text.includes('<usage>') && text.includes('</usage>') && text.includes('<description>')) return;
                // Filter if it starts with system instruction text
                if (text.includes('Start working now. Use tools immediately.')) return;
            }

            // Filter empty nodes (whitespace only)
            if (!child.textContent.trim() && child.children.length === 0 && !child.tagName.match(/IMG|HR|BR/)) return;

            // Check for Phase Header
            const text = child.textContent.trim();
            // Robust regex to catch "PHASE X: TITLE" even if surrounded by markdown chars or whitespace
            const headerMatch = text.match(/(?:^|[\s#*]+)(PHASE\s+\d+:.+?)(?:$|[\s*]+)/i);

            if (headerMatch) {
                // Found a new phase start!
                // Push previous phase if it has content
                if (currentPhaseContent.length > 0 || currentPhaseTitle !== 'Initialization') {
                    phases.push({ title: currentPhaseTitle, nodes: currentPhaseContent });
                }

                // Start new phase - NORMALIZE the title here to prevent duplicates
                currentPhaseTitle = normalizePhaseTitle(headerMatch[1]);
                currentPhaseContent = [];

                // We DON'T add the header element itself to the content
            } else {
                currentPhaseContent.push(child);
            }
        };

        children.forEach(child => processChild(child));

        // Push the last phase
        if (currentPhaseContent.length > 0 || currentPhaseTitle !== 'Initialization') {
            phases.push({ title: currentPhaseTitle, nodes: currentPhaseContent });
        }

        // MERGE INITIALIZATION PHASE
        // If the first phase is 'Initialization' and we have other phases, merge it into the first real phase.
        if (phases.length > 1 && phases[0].title === 'Initialization') {
            const initNodes = phases.shift().nodes;
            // Prepend to the new first phase
            phases[0].nodes = [...initNodes, ...phases[0].nodes];
        } else if (phases.length === 1 && phases[0].title === 'Initialization') {
            // If ONLY initialization exists, maybe rename it or keep it?
            // User said "remove initialization phase".
            // Let's rename it to "Overview" or just hide the header if we could.
            // For now, let's keep it but maybe the merge logic above handles the main complaint.
        }

        // 3. Sync Phases with DOM
        // We iterate through our detected phases and ensure a PhaseGroup exists for each.

        phases.forEach(phaseData => {
            // Check if we already have this phase group
            let phaseGroup = Array.from(this.body.children).find(el => el.dataset.title === phaseData.title);

            if (!phaseGroup) {
                // Create new Phase Group
                this.startNewPhase(phaseData.title);
                phaseGroup = this.currentPhase;
            } else {
                // Ensure it is the current phase if it's the last one
                // Actually, startNewPhase sets this.currentPhase.
                // If we are updating an old phase, we don't necessarily want to make it active?
                // But usually we process linearly.
            }

            // Sync Content for this Phase
            const contentContainer = phaseGroup.querySelector('.phase-content');
            const groupedNodes = this.groupNodes(phaseData.nodes);
            this.syncContent(contentContainer, groupedNodes);
        });

        // 4. Update Header Status (Live)
        const lastPhase = phases[phases.length - 1];
        if (lastPhase) {
            this.updateHeaderStatus(lastPhase.title);
        }

        if (window.lucide) window.lucide.createIcons();
    }

    groupNodes(nodes) {
        const grouped = [];
        let lastGroup = null;

        nodes.forEach(node => {
            const type = this.detectStepType(node);

            // Check for merge
            let shouldMerge = false;
            if (lastGroup && lastGroup.type === 'message' && type === 'message') {
                // Check merge criteria
                const lastNode = lastGroup.nodes[lastGroup.nodes.length - 1];

                // 1. Colon Rule: Text ending in colon usually introduces the next item
                if (lastNode.textContent.trim().endsWith(':')) {
                    shouldMerge = true;
                }
                // 2. List Rule: Lists usually belong to the preceding text
                else if (node.tagName === 'UL' || node.tagName === 'OL') {
                    shouldMerge = true;
                }
                // 3. Short Header Rule: Very short text (like "Step 1") followed by something
                else if (lastNode.textContent.trim().length < 30 && !lastNode.tagName.match(/H\d/)) {
                    // Maybe too aggressive? Let's stick to Colon and List for now.
                }
            }

            if (shouldMerge) {
                lastGroup.nodes.push(node);
            } else {
                lastGroup = { type, nodes: [node] };
                grouped.push(lastGroup);
            }
        });

        return grouped.map(group => {
            if (group.nodes.length === 1) return group.nodes[0];

            // Create a wrapper for the group
            const wrapper = document.createElement('div');
            wrapper.className = 'grouped-content';
            group.nodes.forEach(n => wrapper.appendChild(n.cloneNode(true)));
            return wrapper;
        });
    }

    syncContent(domContainer, newNodes) {
        let domIndex = 0;
        let newIndex = 0;
        const domChildren = Array.from(domContainer.children);

        while (newIndex < newNodes.length) {
            const newNode = newNodes[newIndex];
            const domNode = domChildren[domIndex];

            // 1. SKIP SYSTEM/USER NODES (Injected)
            // These are nodes we added manually (like directory listings or user messages)
            // They won't be in the LLM's output stream, so we must preserve them.
            if (domNode && (domNode.dataset.type === 'system' || domNode.dataset.type === 'user')) {
                domIndex++;
                continue;
            }

            // 2. Append if no DOM node left
            if (!domNode) {
                // Clone to avoid moving from temp
                domContainer.appendChild(this.createStepFromNode(newNode));
                newIndex++;
                continue;
            }

            // 3. Compare & Update
            // We try to match by type.
            // Note: createStepFromNode wraps the raw node in a .step-item structure.
            // So we need to compare the *content* of the step item.

            // Heuristic: If types match, update.
            // But wait, newNode is a raw element from StreamParser (e.g. <div class="tool-card">...</div> or <p>Text</p>)
            // domNode is a <div class="step-item">...</div>

            // Let's check the type of newNode
            const newType = this.detectStepType(newNode);
            const currentType = domNode.dataset.type;

            if (newType === currentType) {
                // Update content
                const contentArea = domNode.querySelector('.step-content');
                if (contentArea.innerHTML !== newNode.outerHTML) {
                    contentArea.innerHTML = '';
                    contentArea.appendChild(newNode.cloneNode(true));
                    // Update header if needed (e.g. thinking done)
                    this.updateStepHeader(domNode, newType, newNode);
                }
                domIndex++;
                newIndex++;
            } else {
                // Mismatch: Insert new node here
                domContainer.insertBefore(this.createStepFromNode(newNode), domNode);
                newIndex++;
                // Don't increment domIndex
            }
        }
    }

    detectStepType(node) {
        if (node.classList.contains('thinking-card')) return 'thinking';
        if (node.classList.contains('tool-card') || node.classList.contains('command-card') || node.classList.contains('response-card')) return 'tool';
        return 'message'; // Default to text message
    }

    createStepFromNode(node) {
        const type = this.detectStepType(node);
        const step = document.createElement('div');
        step.className = 'step-item';
        step.dataset.type = type;

        let icon = 'message-square';
        let title = 'AI Message';
        let isCollapsible = true;

        if (type === 'thinking') {
            icon = 'brain-circuit';
            title = 'Reasoning';
            const isDone = node.querySelector('.thinking-header')?.textContent.includes('Thought for');
            if (isDone) icon = 'check-circle';
        } else if (type === 'tool') {
            icon = 'hammer';
            const toolHeader = node.querySelector('.card-header, .tool-header');
            if (toolHeader) title = toolHeader.textContent.trim();
            else title = 'Tool Execution';
        }

        step.innerHTML = `
            <div class="step-header">
                <i data-lucide="${icon}" class="step-icon" style="color: var(--peak-secondary);"></i>
                <span class="step-title" style="color: var(--peak-secondary);">${title}</span>
                <i data-lucide="chevron-down" style="width: 10px; height: 10px; margin-left: auto; opacity: 0.5;"></i>
            </div>
            <div class="step-content expanded"></div>
        `;

        step.querySelector('.step-content').appendChild(node.cloneNode(true));

        step.querySelector('.step-header').onclick = () => {
            const content = step.querySelector('.step-content');
            content.classList.toggle('expanded');
            const chevron = step.querySelector('[data-lucide="chevron-down"]');
            if (chevron) chevron.style.transform = content.classList.contains('expanded') ? 'rotate(180deg)' : 'none';
        };

        return step;
    }

    updateStepHeader(stepElement, type, contentElement) {
        let icon = 'circle';
        let title = 'Step';

        if (type === 'thinking') {
            icon = 'brain-circuit';
            title = 'Reasoning';
            const isDone = contentElement.querySelector('.thinking-header')?.textContent.includes('Thought for');
            if (isDone) icon = 'check-circle';
        } else if (type === 'tool') {
            icon = 'hammer';
            const toolHeader = contentElement.querySelector('.card-header, .tool-header');
            if (toolHeader) title = toolHeader.textContent.trim();
            else title = 'Tool Execution';
        }

        // Update DOM
        const iconEl = stepElement.querySelector('.step-icon');
        const titleEl = stepElement.querySelector('.step-title');

        if (iconEl) iconEl.setAttribute('data-lucide', icon);
        if (titleEl) titleEl.textContent = title;
    }



    // --- PHASE MANAGEMENT ---

    startNewPhase(title) {
        // Normalize title: remove "(Cont.)", "(continued)", "(Continuation)", etc. and trim
        const normalizedTitle = title.replace(/\s*\((?:Cont(?:inuation)?\.?|Continued)\)\s*/i, '').trim();

        // Prevent duplicate phase creation if we are already in this phase
        if (this.currentPhase && this.currentPhase.dataset.title === normalizedTitle) {
            return;
        }

        // Check if the last existing phase matches (in case currentPhase was lost or reset)
        const lastPhase = this.body.lastElementChild;
        if (lastPhase && lastPhase.dataset.title === normalizedTitle) {
            this.currentPhase = lastPhase;
            this.currentPhaseContent = lastPhase.querySelector('.phase-content');
            return;
        }

        console.log('[TaskCard] Starting New Phase:', normalizedTitle);
        title = normalizedTitle;

        // If we already have a current phase with the same title, do nothing
        if (this.currentPhase && this.currentPhase.dataset.title === title) {
            return;
        }

        // Collapse previous phase
        if (this.currentPhase) {
            const content = this.currentPhase.querySelector('.phase-content');
            const icon = this.currentPhase.querySelector('.phase-toggle-icon');

            // GENERATE SUMMARY for the completing phase
            this.generatePhaseSummary(this.currentPhase);

            if (content) content.style.display = 'none';
            if (icon) icon.style.transform = 'rotate(-90deg)';

            // Mark as complete visually?
            // User said "keeping the phase 1 header row in tact as a toggable"
            // Maybe add a checkmark to the header?
            const headerIcon = this.currentPhase.querySelector('.phase-header-icon');
            if (headerIcon) headerIcon.setAttribute('data-lucide', 'check-circle-2');
        }

        // Create New Phase Group
        const phaseGroup = document.createElement('div');
        phaseGroup.className = 'phase-group';
        phaseGroup.dataset.title = title;
        // Subtle separator
        phaseGroup.style.cssText = 'border-bottom: 1px solid rgba(255, 255, 255, 0.05); margin-bottom: 4px; padding-bottom: 4px;';

        // Header
        const header = document.createElement('div');
        header.className = 'phase-header';
        // Tidy & Compact: Reduced padding, subtle background, transition
        header.style.cssText = 'padding: 6px 10px; background: rgba(255, 255, 255, 0.03); cursor: pointer; display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 600; color: var(--peak-primary); user-select: none; border-bottom: 1px solid transparent; transition: all 0.2s; border-radius: 4px; margin: 2px 0;';

        // Hide Initialization Header if requested
        if (title === 'Initialization') {
            header.style.display = 'none';
            phaseGroup.style.borderBottom = 'none';
            phaseGroup.style.marginBottom = '0';
        }

        header.onmouseover = () => header.style.background = 'var(--peak-hover-bg)';
        header.onmouseout = () => header.style.background = 'rgba(255, 255, 255, 0.03)';

        header.innerHTML = `
            <i data-lucide="circle-dashed" class="phase-header-icon" style="width: 14px; height: 14px; color: var(--peak-accent); opacity: 0.8;"></i>
            <span style="flex: 1; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; opacity: 0.9;">${title}</span>
            <i data-lucide="chevron-down" class="phase-toggle-icon" style="width: 14px; height: 14px; color: var(--peak-secondary); transition: transform 0.2s;"></i>
        `;

        // Content Body
        const content = document.createElement('div');
        content.className = 'phase-content';
        // Indent content with a subtle guide line
        content.style.cssText = 'display: flex; flex-direction: column; padding-left: 8px; border-left: 1px solid rgba(255, 255, 255, 0.05); margin-left: 16px; margin-top: 4px;';

        // Toggle Logic
        header.onclick = () => {
            const isHidden = content.style.display === 'none';
            content.style.display = isHidden ? 'flex' : 'none';
            header.querySelector('.phase-toggle-icon').style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
        };

        phaseGroup.appendChild(header);
        phaseGroup.appendChild(content);

        this.body.appendChild(phaseGroup);
        this.currentPhase = phaseGroup;
        this.currentPhaseContent = content;

        if (window.lucide) window.lucide.createIcons();
    }

    generatePhaseSummary(phaseGroup) {
        // Clear existing summary if any (to prevent duplicates)
        const existingSummary = phaseGroup.querySelector('.phase-summary-block');
        if (existingSummary) existingSummary.remove();

        // Analyze content to generate a structured summary log
        const content = phaseGroup.querySelector('.phase-content');
        if (!content) return;

        const stats = {
            summary: '',
            artifacts: [],
            tree: false,
            openedFiles: new Set(),
            commands: [],
            modifiedFiles: new Map(), // path -> { added: 0, removed: 0 }
            createdFiles: new Set(),
        };

        // 1. Extract Summary Text (First non-empty text node)
        // We look for the first 'message' step
        const firstMsg = content.querySelector('.step-item[data-type="message"] .step-content');
        if (firstMsg) {
            // Get first paragraph or line
            const text = firstMsg.textContent.trim();
            // Increased limit to 500 chars to avoid aggressive truncation
            stats.summary = text.split('\n')[0].substring(0, 500) + (text.length > 500 ? '...' : '');
        }

        // 2. Analyze Tools
        const toolSteps = content.querySelectorAll('.step-item[data-type="tool"]');
        toolSteps.forEach(step => {
            const toolCard = step.querySelector('.tool-card, .command-card, .file-edit-card');
            if (!toolCard) return;

            // List Directory
            if (toolCard.textContent.includes('list_directory') || toolCard.dataset.cmd?.includes('ls -R')) {
                stats.tree = true;
            }

            // View File
            if (toolCard.textContent.includes('view_file') || toolCard.textContent.includes('read_file')) {
                const path = toolCard.dataset.path || toolCard.querySelector('.file-path')?.textContent;
                if (path) stats.openedFiles.add(path.split('/').pop());
            }

            // Commands
            if (toolCard.classList.contains('command-card')) {
                const cmd = toolCard.dataset.cmd;
                if (cmd && !cmd.startsWith('ls ') && !cmd.startsWith('cat ')) {
                    stats.commands.push(cmd);
                }
            }

            // File Edits (Replace/Write)
            if (toolCard.classList.contains('file-edit-card') || toolCard.dataset.tool === 'replace_file_content' || toolCard.dataset.tool === 'write_to_file') {
                const path = toolCard.dataset.path || toolCard.querySelector('.file-path')?.textContent;
                const filename = path ? path.split('/').pop() : 'unknown';

                // Check if created
                if (toolCard.dataset.tool === 'write_to_file' && !toolCard.textContent.includes('Overwrite: true')) {
                    stats.createdFiles.add(filename);
                } else {
                    if (!stats.modifiedFiles.has(filename)) {
                        stats.modifiedFiles.set(filename, { added: 0, removed: 0 });
                    }
                }

                // Check for Artifacts
                if (filename === 'task.md' || filename === 'implementation_plan.md' || filename === 'walkthrough.md') {
                    stats.artifacts.push(filename);
                }
            }
        });

        // Render the Summary Block
        this.renderPhaseSummary(phaseGroup, stats);
    }

    renderPhaseSummary(phaseGroup, stats) {
        const summaryBlock = document.createElement('div');
        summaryBlock.className = 'phase-summary-block';
        // Tidy & Compact: Simple list, indented to align with content
        summaryBlock.style.cssText = 'margin: 8px 12px 12px 28px; padding: 0; font-size: 11px; color: var(--peak-secondary);';

        let html = `<div style="font-weight: 600; margin-bottom: 4px; color: var(--peak-primary); text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px;">Summary</div>`;
        html += `<ul style="margin: 0; padding-left: 14px; list-style-type: disc; line-height: 1.4;">`;

        if (stats.summary) {
            html += `<li style="margin-bottom: 2px;">${stats.summary}</li>`;
        }
        if (stats.tree) {
            html += `<li style="margin-bottom: 2px;">Analyzed directory structure</li>`;
        }
        if (stats.openedFiles.size > 0) {
            html += `<li style="margin-bottom: 2px;">Read ${stats.openedFiles.size} files: <span style="opacity: 0.8;">${Array.from(stats.openedFiles).slice(0, 3).join(', ')}${stats.openedFiles.size > 3 ? '...' : ''}</span></li>`;
        }
        if (stats.createdFiles.size > 0) {
            html += `<li style="margin-bottom: 2px; color: var(--peak-success);">Created: ${Array.from(stats.createdFiles).join(', ')}</li>`;
        }
        if (stats.modifiedFiles.size > 0) {
            const mods = Array.from(stats.modifiedFiles.keys()).filter(f => !stats.artifacts.includes(f));
            if (mods.length > 0) {
                html += `<li style="margin-bottom: 2px; color: var(--peak-warning);">Modified: ${mods.join(', ')}</li>`;
            }
        }
        if (stats.artifacts.length > 0) {
            html += `<li style="margin-bottom: 2px; color: var(--peak-accent);">Updated Artifacts: ${[...new Set(stats.artifacts)].join(', ')}</li>`;
        }
        if (stats.commands.length > 0) {
            html += `<li style="margin-bottom: 2px;">Ran commands: <code style="font-size: 10px; background: rgba(255,255,255,0.1); padding: 1px 3px; border-radius: 3px;">${stats.commands[0]}</code>${stats.commands.length > 1 ? ` (+${stats.commands.length - 1} more)` : ''}</li>`;
        }

        html += `</ul>`;
        summaryBlock.innerHTML = html;

        phaseGroup.appendChild(summaryBlock);
    }

    addStep(type, contentElement) {
        // Ensure we have a phase
        if (!this.currentPhase) {
            this.startNewPhase('Initialization');
        }

        // Handle User Message -> New Phase
        if (type === 'user') {
            this.startNewPhase('User Request');
            // Add user message to the NEW phase
        }

        const step = document.createElement('div');
        step.className = 'step-item';
        step.dataset.type = type;

        let icon = 'circle';
        let title = 'Step';
        let isCollapsible = true;

        if (type === 'thinking') {
            icon = 'brain-circuit';
            title = 'Reasoning';
            const isDone = contentElement.querySelector('.thinking-header')?.textContent.includes('Thought for');
            if (isDone) icon = 'check-circle';
        } else if (type === 'tool') {
            icon = 'hammer';
            const toolHeader = contentElement.querySelector('.card-header, .tool-header');
            if (toolHeader) title = toolHeader.textContent.trim();
            else title = 'Tool Execution';
        } else if (type === 'message') {
            icon = 'message-square';
            title = 'AI Message';
            isCollapsible = true;
        } else if (type === 'system') {
            icon = 'terminal';
            title = 'System Output';
            isCollapsible = true;

            // Collapsible wrapper for system output
            const details = document.createElement('details');
            details.style.cssText = 'width:100%; border:1px solid var(--peak-border); border-radius:6px; overflow:hidden; background:var(--peak-card-bg);';
            const summary = document.createElement('summary');
            summary.style.cssText = 'padding:8px 12px; cursor:pointer; font-size:12px; font-weight:500; color:var(--peak-secondary); user-select:none; display:flex; align-items:center; gap:6px;';
            summary.innerHTML = `<i data-lucide="terminal" style="width:12px; height:12px;"></i> System Output`;
            const contentDiv = document.createElement('div');
            contentDiv.style.cssText = 'padding:10px; border-top:1px solid var(--peak-border); background:var(--peak-bg); font-family:monospace; font-size:11px; overflow-x:auto;';
            contentDiv.appendChild(contentElement);
            details.appendChild(summary);
            details.appendChild(contentDiv);
            contentElement = details;

        } else if (type === 'user') {
            icon = 'user';
            title = 'User Request';
            isCollapsible = true;
        }

        step.innerHTML = `
            <div class="step-header">
                <i data-lucide="${icon}" class="step-icon" style="color: var(--peak-secondary);"></i>
                <span class="step-title" style="color: var(--peak-secondary);">${title}</span>
                <i data-lucide="chevron-down" style="width: 10px; height: 10px; margin-left: auto; opacity: 0.5;"></i>
            </div>
            <div class="step-content expanded"></div>
        `;

        const contentContainer = step.querySelector('.step-content');
        contentContainer.appendChild(contentElement);

        step.querySelector('.step-header').onclick = () => {
            contentContainer.classList.toggle('expanded');
            const chevron = step.querySelector('[data-lucide="chevron-down"]');
            if (chevron) chevron.style.transform = contentContainer.classList.contains('expanded') ? 'rotate(180deg)' : 'none';
        };

        // Append to CURRENT PHASE CONTENT
        this.currentPhaseContent.appendChild(step);
    }

    updateHeaderStatus(text) {
        const statusDiv = this.header.querySelector('div:nth-child(2)');
        if (statusDiv) statusDiv.textContent = text;
    }

    updateFooter(content) {
        if (!content) {
            this.footer.style.display = 'none';
            this.phaseIndicator.style.display = 'none';
            return;
        }

        // Check for Phase Header in content
        const headerMatch = content.match(/^(?:#+\s+)?(PHASE\s+\d+:.+)$/m) || content.match(/^#+\s+(.+)$/m);
        if (headerMatch) {
            const phaseTitle = headerMatch[1];
            this.phaseIndicator.textContent = phaseTitle;
            this.phaseIndicator.style.display = 'block';

            // Trigger New Phase
            this.startNewPhase(phaseTitle);
        }

        this.footer.style.display = 'block';
        this.footer.innerHTML = marked.parse(content);

        // Ensure links open externally
        this.footer.querySelectorAll('a').forEach(a => a.target = '_blank');
    }

    complete() {
        this.status = 'completed';
        const spinner = this.header.querySelector('.task-spinner');
        if (spinner) spinner.remove();

        // Add checkmark
        const icon = this.header.querySelector('[data-lucide="loader-2"]');
        if (icon) {
            icon.setAttribute('data-lucide', 'check-circle-2');
            icon.style.color = 'var(--peak-success)';
            icon.style.animation = 'none';
        }

        // Generate summary for the last phase
        if (this.currentPhase) {
            this.generatePhaseSummary(this.currentPhase);
        }

        // Show Completion Footer
        this.footer.style.display = 'block';
        this.footer.innerHTML = `<div style="display:flex; align-items:center; gap:8px; color:var(--peak-success); font-weight:500;"><i data-lucide="check-circle" style="width:14px; height:14px;"></i> Task Completed</div>`;

        if (window.lucide) window.lucide.createIcons();
    }

}

module.exports = TaskCard;
