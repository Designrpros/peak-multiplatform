// src/components/SettingsView/index.js
const { ipcRenderer } = require('electron');

const AgentRegistry = require('../AIAssistant/core/AgentRegistry');
const { AvailableModels } = require('../../utils/enums');

const FEATURE_LIST = [
    { title: 'Quick Search & Launch', description: 'Instantly search, open URLs, or create new items (Notes, Chats, Projects) from the main input bar.' },
    { title: 'Tab Management', description: 'Organize your work with multiple tabs for web pages, terminals, code projects, and notes.' },
    { title: 'Project Explorer', description: 'Open local folders, browse files, and use the integrated CodeMirror editor with auto-save and file system interaction.' },
    { title: 'Embedded Terminal', description: 'Run a fully functional shell within the Project View, anchored to your current project directory.' },
    { title: 'Peak Assistant', description: 'Get context-aware help (explain, debug, refactor) for the file currently open in the Project Explorer sidebar.' },
    { title: 'Chat View (OpenRouter)', description: 'Dedicated AI chat space supporting streaming responses via OpenRouter models.' },
    { title: 'Note Editor', description: 'Long-form writing tool supporting structured block types (headings, paragraphs, code, todos) with real-time saving.' },
    { title: 'Session History', description: 'Access past web navigations, saved notes, and chat sessions easily via the right sidebar.' }
];

let currentSettings = {};

function renderHorizontalNav() {
    return `
        <div class="settings-nav-item active" data-section="system">
            <i data-lucide="monitor"></i> System & Appearance
        </div>
        <div class="settings-nav-item" data-section="ai">
            <i data-lucide="sparkles"></i> AI & Services
        </div>
        <div class="settings-nav-item" data-section="agents">
            <i data-lucide="users"></i> Agents
        </div>
        <div class="settings-nav-item" data-section="help">
            <i data-lucide="info"></i> Features Overview
        </div>
    `;
}

function renderSettingsHTML(settingsData) {
    currentSettings = settingsData;

    const hotkeyDisplay = currentSettings.hotkey || 'Control+2';

    // Determine checkbox states
    const isDockVisible = currentSettings.isDockVisible === true;
    const isFloating = currentSettings.isFloating === true;

    return `
        <div class="settings-view-container">
            <h1 class="settings-title">Peak Settings</h1>
            
            <div class="horizontal-tabs-bar">
                ${renderHorizontalNav()}
            </div>

            <div id="tab-content-container" class="tab-content-container"> <div id="section-system-content" class="settings-tab-content active" data-section="system">
                    <h2 class="section-header">System & Appearance</h2>
                    
                    <div class="setting-group">
                        <div class="setting-item">
                            <label for="hotkey-input">Global Shortcut</label>
                            <input type="text" id="hotkey-input" value="${hotkeyDisplay}" placeholder="e.g., Command+K">
                            <button id="hotkey-save-button" class="action-button">Set Shortcut</button>
                        </div>
                        <div class="setting-description">
                            This hotkey toggles the Peak window visibility. Requires app restart to take effect.
                            (Current: <span>${hotkeyDisplay}</span>)
                        </div>
                    </div>

                    <div class="setting-group">
                        <div class="setting-item toggle-item">
                            <label for="dock-toggle">Show App Icon in Dock</label>
                            <!-- Checkbox reflects the setting: Checked = Visible, Unchecked = Hidden -->
                            <input type="checkbox" id="dock-toggle" ${isDockVisible ? 'checked' : ''}>
                        </div>
                        <div class="setting-description">
                            Uncheck to run Peak as a hidden menubar utility.
                        </div>
                    </div>
                    
                    <div class="setting-group">
                        <div class="setting-item toggle-item">
                            <label for="floating-toggle">Window Always on Top (Floating)</label>
                            <input type="checkbox" id="floating-toggle" ${isFloating ? 'checked' : ''}>
                        </div>
                        <div class="setting-description">
                            Keeps the Peak window elevated above standard windows.
                        </div>
                    </div>
                </div>

                <div id="section-ai-content" class="settings-tab-content" data-section="ai">
                    <h2 class="section-header">AI & Services</h2>

                    <div class="setting-group">
                        <div class="setting-item">
                            <label for="openrouter-key-input">OpenRouter API Key</label>
                            <input type="password" id="openrouter-key-input" placeholder="sk-or-...">
                            <button id="openrouter-save-button" class="action-button">Save Key</button>
                        </div>
                        <div class="setting-description">
                            Used for Chat View and AI Assistant. Saved locally and encrypted.
                        </div>
                    </div>
                </div>

                <div id="section-agents-content" class="settings-tab-content" data-section="agents">
                    <h2 class="section-header">AI Agents</h2>
                    <div class="setting-description" style="margin-bottom: 16px;">
                        Create and manage custom AI agents with specific personalities and system prompts.
                    </div>
                    
                    <div style="margin-bottom: 16px;">
                        <button id="settings-create-agent-btn" class="action-button">+ Create New Agent</button>
                    </div>

                    <div id="settings-agents-list" style="display:flex; flex-direction:column; gap:8px;">
                        <!-- Populated by JS -->
                    </div>

                    <!-- Agent Editor Modal (Inline) -->
                    <div id="settings-agent-editor" style="display:none; margin-top:20px; padding:20px; background:var(--control-background-color); border-radius:8px; border:1px solid var(--border-color);">
                        <h3 id="settings-agent-editor-title" style="margin:0 0 16px 0; font-size:16px; color:var(--peak-primary);">Create Agent</h3>
                        <input type="hidden" id="settings-edit-agent-id">
                        
                        <div class="setting-item" style="display:block; margin-bottom:12px;">
                            <label style="display:block; margin-bottom:6px;">Name</label>
                            <input type="text" id="settings-edit-agent-name" style="width:100%;">
                        </div>
                        
                        <div class="setting-item" style="display:block; margin-bottom:12px;">
                            <label style="display:block; margin-bottom:6px;">Model</label>
                            <select id="settings-edit-agent-model" style="width:100%; padding:8px; background:var(--text-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px;">
                                ${AvailableModels.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}
                            </select>
                        </div>
                        
                        <div class="setting-item" style="display:block; margin-bottom:12px;">
                            <label style="display:block; margin-bottom:6px;">System Prompt</label>
                            <textarea id="settings-edit-agent-prompt" rows="8" style="width:100%; padding:8px; background:var(--text-background-color); border:1px solid var(--border-color); color:var(--peak-primary); border-radius:4px; font-family:monospace;"></textarea>
                            <div style="font-size:11px; color:var(--peak-secondary); margin-top:4px;">Variables: \${window.currentProjectRoot}, \${projectData.title}</div>
                        </div>
                        
                        <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                            <button id="settings-cancel-agent-btn" class="action-button" style="background:transparent; border:1px solid var(--border-color);">Cancel</button>
                            <button id="settings-save-agent-btn" class="action-button">Save Agent</button>
                        </div>
                    </div>
                </div>
                
                <div id="section-help-content" class="settings-tab-content" data-section="help">
                    <h2 class="section-header">Features Overview</h2>
                    <ul class="feature-list">
                        ${FEATURE_LIST.map(feature => `
                            <li>
                                <i data-lucide="check-circle" class="feature-icon"></i>
                                <strong>${feature.title}:</strong> ${feature.description}
                            </li>
                        `).join('')}
                    </ul>
                </div>

            </div> </div>
    `;
}

