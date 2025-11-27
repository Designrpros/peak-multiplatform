// src/components/LandingPage/index.js
const { InputMode, SearchEngine, AvailableModels } = require('../../utils/enums.js');

let currentState = {
    selectedMode: InputMode.SEARCH,
    selectedSearchEngine: SearchEngine[0].id,
    selectedModel: AvailableModels[0].id,
    inputText: ""
};

let isSubmitting = false;

function renderLandingPageHTML() {
    return `
        <div id="landing-page-content" class="centered-content-container">
            <div class="landing-page-vstack">
                <img src="./assets/Peak-icon.png" alt="Peak Logo" class="app-logo">
                <div class="input-content-box">
                    <textarea id="main-input-field" class="search-input" placeholder="${getPlaceholder()}" rows="1">${currentState.inputText}</textarea>
                    <div class="control-row">
                        <select id="mode-select" class="control-pill mode-selector">
                            ${Object.values(InputMode).map(mode => `<option value="${mode}" ${currentState.selectedMode === mode ? 'selected' : ''}>${mode}</option>`).join('')}
                        </select>
                        <div id="dynamic-selector-container" style="display:flex;">${renderDynamicSelector()}</div>
                        <button id="action-button" class="action-button" disabled><i data-lucide="arrow-up"></i></button>
                    </div>
                </div>
                <a href="#" class="settings-link" id="settings-trigger">Settings</a>
            </div>
            
            <div class="page-indicators">
                <span class="indicator active" id="dot-landing"></span>
                <span class="indicator" id="dot-dashboard"></span>
                <span class="indicator" id="dot-workspaces"></span>
            </div>
        </div>
    `;
}

function renderDynamicSelector() {
    if (currentState.selectedMode === InputMode.SEARCH) {
        return `<select id="search-model-select" class="control-pill">${SearchEngine.map(e => `<option value="${e.id}" ${currentState.selectedSearchEngine === e.id ? 'selected' : ''}>${e.name}</option>`).join('')}</select>`;
    } else if (currentState.selectedMode === InputMode.LLM) {
        return `<select id="search-model-select" class="control-pill">${AvailableModels.map(m => `<option value="${m.id}" ${currentState.selectedModel === m.id ? 'selected' : ''}>${m.name} ${m.isPremium ? '(🔒)' : ''}</option>`).join('')}</select>`;
    }
    return '';
}

function getPlaceholder() {
    switch(currentState.selectedMode) {
        case InputMode.SEARCH: return "Search the web or enter URL...";
        case InputMode.NOTE: return "Enter note title...";
        case InputMode.LLM: return "Ask an AI assistant...";
        case InputMode.TERMINAL: return "Enter terminal command...";
        case InputMode.PROJECT: return "Open folder...";
        case InputMode.MINDMAP: return "Enter Mind Map name...";
        case InputMode.WHITEBOARD: return "Press Enter to open Whiteboard...";
        case InputMode.KANBAN: return "Press Enter to open Tasks...";
        case InputMode.DOCS: return "Press Enter to open DevDocs...";
        case InputMode.WORKSPACES: return "Press Enter to open Workspaces..."; // Changed
        default: return "Type here...";
    }
}

function attachLandingPageListeners() {
    isSubmitting = false;
    const input = document.getElementById('main-input-field');
    const modeSelect = document.getElementById('mode-select');
    const btn = document.getElementById('action-button');
    const settingsLink = document.getElementById('settings-trigger');
    
    // Navigation Dots
    const dotDash = document.getElementById('dot-dashboard');
    const dotWorkspaces = document.getElementById('dot-workspaces'); // Changed

    const updateUI = () => {
        if (!input) return;
        input.style.height = 'auto';
        input.style.height = input.scrollHeight + 'px';
        
        if (btn) {
            const isLaunchMode = [InputMode.PROJECT, InputMode.TERMINAL, InputMode.WHITEBOARD, InputMode.KANBAN, InputMode.DOCS, InputMode.WORKSPACES].includes(currentState.selectedMode);
            btn.disabled = !(input.value.trim().length > 0 || isLaunchMode);
        }
    };

    const triggerAction = () => {
        if (isSubmitting) return;
        isSubmitting = true;
        if(btn) btn.disabled = true;
        
        window.handlePerformAction({
            mode: currentState.selectedMode,
            query: currentState.inputText.trim(),
            engine: currentState.selectedSearchEngine,
            model: currentState.selectedModel
        });
        
        if(input) input.value = '';
        currentState.inputText = '';
        
        setTimeout(() => { 
            isSubmitting = false; 
            updateUI(); 
        }, 500);
    };

    if (input) {
        input.addEventListener('input', () => { currentState.inputText = input.value; updateUI(); });
        input.addEventListener('keydown', (e) => { 
            if (e.key === 'Enter') {
                if (!e.shiftKey) {
                    e.preventDefault(); 
                    triggerAction();
                }
            }
        });
        requestAnimationFrame(() => { input.focus(); });
        updateUI();
    }

    const attachDynamicListener = () => {
        const dynamicSelect = document.getElementById('search-model-select');
        if (dynamicSelect) {
            dynamicSelect.addEventListener('change', (e) => {
                if (currentState.selectedMode === InputMode.SEARCH) currentState.selectedSearchEngine = e.target.value;
                else currentState.selectedModel = e.target.value;
            });
        }
    };
    attachDynamicListener();

    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            currentState.selectedMode = modeSelect.value;
            const container = document.getElementById('dynamic-selector-container');
            if (container) container.innerHTML = renderDynamicSelector();
            if (input) input.placeholder = getPlaceholder();
            attachDynamicListener();
            updateUI();
        });
    }

    if (btn) btn.addEventListener('click', (e) => { e.preventDefault(); triggerAction(); });

    if (settingsLink) {
        settingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.ipcRenderer) window.ipcRenderer.send('open-settings-window');
        });
    }

    // Navigation Handlers
    if (dotDash) dotDash.addEventListener('click', () => {
         if(window.showDashboardPage) window.showDashboardPage();
    });
    
    // Workspaces Handler
    if (dotWorkspaces) dotWorkspaces.addEventListener('click', () => {
         if(window.showWorkspacesPage) window.showWorkspacesPage();
    });

    return () => {};
}

function resetLandingPageSubmitGuard() { isSubmitting = false; }
function setCurrentState(newState) { currentState = { ...currentState, ...newState }; }

module.exports = { renderLandingPageHTML, attachLandingPageListeners, resetLandingPageSubmitGuard, setCurrentState };