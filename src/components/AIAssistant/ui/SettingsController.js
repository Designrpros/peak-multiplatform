/**
 * SettingsController.js
 * Manages the Peak Assistant Settings View.
 */

const DocsRegistry = require('../core/DocsRegistry');
const AgentRegistry = require('../core/AgentRegistry');
const SettingsManager = require('../core/SettingsManager');
const { AvailableModels } = require('../../../utils/enums');

class SettingsController {
    constructor() {
        this.container = document.getElementById('ai-assist-settings-content');
        this.activeDocs = this.loadActiveDocs();
        this.activeTab = 'general';
        this.init();
    }

    init() {
        this.renderSettings();

        // Listen for agent updates to re-render if needed
        this._handleAgentsUpdated = () => {
            if (this.activeTab === 'agents') {
                const list = document.getElementById('agents-list');
                if (list) this.renderAgentsList(list);
            }
        };
        window.addEventListener('peak-agents-updated', this._handleAgentsUpdated);
    }

    render() {
        // If we are called with an instance (prototype.render.call(new SettingsController())),
        // we can just return the innerHTML of what would be rendered.
        // But renderSettings() modifies this.container.
        // We need a way to return the HTML string without attaching to DOM immediately if called this way.

        // Mock a container if we don't have one
        const mockContainer = document.createElement('div');
        this.container = mockContainer;
        this.renderSettings();
        return mockContainer.innerHTML;
    }

    destroy() {
        if (this._handleAgentsUpdated) {
            window.removeEventListener('peak-agents-updated', this._handleAgentsUpdated);
        }
        if (this.settingsUnsub) {
            this.settingsUnsub(); // Unsubscribe from SettingsManager
        }
        this.container = null;
    }

    loadActiveDocs() {
        const savedDocs = localStorage.getItem('peak-active-docs');
        return savedDocs ? JSON.parse(savedDocs) : DocsRegistry.map(d => d.id);
    }

    saveActiveDocs() {
        localStorage.setItem('peak-active-docs', JSON.stringify(this.activeDocs));
        window.dispatchEvent(new CustomEvent('peak-docs-updated'));
    }

    renderSettings() {
        if (!this.container) return;

        this.container.innerHTML = '';
        this.container.style.padding = '0'; // Remove default padding if any

        // --- CSS STYLES ---
        const style = document.createElement('style');
        style.textContent = `
            .artifact-pill {
                padding: 6px 12px;
                border-radius: 20px;
                border: 1px solid var(--border-color);
                background: var(--control-background-color);
                color: var(--peak-secondary);
                font-size: 11px;
                font-weight: 500;
                cursor: pointer;
                transition: all 0.2s;
                white-space: nowrap;
                display: flex;
                align-items: center;
                gap: 6px;
                outline: none;
            }
            .artifact-pill:hover {
                border-color: var(--peak-secondary);
                color: var(--peak-primary) !important;
            }
            .artifact-pill.active {
                background: var(--peak-accent);
                color: #fff !important;
                border-color: var(--peak-accent) !important;
            }
        `;
        this.container.appendChild(style);

        // --- TABS HEADER ---
        const tabsContainer = document.createElement('div');
        tabsContainer.role = 'tablist';
        tabsContainer.style.cssText = 'display: flex; gap: 8px; border-bottom: 1px solid var(--border-color); margin-bottom: 12px; background: var(--peak-card-bg); padding: 12px; overflow-x: auto;';

        const createTab = (id, label) => {
            const tab = document.createElement('button');
            tab.className = `artifact-pill ${this.activeTab === id ? 'active' : ''}`;
            tab.textContent = label;
            tab.role = 'tab';
            tab.setAttribute('aria-selected', this.activeTab === id);
            tab.setAttribute('aria-controls', 'settings-tab-content');

            // Inline styles are mostly handled by CSS now, but we ensure button properties
            tab.style.border = this.activeTab === id ? '1px solid var(--peak-accent)' : '1px solid var(--border-color)';

            tab.onclick = () => {
                this.activeTab = id;
                this.renderSettings();
            };
            return tab;
        };

        tabsContainer.appendChild(createTab('general', 'General'));
        tabsContainer.appendChild(createTab('agents', 'Agents'));
        tabsContainer.appendChild(createTab('mcp', 'MCP Store'));
        tabsContainer.appendChild(createTab('docs', 'Docs'));
        this.container.appendChild(tabsContainer);

        // --- TAB CONTENT ---
        const contentContainer = document.createElement('div');
        contentContainer.id = 'settings-tab-content';
        contentContainer.style.padding = '0 12px 12px 12px';
        this.container.appendChild(contentContainer);

        if (this.activeTab === 'general') {
            this.renderGeneralSettings(contentContainer);
        } else if (this.activeTab === 'agents') {
            this.renderAgentSettings(contentContainer);
        } else if (this.activeTab === 'mcp') {
            this.renderMCPSettings(contentContainer);
        } else {
            this.renderDocsSettings(contentContainer);
        }

        if (window.lucide) window.lucide.createIcons();
    }

