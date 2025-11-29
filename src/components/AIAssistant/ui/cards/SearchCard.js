
function renderSearchCard(query) {
    return `
        <div class="tool-block search-block">
            <div class="header">
                <i data-lucide="search" style="width:12px; height:12px;"></i> Suggested Search
            </div>
            <div class="content">${query}</div>
            <div class="footer">
                <button class="msg-action-btn tool-search-btn" data-query="${encodeURIComponent(query)}">
                    <i data-lucide="search" style="width:10px; height:10px;"></i> Search Project
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderSearchCard };
