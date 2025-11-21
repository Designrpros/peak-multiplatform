// src/components/SettingsView/index.js
const { ipcRenderer } = require('electron');

const FEATURE_LIST = [
    { title: 'Quick Search & Launch', description: 'Instantly search, open URLs, or create new items (Notes, Chats, Projects) from the main input bar.' },
    { title: 'Tab Management', description: 'Organize your work with multiple tabs for web pages, terminals, code projects, and notes.' },
    { title: 'Project Explorer', description: 'Open local folders, browse files, and use the integrated CodeMirror editor with auto-save and file system interaction.' },
    { title: 'Embedded Terminal', description: 'Run a fully functional shell within the Project View, anchored to your current project directory.' },
    { title: 'AI Assistant', description: 'Get context-aware help (explain, debug, refactor) for the file currently open in the Project Explorer sidebar.' },
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
    
    const switchTab = (sectionId) => {
        navItems.forEach(item => item.classList.remove('active'));
        contentPanes.forEach(pane => pane.classList.remove('active'));
        const activeNav = document.querySelector(`.settings-nav-item[data-section="${sectionId}"]`);
        if (activeNav) activeNav.classList.add('active');
        const activeContent = document.getElementById(`section-${sectionId}-content`);
        if (activeContent) activeContent.classList.add('active');
        const scroller = document.getElementById('tab-content-container');
        if(scroller) scroller.scrollTop = 0;
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
};1