    // =================================================================================================
    // GENERAL TAB (Includes Memory)
    // =================================================================================================

    renderGeneralSettings(container) {
        // --- Automation Section ---
        const automationSettings = [
            { id: 'automation.list_dir', key: 'list_directory', label: 'Auto-accept List Directory' },
            { id: 'automation.read_file', key: 'read_file', label: 'Auto-accept Read File / URL' }, // read_content / read_url
            { id: 'automation.create_file', key: 'create_file', label: 'Auto-accept Create File' },
            { id: 'automation.edit_file', key: 'edit_file', label: 'Auto-accept Edit File' },
            { id: 'automation.run_command', key: 'run_command', label: 'Auto-accept Run Command' },
            { id: 'automation.plan', key: 'plan', label: 'Auto-accept Plan Files' } // Implementation plan updates
            // Note: 'plan' isn't in default automation keys yet, but good to have.
            // Actually SettingsManager defaults show: list_dir isn't there? 
            // Let's stick to keys present in SettingsManager DEFAULT_SETTINGS if possible, 
            // or ensure SettingsManager handles extra keys.
            // Looking at SettingsManager: run_command, create_file, edit_file, delete_file.
            // It seems list_dir and read_file were legacy defaults or considered safe?
            // I'll map them to the keys expected by the system or 'automation' object.
        ];

        // Helper to get nested value
        const getAutomationValue = (key) => {
            const settings = SettingsManager.getSettings();
            return settings.automation && settings.automation[key];
        };

        const sectionHeader = (text) => {
            const h = document.createElement('div');
            h.textContent = text;
            h.style.cssText = 'font-size: 10px; font-weight: 700; color: var(--peak-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; margin-top: 4px;';
            return h;
        };

        // --- Model Configuration Section ---
        container.appendChild(sectionHeader('AI Model'));

        const modelContainer = document.createElement('div');
        modelContainer.style.cssText = 'margin-bottom: 20px;';

        const currentSettings = SettingsManager.getSettings();

        // Ensure valid model
        let activeModel = currentSettings.model || 'google/gemini-2.5-pro';
        if (activeModel.includes('auto') && !activeModel.includes('google')) {
            // Safety double-check for legacy auto
            activeModel = 'google/gemini-2.5-pro';
        }

        const modelSelect = document.createElement('select');
        modelSelect.id = 'setting-model-select';
        modelSelect.style.cssText = `
            width: 100%;
            padding: 6px 8px;
            background: var(--input-background-color);
            border: 1px solid var(--border-color);
            color: var(--peak-primary);
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
        `;

        AvailableModels.forEach(m => {
            const option = document.createElement('option');
            option.value = m.id;
            option.textContent = `${m.name} ${m.isPremium ? '(Premium)' : ''}`;
            if (m.id === activeModel) option.selected = true;
            modelSelect.appendChild(option);
        });

        modelSelect.addEventListener('change', (e) => {
            SettingsManager.updateSettings({ model: e.target.value });
        });

        modelContainer.appendChild(modelSelect);
        container.appendChild(modelContainer);

        modelContainer.appendChild(modelSelect);
        container.appendChild(modelContainer);

        // --- Editor Features Section ---
        container.appendChild(sectionHeader('Editor Features'));

        const editorFeaturesContainer = document.createElement('div');
        editorFeaturesContainer.style.cssText = 'margin-bottom: 20px;';

        const suggestionItem = document.createElement('div');
        suggestionItem.className = 'settings-item';
        suggestionItem.style.cssText = 'display: flex; align-items: center; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; border: 1px solid transparent;';
        suggestionItem.onmouseover = () => suggestionItem.style.background = 'var(--hover-color)';
        suggestionItem.onmouseout = () => suggestionItem.style.background = 'transparent';

        const sugCheck = document.createElement('input');
        sugCheck.type = 'checkbox';
        sugCheck.id = 'setting-inline-suggestions';
        sugCheck.checked = SettingsManager.getSettings().inlineSuggestions || false;
        sugCheck.style.marginRight = '8px';
        sugCheck.style.accentColor = 'var(--peak-accent)';
        sugCheck.style.cursor = 'pointer';

        sugCheck.addEventListener('change', (e) => {
            SettingsManager.updateSettings({ inlineSuggestions: e.target.checked });
        });

        const sugLabel = document.createElement('label');
        sugLabel.htmlFor = sugCheck.id;
        sugLabel.style.cssText = 'display: flex; align-items: center; cursor: pointer; flex: 1; font-size: 11px; color: var(--peak-primary); user-select: none;';
        sugLabel.innerHTML = 'Enable Ghost Text Suggestions <span style="font-size:9px; color:var(--peak-secondary); margin-left:6px; opacity:0.8;">(Beta)</span>';

        suggestionItem.appendChild(sugCheck);
        suggestionItem.appendChild(sugLabel);
        suggestionItem.addEventListener('click', (e) => {
            if (e.target !== sugCheck && e.target !== sugLabel) sugCheck.click();
        });

        editorFeaturesContainer.appendChild(suggestionItem);
        container.appendChild(editorFeaturesContainer);

        // --- Automation Rules Section ---
        container.appendChild(sectionHeader('Automation Rules'));

        const settingsGrid = document.createElement('div');
        settingsGrid.style.cssText = 'display: grid; grid-template-columns: 1fr; gap: 4px; margin-bottom: 20px;';

        // Define the mapping explicitly to match SettingsManager structure
        const rules = [
            // Safe tools (often defaulted to true in past, but let's make them config)
            // SettingsManager defaults don't list them, implying they might be always allowed or handled elsewhere?
            // Ref: SettingsManager.js lines 26-31. Only run, create, edit, delete are there.
            // I will add list/read for completeness if the system supports them, or assume they are 'safe' by default.
            // For now, let's map the Critical ones that require approval.

            { key: 'run_command', label: 'Auto-accept Run Command' },
            { key: 'create_file', label: 'Auto-accept Create File' },
            { key: 'edit_file', label: 'Auto-accept Edit File' },
            { key: 'delete_file', label: 'Auto-accept Delete File' }
        ];

        rules.forEach(rule => {
            const item = document.createElement('div');
            item.className = 'settings-item';
            item.style.cssText = 'display: flex; align-items: center; padding: 4px 8px; border-radius: 4px; cursor: pointer; transition: background 0.1s; border: 1px solid transparent;';

            item.onmouseover = () => {
                item.style.background = 'var(--hover-color)';
                item.style.borderColor = 'var(--border-color)';
            };
            item.onmouseout = () => {
                item.style.background = 'transparent';
                item.style.borderColor = 'transparent';
            };

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `setting-auto-${rule.key}`;

            // Initial State from Manager
            const currentVal = SettingsManager.getSettings().automation?.[rule.key] || false;
            checkbox.checked = currentVal;

            checkbox.style.marginRight = '8px';
            checkbox.style.accentColor = 'var(--peak-accent)';
            checkbox.style.cursor = 'pointer';

            checkbox.addEventListener('change', (e) => {
                const checked = e.target.checked;
                const { automation } = SettingsManager.getSettings();
                // Create clean copy
                const newAutomation = { ...automation, [rule.key]: checked };
                SettingsManager.updateSettings({ automation: newAutomation });
            });

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.style.cssText = 'display: flex; align-items: center; cursor: pointer; flex: 1; font-size: 11px; color: var(--peak-primary); user-select: none;';
            label.textContent = rule.label;

            item.appendChild(checkbox);
            item.appendChild(label);

            item.addEventListener('click', (e) => {
                if (e.target !== checkbox && e.target !== label) {
                    checkbox.click();
                }
            });

            settingsGrid.appendChild(item);
        });

        container.appendChild(settingsGrid);

        // --- Sync Handler ---
        const syncUI = () => {
            const settings = SettingsManager.getSettings();
            if (!settings) return;

            // Sync Model
            if (modelSelect && modelSelect.value !== settings.model) {
                // Verify it's not a legacy auto value we are trying to sync TO
                if (!settings.model.includes('auto') || settings.model.includes('google')) {
                    modelSelect.value = settings.model;
                }
            }

            // Sync Automation Checkboxes
            if (settings.automation) {
                rules.forEach(rule => {
                    const cb = container.querySelector(`#setting-auto-${rule.key}`);
                    if (cb) {
                        cb.checked = settings.automation[rule.key] === true;
                    }
                });
            }

            // Sync Editor Features
            const sugCheck = container.querySelector('#setting-inline-suggestions');
            if (sugCheck) {
                sugCheck.checked = settings.inlineSuggestions === true;
            }
        };

        // Subscribe
        this.settingsUnsub = SettingsManager.subscribe(syncUI);

        // --- Project Memory Section ---
        container.appendChild(document.createElement('hr')).style.cssText = 'border: 0; border-top: 1px solid var(--border-color); margin: 0 0 16px 0; opacity: 0.5;';

        const memoryHeader = document.createElement('div');
        memoryHeader.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;';
        memoryHeader.appendChild(sectionHeader('Project Memory'));

        const memoryInfo = document.createElement('span');
        memoryInfo.innerHTML = '<i data-lucide="info" style="width:10px; height:10px; margin-right:4px;"></i>Context for every message';
        memoryInfo.style.cssText = 'font-size: 9px; color: var(--peak-secondary); display: flex; align-items: center;';
        memoryHeader.appendChild(memoryInfo);

        container.appendChild(memoryHeader);

        const memoryWrapper = document.createElement('div');
        memoryWrapper.style.position = 'relative';

        const memoryTextarea = document.createElement('textarea');
        memoryTextarea.style.cssText = `
            width: 100%;
            height: 120px;
            background: var(--input-background-color);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            color: var(--peak-primary);
            padding: 8px;
            font-size: 11px;
            line-height: 1.4;
            resize: vertical;
            font-family: var(--font-mono, monospace);
            transition: border-color 0.2s;
        `;
        memoryTextarea.onfocus = () => memoryTextarea.style.borderColor = 'var(--peak-accent)';
        memoryTextarea.onblur = () => memoryTextarea.style.borderColor = 'var(--border-color)';

        // Load current memory directly from MCP Client if available
        const client = window.peakMCPClient;
        const currentRoot = window.currentProjectRoot || (client && client.currentProjectRoot);

        if (currentRoot && client) {
            if (typeof client.getProjectMemory === 'function') {
                memoryTextarea.value = client.getProjectMemory(currentRoot);
            } else {
                memoryTextarea.value = 'Error: Client memory feature unavailable.';
            }
        } else {
            memoryTextarea.placeholder = 'Open a project to set memory...';
            memoryTextarea.disabled = true;
            memoryTextarea.style.opacity = '0.5';
        }

        const saveBtn = document.createElement('button');
        saveBtn.innerHTML = '<i data-lucide="save" style="width:12px; height:12px; margin-right:4px;"></i>Save';
        saveBtn.style.cssText = `
            position: absolute;
            bottom: 8px;
            right: 8px;
            padding: 4px 8px;
            background: var(--peak-accent);
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 500;
            display: flex;
            align-items: center;
            opacity: 0.9;
            transition: opacity 0.2s;
        `;
        saveBtn.onmouseover = () => saveBtn.style.opacity = '1';
        saveBtn.onmouseout = () => saveBtn.style.opacity = '0.9';

        saveBtn.onclick = () => {
            if (currentRoot && client) {
                client.saveProjectMemory(currentRoot, memoryTextarea.value);
                const originalContent = saveBtn.innerHTML;
                saveBtn.innerHTML = '<i data-lucide="check" style="width:12px; height:12px; margin-right:4px;"></i>Saved';
                saveBtn.style.background = '#10b981';
                setTimeout(() => {
                    saveBtn.innerHTML = originalContent;
                    saveBtn.style.background = 'var(--peak-accent)';
                }, 1500);
            }
        };

        memoryWrapper.appendChild(memoryTextarea);
        memoryWrapper.appendChild(saveBtn);
        container.appendChild(memoryWrapper);
    }

