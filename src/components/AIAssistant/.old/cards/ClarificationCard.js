
function renderClarificationCard(question) {
    return `
        <div class="tool-card-compact clarification-card" style="border-color: var(--peak-accent) !important; background: rgba(var(--peak-accent-rgb), 0.05);">
            <div class="tool-line" style="align-items: flex-start;">
                <i data-lucide="help-circle" style="width:14px; height:14px; flex-shrink:0; color:var(--peak-accent); margin-top:2px;"></i>
                <div style="display:flex; flex-direction:column; gap:4px; width:100%;">
                    <span class="tool-label-compact" style="color:var(--peak-accent); font-weight:600;">Clarification Needed</span>
                    <div class="tool-content-compact" style="white-space: pre-wrap; line-height: 1.5;">${question}</div>
                </div>
            </div>
        </div>
    `;
}

module.exports = { renderClarificationCard };
