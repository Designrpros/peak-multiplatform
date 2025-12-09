// src/components/Dashboard/index.js

function renderDashboardHTML(activityItems = [], bookmarks = []) {

    const recent = activityItems.slice(0, 6).map(item => {
        const timeString = new Date(item.sortTime || Date.now()).toLocaleDateString();
        let title = item.title || 'Untitled';
        let meta = timeString;
        if (item.type === 'web') meta = new URL(item.url).hostname;
        else if (item.type === 'chat') meta = item.model || 'Peak Assistant';

        return `
        <div class="recent-item" 
             data-type="${item.type}" 
             data-id="${item.id || ''}" 
             data-url="${item.url || ''}">
            <div class="recent-icon"><i data-lucide="${item.icon || 'clock'}"></i></div>
            <div class="recent-info">
                <div class="recent-title">${title}</div>
                <div class="recent-url">${meta}</div>
            </div>
        </div>
    `}).join('');

    const bookmarkGrid = bookmarks.length > 0 ? bookmarks.map((item, index) => `
        <div class="bookmark-item" 
             draggable="true" 
             data-index="${index}" 
             data-url="${escapeHtml(item.url)}">
            <div class="bookmark-delete" data-url="${escapeHtml(item.url)}">
                <i data-lucide="x"></i>
            </div>
            <img src="${item.icon}" class="bookmark-icon" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
            <div class="bookmark-fallback-icon" style="display:none"><i data-lucide="globe"></i></div>
            <div class="bookmark-text">
                <span class="bookmark-title">${item.title}</span>
            </div>
        </div>
    `).join('') : '<div class="empty-state-text">No bookmarks yet. Star pages in the Web History inspector!</div>';

    return `
        <div id="dashboard-content" class="centered-content-container">
            <div class="dashboard-vstack">
                <div class="dashboard-header">
                    <h1 class="dashboard-title">Dashboard</h1>
                    <span class="date-display">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</span>
                </div>
                
                ${recent ? `
                <div class="recent-activity-section">
                    <h2 class="section-title">Recent Activity</h2>
                    <div class="recent-grid">${recent}</div>
                </div>` : ''}
                
                <div class="bookmark-section">
                    <h2 class="section-title">Saved Bookmarks</h2>
                    <div class="bookmark-grid" id="bookmark-grid-container">
                        ${bookmarkGrid}
                    </div>
                </div>
            </div>
            <div class="page-indicators">
                <span class="indicator" id="dot-landing"></span>
                <span class="indicator active" id="dot-dashboard"></span>
                <span class="indicator" id="dot-workspaces"></span>
            </div>
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function attachDashboardListeners() {
    const container = document.getElementById('dashboard-content');

    if (container) {
        container.addEventListener('click', (e) => {
            const deleteBtn = e.target.closest('.bookmark-delete');
            if (deleteBtn) {
                e.stopPropagation();
                const url = deleteBtn.dataset.url;
                if (window.toggleBookmark) window.toggleBookmark(url);
                return;
            }
            const recentItem = e.target.closest('.recent-item');
            if (recentItem) {
                const type = recentItem.dataset.type;
                const id = recentItem.dataset.id;
                const url = recentItem.dataset.url;
                if (type === 'web') window.handleBookmarkClick(url);
                else if (type === 'chat') window.openChatFromHistory(id);
                else if (type === 'note') window.openNoteFromHistory(id);
                else if (type === 'mindmap') window.openMindMapFromHistory(id);
                else if (type === 'whiteboard') window.openWhiteboardFromHistory(id);
                else if (type === 'terminal') window.openTerminalFromHistory(id);
                else if (type === 'kanban') window.openKanbanBoard(id);
                else if (type === 'docs') window.openDocsFromHistory(id);
                return;
            }
            const bookmarkItem = e.target.closest('.bookmark-item');
            if (bookmarkItem) {
                const url = bookmarkItem.dataset.url;
                if (url && window.handleBookmarkClick) window.handleBookmarkClick(url);
            }
        });
    }

    const dotLanding = document.getElementById('dot-landing');
    const dotWorkspaces = document.getElementById('dot-workspaces'); // Changed

    if (dotLanding) dotLanding.addEventListener('click', () => window.showLandingPage());
    if (dotWorkspaces) dotWorkspaces.addEventListener('click', () => window.showWorkspacesPage());

    const grid = document.getElementById('bookmark-grid-container');
    if (grid) {
        let draggedItem = null;
        grid.addEventListener('dragstart', (e) => {
            const item = e.target.closest('.bookmark-item');
            if (!item) return;
            draggedItem = item;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', item.dataset.index);
            requestAnimationFrame(() => item.classList.add('dragging'));
        });
        grid.addEventListener('dragend', (e) => {
            const item = e.target.closest('.bookmark-item');
            if (item) item.classList.remove('dragging');
            document.querySelectorAll('.bookmark-item').forEach(el => el.classList.remove('drag-over'));
            draggedItem = null;
        });
        grid.addEventListener('dragover', (e) => {
            e.preventDefault();
            const item = e.target.closest('.bookmark-item');
            if (item && item !== draggedItem) item.classList.add('drag-over');
        });
        grid.addEventListener('dragleave', (e) => {
            const item = e.target.closest('.bookmark-item');
            if (item) item.classList.remove('drag-over');
        });
        grid.addEventListener('drop', (e) => {
            e.preventDefault();
            const item = e.target.closest('.bookmark-item');
            if (!item || item === draggedItem) return;
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(item.dataset.index);
            if (!isNaN(fromIndex) && !isNaN(toIndex)) window.reorderBookmarks(fromIndex, toIndex);
        });
    }
    return () => { };
}

function handleBookmarkClick(url) {
    if (window.handlePerformAction) window.handlePerformAction({ mode: 'Search', query: url, engine: 'google' });
}

module.exports = { renderDashboardHTML, attachDashboardListeners, handleBookmarkClick };