    // =================================================================================================
    // DOCS TAB
    // =================================================================================================

    renderDocsSettings(container) {
        const header = document.createElement('div');
        header.innerHTML = `
            <h3 style="margin:0 0 8px 0; font-size:14px; color:var(--peak-primary);">Documentation Sources</h3>
            <p style="margin:0 0 16px 0; font-size:11px; color:var(--peak-secondary);">Select documentation to include in the AI's context.</p>
        `;
        container.appendChild(header);

        // Group docs by category
        const categories = {};
        DocsRegistry.forEach(doc => {
            // Skip MCP Servers category as it's handled in the Store
            if (doc.category === 'MCP Servers') return;

            if (!categories[doc.category]) categories[doc.category] = [];
            categories[doc.category].push(doc);
        });

        Object.keys(categories).forEach(cat => {
            const catHeader = document.createElement('div');
            catHeader.textContent = cat;
            catHeader.style.cssText = 'font-size:11px; font-weight:600; color:var(--peak-secondary); margin:12px 0 8px 0; text-transform:uppercase; letter-spacing:0.5px;';
            container.appendChild(catHeader);

            const grid = document.createElement('div');
            grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 8px;';

            categories[cat].forEach(doc => {
                const card = document.createElement('div');
                const isActive = this.activeDocs.includes(doc.id);

                card.className = 'doc-card';
                card.style.cssText = `
                    background: ${isActive ? 'var(--peak-card-bg-hover)' : 'var(--peak-card-bg)'};
                    border: 1px solid ${isActive ? 'var(--peak-accent)' : 'var(--border-color)'};
                    border-radius: 6px;
                    padding: 10px;
                    cursor: pointer;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                `;

                card.innerHTML = `
                    <i data-lucide="${doc.icon || 'book'}" style="width:16px; height:16px; color:${isActive ? 'var(--peak-accent)' : 'var(--peak-secondary)'};"></i>
                    <span style="font-size:12px; font-weight:500; color:var(--peak-primary);">${doc.name}</span>
                `;

                card.onclick = () => {
                    if (isActive) {
                        this.activeDocs = this.activeDocs.filter(id => id !== doc.id);
                    } else {
                        this.activeDocs.push(doc.id);
                    }
                    this.saveActiveDocs();
                    this.renderSettings(); // Re-render to update UI
                };

                grid.appendChild(card);
            });

            container.appendChild(grid);
        });
    }

