
function renderSearchCard(query) {
    return `
        <div class="tool-card-compact">
            <div class="tool-line">
                <i data-lucide="search" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="tool-label-compact">Search</span>
                <span class="tool-content-compact">${query}</span>
                <button class="tool-action-btn-compact tool-search-btn" data-query="${encodeURIComponent(query)}">
                    <i data-lucide="arrow-right" style="width:9px; height:9px;"></i>
                    Go
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderSearchCard };
