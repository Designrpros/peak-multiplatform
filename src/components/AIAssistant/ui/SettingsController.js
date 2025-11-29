/**
 * SettingsController.js
 * Manages the AI Assistant Settings View.
 */

const DocsRegistry = require('../core/DocsRegistry');
const AgentRegistry = require('../core/AgentRegistry');
const { AvailableModels } = require('../../../utils/enums');

class SettingsController {
    constructor() {
        this.container = document.getElementById('ai-assist-settings-content');
        this.activeDocs = this.loadActiveDocs();
        this.init();
    }

    init() {
        this.renderSettings();

        // Listen for agent updates to re-render if needed
        window.addEventListener('peak-agents-updated', () => {
            this.renderSettings();
        });
    }

    loadActiveDocs() {
        const savedDocs = localStorage.getItem('peak-active-docs');
        return savedDocs ? JSON.parse(savedDocs) : DocsRegistry.map(d => d.id);
    }

    saveActiveDocs() {
        localStorage.setItem('peak-active-docs', JSON.stringify(this.activeDocs));
        // Dispatch event to notify ChatView to update its menu
        window.dispatchEvent(new CustomEvent('peak-docs-updated'));
    }

    renderSettings() {
        if (!this.container) return;

        this.container.innerHTML = '';

        // --- AGENT SETTINGS ---
        this.renderAgentSettings();

        // --- DOCS SETTINGS ---
        const docsHeader = document.createElement('div');
        docsHeader.innerHTML = `
            <div style="padding: 16px 0 8px 0; border-bottom: 1px solid var(--border-color); margin-bottom: 8px;">
                <h2 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--peak-primary);">Documentation Sources</h2>
            </div>
        `;
        this.container.appendChild(docsHeader);

        // Group by category
        const categories = {};
        DocsRegistry.forEach(doc => {
            if (!categories[doc.category]) categories[doc.category] = [];
            categories[doc.category].push(doc);
        });

        Object.keys(categories).forEach(cat => {
            const header = document.createElement('div');
            header.className = 'settings-group-header';
            header.textContent = cat;
            header.style.cssText = 'font-size: 11px; font-weight: 600; color: var(--peak-secondary); text-transform: uppercase; margin-top: 16px; margin-bottom: 8px; padding-left: 4px;';
            this.container.appendChild(header);

            categories[cat].forEach(doc => {
                const item = document.createElement('div');
                item.className = 'settings-item';
                item.style.cssText = 'display: flex; align-items: center; padding: 6px 8px; border-radius: 6px; cursor: pointer; transition: background 0.1s;';
                item.onmouseover = () => item.style.background = 'var(--hover-color)';
                item.onmouseout = () => item.style.background = 'transparent';

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `setting-doc-${doc.id}`;
                checkbox.checked = this.activeDocs.includes(doc.id);
                checkbox.style.marginRight = '10px';

                checkbox.addEventListener('change', (e) => {
                    if (e.target.checked) {
                        this.activeDocs.push(doc.id);
                    } else {
                        this.activeDocs = this.activeDocs.filter(id => id !== doc.id);
                    }
                    this.saveActiveDocs();
                });

                const label = document.createElement('label');
                label.htmlFor = `setting-doc-${doc.id}`;
                label.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; font-size: 13px; color: var(--peak-primary);';
                label.innerHTML = `<i data-lucide="${doc.icon}" style="width:14px; height:14px; opacity: 0.7;"></i> ${doc.name}`;

                item.appendChild(checkbox);
                item.appendChild(label);

                // Allow clicking the whole row to toggle
                item.addEventListener('click', (e) => {
                    if (e.target !== checkbox && e.target !== label) {
                        checkbox.click();
                    }
                });

                this.container.appendChild(item);
            });
        });

        if (window.lucide) window.lucide.createIcons();
    }

    renderAgentSettings() {
        const section = document.createElement('div');
        section.style.marginBottom = '24px';

        section.innerHTML = `
            <div style="padding: 0 0 8px 0; border-bottom: 1px solid var(--border-color); margin-bottom: 16px; display:flex; justify-content:space-between; align-items:center;">
                <h2 style="margin: 0; font-size: 14px; font-weight: 600; color: var(--peak-primary);">AI Agents</h2>
                <button id="btn-create-agent" style="padding:4px 8px; background:var(--peak-accent); color:white; border:none; border-radius:4px; font-size:11px; cursor:pointer;">+ New Agent</button>
            </div>
            <div id="agents-list" style="display:flex; flex-direction:column; gap:8px;"></div>
            
            <!-- Edit/Create Modal (Hidden by default) -->
            <div id="agent-editor" style="display:none; margin-top:12px; padding:12px; background:var(--control-background-color); border-radius:6px; border:1px solid var(--border-color);">
                <h3 id="agent-editor-title" style="margin:0 0 12px 0; font-size:12px; color:var(--peak-primary);">Create Agent</h3>
                <input type="hidden" id="edit-agent-id">
                
                <div style="margin-bottom:8px;">
                    <label style="display:block; font-size:10px; color:var(--peak-secondary); margin-bottom:4px;">Name</label>
                    <input type="text" id="edit-agent-name" style="width:100%; padding:4px; background:var(--text-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:12px;">
                </div>
                
                <div style="margin-bottom:8px;">
                    <label style="display:block; font-size:10px; color:var(--peak-secondary); margin-bottom:4px;">Model</label>
                    <select id="edit-agent-model" style="width:100%; padding:4px; background:var(--text-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:12px;">
                        ${AvailableModels.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                    </select>
                </div>
                
                <div style="margin-bottom:8px;">
                    <label style="display:block; font-size:10px; color:var(--peak-secondary); margin-bottom:4px;">System Prompt</label>
                    <textarea id="edit-agent-prompt" rows="6" style="width:100%; padding:4px; background:var(--text-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:11px; font-family:monospace;"></textarea>
                    <div style="font-size:9px; color:var(--peak-secondary); margin-top:2px;">Variables: \${window.currentProjectRoot}, \${projectData.title}</div>
                </div>

                <div style="margin-bottom:8px; display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" id="edit-agent-auto-review">
                    <label for="edit-agent-auto-review" style="font-size:11px; color:var(--peak-primary);">Enable Auto-Review (Requires Reviewer Agent)</label>
                </div>
                
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
                    <button id="btn-cancel-agent" style="padding:4px 12px; background:transparent; border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:11px; cursor:pointer;">Cancel</button>
                    <button id="btn-save-agent" style="padding:4px 12px; background:var(--peak-accent); border:none; color:white; border-radius:4px; font-size:11px; cursor:pointer;">Save</button>
                </div>
            </div>
        `;

        this.container.appendChild(section);

        this.renderAgentsList(section.querySelector('#agents-list'));
        this.attachAgentListeners(section);
    }

    renderAgentsList(container) {
        container.innerHTML = '';
        const agents = AgentRegistry.getAgents();

        agents.forEach(agent => {
            const item = document.createElement('div');
            item.className = 'agent-item';
            item.style.cssText = 'padding:8px; border:1px solid var(--border-color); border-radius:6px; background:var(--window-background-color); display:flex; justify-content:space-between; align-items:center;';

            item.innerHTML = `
                <div>
                    <div style="font-size:12px; font-weight:600; color:var(--peak-primary);">${agent.name} ${agent.isDefault ? '<span style="font-size:9px; opacity:0.6; font-weight:normal;">(Default)</span>' : ''}</div>
                    <div style="font-size:10px; color:var(--peak-secondary); margin-top:2px;">${agent.description || 'No description'}</div>
                </div>
                <div style="display:flex; gap:4px;">
                    <button class="icon-btn edit-agent-btn" data-id="${agent.id}" title="Edit" style="padding:4px; background:transparent; border:none; color:var(--peak-secondary); cursor:pointer;"><i data-lucide="pencil" style="width:12px; height:12px;"></i></button>
                    ${!agent.isSystem ? `<button class="icon-btn delete-agent-btn" data-id="${agent.id}" title="Delete" style="padding:4px; background:transparent; border:none; color:var(--error-color); cursor:pointer;"><i data-lucide="trash-2" style="width:12px; height:12px;"></i></button>` : ''}
                </div>
            `;

            container.appendChild(item);
        });
    }

    attachAgentListeners(section) {
        const editor = section.querySelector('#agent-editor');
        const list = section.querySelector('#agents-list');
        const btnCreate = section.querySelector('#btn-create-agent');
        const btnCancel = section.querySelector('#btn-cancel-agent');
        const btnSave = section.querySelector('#btn-save-agent');

        // Inputs
        const inputId = section.querySelector('#edit-agent-id');
        const inputName = section.querySelector('#edit-agent-name');
        const inputModel = section.querySelector('#edit-agent-model');
        const inputPrompt = section.querySelector('#edit-agent-prompt');
        const inputAutoReview = section.querySelector('#edit-agent-auto-review');
        const title = section.querySelector('#agent-editor-title');

        const openEditor = (agent = null) => {
            editor.style.display = 'block';
            list.style.display = 'none';
            btnCreate.style.display = 'none';

            if (agent) {
                title.textContent = 'Edit Agent';
                inputId.value = agent.id;
                inputName.value = agent.name;
                inputModel.value = agent.modelId;
                inputPrompt.value = agent.systemPrompt;
                inputAutoReview.checked = agent.autoReview || false;
            } else {
                title.textContent = 'Create Agent';
                inputId.value = '';
                inputName.value = 'New Agent';
                inputModel.value = 'openrouter/auto';
                inputPrompt.value = 'You are a helpful assistant.';
                inputAutoReview.checked = false;
            }
        };

        const closeEditor = () => {
            editor.style.display = 'none';
            list.style.display = 'flex';
            btnCreate.style.display = 'block';
        };

        btnCreate.addEventListener('click', () => openEditor());
        btnCancel.addEventListener('click', () => closeEditor());

        btnSave.addEventListener('click', () => {
            const agent = {
                id: inputId.value || null,
                name: inputName.value,
                description: 'Custom Agent', // Could add field for this
                modelId: inputModel.value,
                systemPrompt: inputPrompt.value,
                autoReview: inputAutoReview.checked,
                isDefault: false,
                isSystem: false
            };

            AgentRegistry.saveAgent(agent);
            this.renderAgentsList(list);
            closeEditor();

            // Force refresh of dropdown in ChatView (handled by window event if implemented, or we can dispatch one)
            // AgentRegistry.saveAgent already dispatches 'peak-agents-updated'
        });

        // Delegation for Edit/Delete
        list.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-agent-btn');
            const deleteBtn = e.target.closest('.delete-agent-btn');

            if (editBtn) {
                const id = editBtn.dataset.id;
                const agent = AgentRegistry.getAgent(id);
                openEditor(agent);
            } else if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                if (confirm('Are you sure you want to delete this agent?')) {
                    AgentRegistry.deleteAgent(id);
                    this.renderAgentsList(list);
                }
            }
        });
    }

    destroy() {
        this.container = null;
    }
}

module.exports = SettingsController;
