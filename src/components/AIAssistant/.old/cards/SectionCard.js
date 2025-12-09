
function renderSectionCard(title, content) {
    // Compact design matching ViewFileCard
    return `
        <div class="tool-card-compact section-card">
            <div class="tool-line" style="cursor: pointer;" onclick="this.parentElement.classList.toggle('open')">
                <i data-lucide="search" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-secondary); opacity:0.6;"></i>
                <span class="tool-label-compact">Analysis</span>
                <span class="tool-content-compact">${title}</span>
                <i data-lucide="chevron-right" class="chevron" style="width:10px; height:10px; margin-left:auto; transition:transform 0.2s;"></i>
            </div>
            <div class="section-content-compact" style="display:none; padding: 8px 12px; border-top: 1px solid var(--border-color); font-size: 11px; color: var(--peak-primary);">
                ${content}
            </div>
        </div>
        <style>
            .section-card.open .section-content-compact { display: block !important; }
            .section-card.open .chevron { transform: rotate(90deg); }
        </style>
    `;
}

module.exports = { renderSectionCard };