function attachSettingsListeners() {
    const hotkeyInput = document.getElementById('hotkey-input');
    const hotkeySaveButton = document.getElementById('hotkey-save-button');
    const dockToggle = document.getElementById('dock-toggle');
    const floatingToggle = document.getElementById('floating-toggle');
    const apiKeyInput = document.getElementById('openrouter-key-input');
    const apiKeySaveButton = document.getElementById('openrouter-save-button');
    const navItems = document.querySelectorAll('.settings-nav-item');
    const contentPanes = document.querySelectorAll('.settings-tab-content');

    // Agent Elements
    const agentsList = document.getElementById('settings-agents-list');
    const agentEditor = document.getElementById('settings-agent-editor');
    const btnCreateAgent = document.getElementById('settings-create-agent-btn');
    const btnCancelAgent = document.getElementById('settings-cancel-agent-btn');
    const btnSaveAgent = document.getElementById('settings-save-agent-btn');
    const inputAgentId = document.getElementById('settings-edit-agent-id');
    const inputAgentName = document.getElementById('settings-edit-agent-name');
    const inputAgentModel = document.getElementById('settings-edit-agent-model');
    const inputAgentPrompt = document.getElementById('settings-edit-agent-prompt');
    const editorTitle = document.getElementById('settings-agent-editor-title');

    const renderAgents = () => {
        if (!agentsList) return;
        agentsList.innerHTML = '';
        const agents = AgentRegistry.getAgents();

        agents.forEach(agent => {
            const item = document.createElement('div');
            item.className = 'setting-group';
            item.style.padding = '12px';
            item.style.display = 'flex';
            item.style.justifyContent = 'space-between';
            item.style.alignItems = 'center';

            item.innerHTML = `
                <div>
                    <div style="font-size:14px; font-weight:600; color:var(--peak-primary);">${agent.name} ${agent.isDefault ? '<span style="font-size:11px; opacity:0.6; font-weight:normal;">(Default)</span>' : ''}</div>
                    <div style="font-size:12px; color:var(--peak-secondary); margin-top:4px;">${agent.description || 'No description'}</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="action-button edit-agent-btn" data-id="${agent.id}" style="padding:6px 12px; font-size:12px;">Edit</button>
                    ${!agent.isSystem ? `<button class="action-button delete-agent-btn" data-id="${agent.id}" style="padding:6px 12px; font-size:12px; background:var(--error-color); border-color:var(--error-color);">Delete</button>` : ''}
                </div>
            `;
            agentsList.appendChild(item);
        });
    };

    const openAgentEditor = (agent = null) => {
        if (agentEditor) {
            agentEditor.style.display = 'block';
            agentsList.style.display = 'none';
            btnCreateAgent.style.display = 'none';

            if (agent) {
                editorTitle.textContent = 'Edit Agent';
                inputAgentId.value = agent.id;
                inputAgentName.value = agent.name;
                inputAgentModel.value = agent.modelId;
                inputAgentPrompt.value = agent.systemPrompt;
            } else {
                editorTitle.textContent = 'Create Agent';
                inputAgentId.value = '';
                inputAgentName.value = 'New Agent';
                inputAgentModel.value = 'openrouter/auto';
                inputAgentPrompt.value = 'You are a helpful assistant.';
            }
        }
    };

    const closeAgentEditor = () => {
        if (agentEditor) {
            agentEditor.style.display = 'none';
            agentsList.style.display = 'flex';
            btnCreateAgent.style.display = 'block';
        }
    };

    if (btnCreateAgent) btnCreateAgent.addEventListener('click', () => openAgentEditor());
    if (btnCancelAgent) btnCancelAgent.addEventListener('click', () => closeAgentEditor());

    if (btnSaveAgent) {
        btnSaveAgent.addEventListener('click', () => {
            const agent = {
                id: inputAgentId.value || null,
                name: inputAgentName.value,
                description: 'Custom Agent',
                modelId: inputAgentModel.value,
                systemPrompt: inputAgentPrompt.value,
                isDefault: false,
                isSystem: false
            };
            AgentRegistry.saveAgent(agent);
            renderAgents();
            closeAgentEditor();
        });
    }

    if (agentsList) {
        agentsList.addEventListener('click', (e) => {
            const editBtn = e.target.closest('.edit-agent-btn');
            const deleteBtn = e.target.closest('.delete-agent-btn');

            if (editBtn) {
                const id = editBtn.dataset.id;
                const agent = AgentRegistry.getAgent(id);
                openAgentEditor(agent);
            } else if (deleteBtn) {
                const id = deleteBtn.dataset.id;
                if (confirm('Are you sure you want to delete this agent?')) {
                    AgentRegistry.deleteAgent(id);
                    renderAgents();
                }
            }
        });

        // Initial render
        renderAgents();
    }

    const switchTab = (sectionId) => {
        navItems.forEach(item => item.classList.remove('active'));
        contentPanes.forEach(pane => pane.classList.remove('active'));
        const activeNav = document.querySelector(`.settings-nav-item[data-section="${sectionId}"]`);
        if (activeNav) activeNav.classList.add('active');
        const activeContent = document.getElementById(`section-${sectionId}-content`);
        if (activeContent) activeContent.classList.add('active');
        const scroller = document.getElementById('tab-content-container');
        if (scroller) scroller.scrollTop = 0;
    };

    const onHotkeySave = () => {
        const newHotkey = hotkeyInput.value.trim();
        if (newHotkey) {
            ipcRenderer.send('update-hotkey', newHotkey);
        }
    };

    // Sends true (checked) or false (unchecked) to main.js
    const onDockToggle = () => {
        ipcRenderer.send('toggle-dock-visibility', dockToggle.checked);
    };

    const onFloatingToggle = () => {
        ipcRenderer.send('toggle-level', floatingToggle.checked);
    };

    const onApiKeySave = () => {
        const newKey = apiKeyInput.value.trim();
        if (newKey) {
            ipcRenderer.send('save-api-key', newKey);
            apiKeyInput.value = '';
        }
    };

    const onNavClick = (e) => {
        e.preventDefault();
        const sectionId = e.currentTarget.dataset.section;
        switchTab(sectionId);
    };

    if (hotkeySaveButton) hotkeySaveButton.addEventListener('click', onHotkeySave);
    if (dockToggle) dockToggle.addEventListener('change', onDockToggle);
    if (floatingToggle) floatingToggle.addEventListener('change', onFloatingToggle);
    if (apiKeySaveButton) apiKeySaveButton.addEventListener('click', onApiKeySave);

    navItems.forEach(item => {
        item.addEventListener('click', onNavClick);
    });

    return () => {
        if (hotkeySaveButton) hotkeySaveButton.removeEventListener('click', onHotkeySave);
        if (dockToggle) dockToggle.removeEventListener('change', onDockToggle);
        if (floatingToggle) floatingToggle.removeEventListener('change', onFloatingToggle);
        if (apiKeySaveButton) apiKeySaveButton.removeEventListener('click', onApiKeySave);
        navItems.forEach(item => item.removeEventListener('click', onNavClick));
    };
}

module.exports = {
    renderSettingsHTML,
    attachSettingsListeners
};