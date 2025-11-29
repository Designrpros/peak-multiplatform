
function renderSectionCard(title, content) {
    return `
        <details class="section-card" open>
            <summary class="section-summary">
                <i data-lucide="chevron-right" class="arrow"></i>
                ${title}
            </summary>
            <div class="section-content">
                ${content}
            </div>
        </details>
    `;
}

module.exports = { renderSectionCard };