    // =================================================================================================
    // AGENTS TAB
    // =================================================================================================

    renderAgentSettings(container) {
        container.innerHTML = `
            <div style="padding: 0 0 8px 0; margin-bottom: 8px; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:10px; color:var(--peak-secondary); font-weight: 500;">
                    Execution Order (Drag to reorder)
                </div>
                <button id="btn-create-agent" style="padding:3px 8px; background:transparent; border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:10px; cursor:pointer; display:flex; align-items:center; gap:4px; transition:all 0.2s;">
                    <i data-lucide="plus" style="width:10px; height:10px;"></i> New
                </button>
            </div>
            <div id="agents-list" style="display:flex; flex-direction:column; gap:6px;"></div>
            
            <!-- Edit/Create Modal -->
            <div id="agent-editor" style="display:none; margin-top:8px; padding:12px; background:var(--peak-card-bg); border-radius:6px; border:1px solid var(--border-color); box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <h3 id="agent-editor-title" style="margin:0 0 10px 0; font-size:11px; font-weight:600; color:var(--peak-primary); text-transform:uppercase;">Create Agent</h3>
                <input type="hidden" id="edit-agent-id">
                
                <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom:8px;">
                    <div>
                        <label style="display:block; font-size:9px; color:var(--peak-secondary); margin-bottom:3px;">Name</label>
                        <input type="text" id="edit-agent-name" style="width:100%; padding:4px 6px; background:var(--input-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:11px;">
                    </div>
                    <div>
                        <label style="display:block; font-size:9px; color:var(--peak-secondary); margin-bottom:3px;">Model</label>
                        <select id="edit-agent-model" style="width:100%; padding:4px 6px; background:var(--input-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:11px;">
                            ${AvailableModels.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                        </select>
                    </div>
                </div>
                
                <div style="margin-bottom:8px;">
                    <label style="display:block; font-size:9px; color:var(--peak-secondary); margin-bottom:3px;">System Prompt</label>
                    <textarea id="edit-agent-prompt" rows="5" style="width:100%; padding:6px; background:var(--input-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-size:10px; font-family:var(--font-mono, monospace); line-height:1.4;"></textarea>
                </div>

                <div style="margin-bottom:10px; display:flex; align-items:center; gap:6px;">
                    <input type="checkbox" id="edit-agent-chain-inclusion" style="accent-color:var(--peak-accent);">
                    <label for="edit-agent-chain-inclusion" style="font-size:10px; color:var(--peak-primary); cursor:pointer;">Include in Multi-Agent Chain</label>
                </div>
                
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                    <button id="btn-cancel-agent" style="padding:4px 10px; background:transparent; border:1px solid var(--border-color); color:var(--peak-secondary); border-radius:4px; font-size:10px; cursor:pointer;">Cancel</button>
                    <button id="btn-save-agent" style="padding:4px 10px; background:var(--peak-accent); border:none; color:white; border-radius:4px; font-size:10px; cursor:pointer; font-weight:500;">Save Agent</button>
                </div>
            </div>
        `;

        this.renderAgentsList(container.querySelector('#agents-list'));
        this.attachAgentListeners(container);
    }

