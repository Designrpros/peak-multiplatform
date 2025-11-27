// src/components/Workspaces/index.js
const { ipcRenderer } = require('electron');

// Color palette matching the Swift extension
const WORKSPACE_COLORS = {
    blue: '#007AFF',
    purple: '#AF52DE',
    pink: '#FF2D55',
    orange: '#FF9500',
    green: '#34C759',
    gray: '#8E8E93'
};

function renderWorkspacesHTML() {
    const workspaces = window.tabManager.workspaceStore.get('items', []);
    // Sort by createdAt descending
    workspaces.sort((a, b) => b.createdAt - a.createdAt);

    const gridHtml = workspaces.map(ws => renderWorkspaceCard(ws)).join('');

    return `
        <div id="workspaces-content" class="workspaces-container">
            <div class="workspaces-header">
                <h1 class="ws-page-title">Workspaces</h1>
                <button id="btn-save-session" class="ws-primary-btn">
                    <i data-lucide="plus"></i> Save Current Session
                </button>
            </div>

            <div class="workspaces-scroll-area">
                <div class="workspaces-grid">
                    ${workspaces.length > 0 ? gridHtml : `<div class="empty-ws-state">No saved workspaces yet.</div>`}
                </div>
            </div>

            <div id="create-ws-overlay" class="ws-overlay" style="display: none;">
                <div class="ws-popover">
                    <h3>Name Workspace</h3>
                    <input type="text" id="ws-title-input" placeholder="e.g. Morning Routine" class="ws-input">
                    
                    <div class="ws-color-picker">
                        ${Object.keys(WORKSPACE_COLORS).map(c => `
                            <div class="color-dot" data-color="${c}" style="background-color: ${WORKSPACE_COLORS[c]}"></div>
                        `).join('')}
                    </div>
                    
                    <div class="ws-popover-actions">
                        <button id="btn-cancel-ws" class="ws-text-btn">Cancel</button>
                        <button id="btn-confirm-ws" class="ws-primary-btn">Save</button>
                    </div>
                </div>
            </div>

            <div class="page-indicators">
                <span class="indicator" id="dot-landing-w"></span>
                <span class="indicator" id="dot-dashboard-w"></span>
                <span class="indicator active" id="dot-workspaces-w"></span>
            </div>
        </div>
    `;
}

function renderWorkspaceCard(workspace) {
    const colorHex = WORKSPACE_COLORS[workspace.color] || WORKSPACE_COLORS.blue;
    const tabCount = workspace.tabs ? workspace.tabs.length : 0;
    const dateStr = new Date(workspace.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

    return `
        <div class="workspace-card" data-id="${workspace.id}">
            <div class="ws-card-header">
                <div class="ws-card-dot" style="background-color: ${colorHex};"></div>
                <span class="ws-card-title" title="${workspace.title}">${workspace.title}</span>
                <div class="ws-card-arrow"><i data-lucide="arrow-right-circle"></i></div>
            </div>
            
            <div class="ws-card-footer">
                <span class="ws-meta-primary">${tabCount} Tabs Saved</span>
                <span class="ws-meta-secondary">${dateStr}</span>
            </div>

            <div class="ws-delete-btn" title="Delete Workspace">
                <i data-lucide="trash-2"></i>
            </div>
        </div>
    `;
}

function attachWorkspacesListeners(container) {
    const overlay = container.querySelector('#create-ws-overlay');
    const titleInput = container.querySelector('#ws-title-input');
    const colorDots = container.querySelectorAll('.color-dot');
    
    let selectedColor = 'blue';

    // --- NAVIGATION ---
    container.querySelector('#dot-landing-w').onclick = () => window.showLandingPage();
    container.querySelector('#dot-dashboard-w').onclick = () => window.showDashboardPage();

    // --- SAVE SESSION FLOW ---
    container.querySelector('#btn-save-session').onclick = () => {
        overlay.style.display = 'flex';
        titleInput.focus();
        // Reset selection
        selectedColor = 'blue';
        colorDots.forEach(d => d.classList.toggle('selected', d.dataset.color === 'blue'));
    };

    container.querySelector('#btn-cancel-ws').onclick = () => {
        overlay.style.display = 'none';
        titleInput.value = '';
    };

    colorDots.forEach(dot => {
        dot.onclick = () => {
            selectedColor = dot.dataset.color;
            colorDots.forEach(d => d.classList.remove('selected'));
            dot.classList.add('selected');
        };
    });

    container.querySelector('#btn-confirm-ws').onclick = () => {
        const title = titleInput.value.trim() || "Untitled";
        if (window.tabManager) {
            window.tabManager.saveCurrentWorkspace(title, selectedColor);
        }
        overlay.style.display = 'none';
        titleInput.value = '';
    };

    // --- CARD INTERACTIONS ---
    const grid = container.querySelector('.workspaces-grid');
    if (grid) {
        grid.addEventListener('click', (e) => {
            // Delete Handler
            const deleteBtn = e.target.closest('.ws-delete-btn');
            if (deleteBtn) {
                e.stopPropagation();
                const card = deleteBtn.closest('.workspace-card');
                if (confirm("Delete this workspace?")) {
                    window.tabManager.deleteWorkspace(card.dataset.id);
                }
                return;
            }

            // Restore Handler
            const card = e.target.closest('.workspace-card');
            if (card) {
                window.tabManager.restoreWorkspace(card.dataset.id);
            }
        });
    }

    // Close popover on outside click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.style.display = 'none';
    });

    if (window.lucide) window.lucide.createIcons();
}

module.exports = { renderWorkspacesHTML, attachWorkspacesListeners };