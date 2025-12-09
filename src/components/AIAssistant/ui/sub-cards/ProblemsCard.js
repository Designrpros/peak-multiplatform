
function renderGetProblemsCard() {
    return `
        <div class="file-edit-card-compact" style="border-left: 3px solid var(--peak-accent); padding-left: 8px;">
            <div class="file-edit-line" style="display: flex; align-items: center; gap: 8px;">
                <i data-lucide="alert-triangle" style="width:10px; height:10px; flex-shrink:0; color:var(--peak-accent);"></i>
                <span class="file-path-compact">Problems</span>
                <span class="file-meta-compact" style="margin-left:auto;">Check project errors</span>
            </div>
        </div>
    `;
}

module.exports = { renderGetProblemsCard };