    renderAgentsList(container) {
        if (!container) return;
        container.innerHTML = '';
        const agents = AgentRegistry.getAgents();

        // 1. Build Hierarchy Tree to determine display order and indentation
        const buildTree = (parentId = null, level = 0) => {
            const children = agents.filter(a => a.parentId === parentId);
            // Sort by their original index in the flat list to preserve user order preference
            // (This assumes the flat list order is somewhat meaningful, or we rely on DnD reordering)
            // Actually, we should probably rely on the array order for siblings.
            // Let's just filter.

            // We need to respect the order they appear in the main array to maintain stability
            // So we can't just filter, we need to iterate the main array and pick those that match.
            // But that's O(N^2). N is small, so it's fine.

            let result = [];
            agents.forEach(agent => {
                if (agent.parentId === parentId) {
                    result.push({ ...agent, level });
                    result = result.concat(buildTree(agent.id, level + 1));
                }
            });
            return result;
        };

        // Handle orphans (if any parentId is invalid) by treating them as roots
        // For simplicity, let's just do a robust tree build.
        const rootAgents = agents.filter(a => !a.parentId || !agents.find(p => p.id === a.parentId));
        let displayList = [];

        const processNode = (agent, level) => {
            displayList.push({ ...agent, level });
            const children = agents.filter(a => a.parentId === agent.id);
            children.forEach(child => processNode(child, level + 1));
        };

        rootAgents.forEach(root => processNode(root, 0));

        displayList.forEach((agent, index) => {
            const item = document.createElement('div');
            item.className = 'agent-item';
            item.draggable = true;
            item.dataset.id = agent.id;
            item.dataset.index = index; // This index is for the display list

            // Indentation
            const indent = agent.level * 20;

            item.style.cssText = `
                padding: 6px 8px; 
                border: 1px solid var(--border-color); 
                border-radius: 4px; 
                background: var(--peak-card-bg); 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                cursor: grab; 
                transition: all 0.2s;
                margin-left: ${indent}px;
                position: relative;
            `;

            // Visual connector for children
            if (agent.level > 0) {
                const connector = document.createElement('div');
                connector.style.cssText = `
                    position: absolute;
                    left: -12px;
                    top: 50%;
                    width: 10px;
                    height: 1px;
                    background: var(--border-color);
                `;
                item.appendChild(connector);

                const vertical = document.createElement('div');
                vertical.style.cssText = `
                    position: absolute;
                    left: -12px;
                    top: -50%;
                    width: 1px;
                    height: 100%; // This is tricky without knowing if it's the last child
                    background: var(--border-color);
                `;
                // Simple L shape is hard with just CSS on the item. 
                // Let's skip complex tree lines for now, indentation is enough.
            }

            item.onmouseover = () => item.style.borderColor = 'var(--peak-accent)';
            item.onmouseout = () => item.style.borderColor = 'var(--border-color)';

            item.innerHTML = `
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="color:var(--peak-secondary); cursor:grab; opacity:0.5;"><i data-lucide="grip-vertical" style="width:12px; height:12px;"></i></div>
                    <div style="width:8px; height:8px; border-radius:50%; background:${agent.color || '#666'};"></div>
                    <div style="display:flex; flex-direction:column;">
                        <div style="font-size:11px; font-weight:600; color:var(--peak-primary); display:flex; align-items:center; gap:6px;">
                            ${agent.name}
                            ${agent.level === 0 ? '<span style="font-size:8px; padding:1px 4px; border-radius:3px; background:var(--peak-bg-hover); color:var(--peak-secondary);">ROOT</span>' : ''}
                        </div>
                        <div style="font-size:9px; color:var(--peak-secondary); opacity:0.8;">${agent.modelId.split('/').pop()}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="display:flex; gap:2px;">
                        <button class="icon-btn indent-left-btn" data-id="${agent.id}" title="Outdent" ${agent.level === 0 ? 'disabled style="opacity:0.2;"' : 'style="cursor:pointer; opacity:0.7;"'}>
                            <i data-lucide="chevron-left" style="width:12px; height:12px;"></i>
                        </button>
                        <button class="icon-btn indent-right-btn" data-id="${agent.id}" title="Indent" style="cursor:pointer; opacity:0.7;">
                            <i data-lucide="chevron-right" style="width:12px; height:12px;"></i>
                        </button>
                    </div>
                    <div style="width:1px; height:12px; background:var(--border-color);"></div>
                    <div style="display:flex; gap:2px;">
                        <button class="icon-btn edit-agent-btn" data-id="${agent.id}" title="Edit" style="padding:3px; background:transparent; border:none; color:var(--peak-secondary); cursor:pointer; opacity:0.7;"><i data-lucide="pencil" style="width:11px; height:11px;"></i></button>
                        ${!agent.isSystem ? `<button class="icon-btn delete-agent-btn" data-id="${agent.id}" title="Delete" style="padding:3px; background:transparent; border:none; color:var(--error-color); cursor:pointer; opacity:0.7;"><i data-lucide="trash-2" style="width:11px; height:11px;"></i></button>` : ''}
                    </div>
                </div>
            `;

            // --- Event Listeners ---

            // Indent/Outdent
            const btnLeft = item.querySelector('.indent-left-btn');
            const btnRight = item.querySelector('.indent-right-btn');

            if (btnLeft && !btnLeft.disabled) {
                btnLeft.onclick = (e) => {
                    e.stopPropagation();
                    this.handleOutdent(agent);
                };
            }

            if (btnRight) {
                btnRight.onclick = (e) => {
                    e.stopPropagation();
                    this.handleIndent(agent, displayList, index);
                };
            }

            // DnD Events (Simplified for reordering within same parent or general list)
            // For now, let's keep DnD simple: it just reorders the flat array, which might affect tree structure if we are not careful.
            // Actually, if we reorder the flat array, the tree builder needs to respect that order.
            // My tree builder above uses `agents.filter`, which respects array order.
            // So DnD should work for reordering siblings.

            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', agent.id); // Use ID instead of index
                item.style.opacity = '0.5';
                item.classList.add('dragging');
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
                item.classList.remove('dragging');
                this.removeDragOverStyles(container);
            });

            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                item.style.borderTop = '2px solid var(--peak-accent)';
            });

            item.addEventListener('dragleave', () => {
                item.style.borderTop = '1px solid var(--border-color)';
            });

            item.addEventListener('drop', (e) => {
                e.preventDefault();
                const draggedId = e.dataTransfer.getData('text/plain');
                const targetId = agent.id;

                if (draggedId !== targetId) {
                    this.reorderAgentsById(draggedId, targetId);
                }
                this.removeDragOverStyles(container);
            });

            container.appendChild(item);
        });

        if (window.lucide) window.lucide.createIcons();
    }

    removeDragOverStyles(container) {
        const items = container.querySelectorAll('.agent-item');
        items.forEach(item => {
            item.style.borderTop = '1px solid var(--border-color)';
        });
    }

    handleIndent(agent, displayList, index) {
        // To indent, we need a previous sibling in the display list that can be a parent.
        // The previous item in displayList is the candidate parent.
        if (index === 0) return; // Cannot indent first item

        const prevAgent = displayList[index - 1];

        // Prevent circular dependency (though UI structure prevents it mostly)
        // Also prevent indenting if the previous agent is a child of THIS agent (impossible in this list order)

        // Simply set parentId to prevAgent.id
        // But wait, if prevAgent is at level 0, and we are at level 0, we become level 1 (child of prev).
        // If prevAgent is at level 1, we become level 2 (child of prev).
        // Correct.

        // However, we should only allow indenting if we are currently a sibling of prevAgent OR prevAgent is the last child of our current sibling.
        // Actually, standard outliner logic: "Make child of previous visible item".

        // Logic:
        // New Parent = Previous Item in Display List.

        // Check if previous item is actually our own child? (Impossible as children come after)
        // Check if previous item is our parent? (Impossible, parent comes before previous sibling)

        // So yes, set parentId = prevAgent.id

        // One edge case: If prevAgent is collapsed? (We don't have collapsing yet)

        agent.parentId = prevAgent.id;
        AgentRegistry.saveAgent(agent);
        this.renderAgentsList(document.getElementById('agents-list'));
    }

    handleOutdent(agent) {
        if (!agent.parentId) return; // Already root

        const parent = AgentRegistry.getAgent(agent.parentId);
        if (!parent) {
            agent.parentId = null; // Fallback
        } else {
            // Make child of grandparent
            agent.parentId = parent.parentId;
        }

        AgentRegistry.saveAgent(agent);
        this.renderAgentsList(document.getElementById('agents-list'));
    }

    reorderAgentsById(draggedId, targetId) {
        const agents = [...AgentRegistry.getAgents()];
        const fromIndex = agents.findIndex(a => a.id === draggedId);
        const toIndex = agents.findIndex(a => a.id === targetId);

        if (fromIndex === -1 || toIndex === -1) return;

        const [movedAgent] = agents.splice(fromIndex, 1);
        agents.splice(toIndex, 0, movedAgent);

        // Note: This reordering only changes the array order.
        // If we drag a child to a different parent's area, we might want to update parentId?
        // For now, let's keep DnD strictly for sorting order. 
        // Hierarchy is managed via Indent/Outdent buttons.
        // This avoids the complexity of "drop inside" vs "drop between".

        AgentRegistry.setAgents(agents);
        this.renderAgentsList(document.getElementById('agents-list'));
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
        const title = section.querySelector('#agent-editor-title');

        const openEditor = (agent = null) => {
            editor.style.display = 'block';
            list.style.display = 'none';
            btnCreate.style.display = 'none';

            const chainCheckbox = section.querySelector('#edit-agent-chain-inclusion');

            if (agent) {
                title.textContent = 'Edit Agent';
                inputId.value = agent.id;
                inputName.value = agent.name;
                inputModel.value = agent.modelId;
                inputPrompt.value = agent.systemPrompt;
                if (chainCheckbox) chainCheckbox.checked = agent.isChainEnabled;
            } else {
                title.textContent = 'Create Agent';
                inputId.value = '';
                inputName.value = 'New Agent';
                inputModel.value = 'google/gemini-2.5-pro';
                inputPrompt.value = 'You are a helpful assistant.';
                if (chainCheckbox) chainCheckbox.checked = false;
            }
        };

        const closeEditor = () => {
            editor.style.display = 'none';
            list.style.display = 'flex';
            btnCreate.style.display = 'flex'; // Restore flex display for button
        };

        btnCreate.addEventListener('click', () => openEditor());
        btnCancel.addEventListener('click', () => closeEditor());

        btnSave.addEventListener('click', () => {
            const chainCheckbox = section.querySelector('#edit-agent-chain-inclusion');
            const existingId = inputId.value;
            let parentId = null;
            let color = null;
            let isDefault = false;
            let isSystem = false;

            if (existingId) {
                const existingAgent = AgentRegistry.getAgent(existingId);
                if (existingAgent) {
                    parentId = existingAgent.parentId;
                    color = existingAgent.color;
                    isDefault = existingAgent.isDefault;
                    isSystem = existingAgent.isSystem;
                }
            }

            const agent = {
                id: existingId || null,
                name: inputName.value,
                description: 'Custom Agent',
                modelId: inputModel.value,
                systemPrompt: inputPrompt.value,
                isDefault: isDefault,
                isSystem: isSystem,
                isChainEnabled: chainCheckbox ? chainCheckbox.checked : false,
                parentId: parentId,
                color: color
            };

            AgentRegistry.saveAgent(agent);
            this.renderAgentsList(list);
            closeEditor();
        });

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

    // =================================================================================================
    // DOCS TAB
    // =================================================================================================

    // =================================================================================================
    // MCP STORE TAB
    // =================================================================================================

    renderMCPSettings(container) {
        const catalog = require('../data/mcp-catalog');
        const config = JSON.parse(localStorage.getItem('peak-mcp-config') || '{}');

        const header = document.createElement('div');
        header.innerHTML = `
            <div style="font-size:10px; font-weight:700; color:var(--peak-secondary); text-transform:uppercase; margin-bottom:8px;">Available Servers</div>
            <div style="font-size:11px; color:var(--peak-secondary); margin-bottom:12px; line-height:1.4;">
                Enable servers to give the AI access to external tools and data. Some servers require API keys.
            </div>
        `;
        container.appendChild(header);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex; flex-direction:column; gap:8px;';

        catalog.forEach(server => {
            const isEnabled = config[server.id]?.enabled || false;
            const apiKey = config[server.id]?.key || '';

            const item = document.createElement('div');
            item.style.cssText = `
                border: 1px solid var(--border-color);
                border-radius: 6px;
                background: var(--peak-card-bg);
                padding: 10px;
                transition: all 0.2s;
            `;

            // Header Row
            const headerRow = document.createElement('div');
            headerRow.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;';

            const titleGroup = document.createElement('div');
            titleGroup.style.cssText = 'display:flex; align-items:center; gap:8px;';
            titleGroup.innerHTML = `
                <div style="font-size:12px; font-weight:600; color:var(--peak-primary);">${server.name}</div>
                ${server.type === 'official' ? '<span style="font-size:9px; padding:2px 4px; background:rgba(16, 185, 129, 0.1); color:#10b981; border-radius:3px;">OFFICIAL</span>' : ''}
            `;

            const toggle = document.createElement('input');
            toggle.type = 'checkbox';
            toggle.checked = isEnabled;
            toggle.style.accentColor = 'var(--peak-accent)';
            toggle.style.cursor = 'pointer';

            toggle.onchange = (e) => {
                const newConfig = JSON.parse(localStorage.getItem('peak-mcp-config') || '{}');
                if (!newConfig[server.id]) newConfig[server.id] = {};
                newConfig[server.id].enabled = e.target.checked;
                localStorage.setItem('peak-mcp-config', JSON.stringify(newConfig));

                // Show/Hide Key Input
                if (server.requiresKey) {
                    const keyContainer = item.querySelector('.key-container');
                    if (keyContainer) keyContainer.style.display = e.target.checked ? 'block' : 'none';
                }

                // Trigger update
                window.dispatchEvent(new CustomEvent('peak-mcp-config-updated'));
            };

            headerRow.appendChild(titleGroup);
            headerRow.appendChild(toggle);
            item.appendChild(headerRow);

            // Description
            const desc = document.createElement('div');
            desc.textContent = server.description;
            desc.style.cssText = 'font-size:11px; color:var(--peak-secondary); margin-bottom:8px; line-height:1.4;';
            item.appendChild(desc);

            // API Key Input (if required)
            if (server.requiresKey) {
                const keyContainer = document.createElement('div');
                keyContainer.className = 'key-container';
                keyContainer.style.cssText = `display: ${isEnabled ? 'block' : 'none'}; margin-top:8px; padding-top:8px; border-top:1px solid var(--border-color);`;

                const keyLabel = document.createElement('div');
                keyLabel.textContent = `${server.keyName} (Stored locally)`;
                keyLabel.style.cssText = 'font-size:9px; color:var(--peak-secondary); margin-bottom:4px; font-weight:500;';

                const keyInput = document.createElement('input');
                keyInput.type = 'password';
                keyInput.value = apiKey;
                keyInput.placeholder = 'Enter API Key...';
                keyInput.style.cssText = `
                    width: 100%;
                    padding: 6px;
                    background: var(--input-background-color);
                    border: 1px solid var(--border-color);
                    border-radius: 4px;
                    color: var(--peak-primary);
                    font-size: 11px;
                    font-family: monospace;
                `;

                keyInput.onchange = (e) => {
                    const newConfig = JSON.parse(localStorage.getItem('peak-mcp-config') || '{}');
                    if (!newConfig[server.id]) newConfig[server.id] = {};
                    newConfig[server.id].key = e.target.value;
                    localStorage.setItem('peak-mcp-config', JSON.stringify(newConfig));
                    window.dispatchEvent(new CustomEvent('peak-mcp-config-updated'));
                };

                keyContainer.appendChild(keyLabel);
                keyContainer.appendChild(keyInput);
                item.appendChild(keyContainer);
            }

            list.appendChild(item);
        });

        container.appendChild(list);
    }

    destroy() {
        this.container = null;
    }
}

module.exports = SettingsController;
