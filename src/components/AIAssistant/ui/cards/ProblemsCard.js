
function renderGetProblemsCard() {
    return `
        <div class="tool-card-compact">
            <div class="tool-line">
                <i data-lucide="alert-triangle" style="width:10px; height:10px; flex-shrink:0; color:#f59e0b; opacity:0.8;"></i>
                <span class="tool-label-compact" style="color:#f59e0b;">Problems</span>
                <span class="tool-content-compact">Check project for errors and warnings</span>
                <button class="tool-action-btn-compact tool-problems-btn">
                    <i data-lucide="list" style="width:9px; height:9px;"></i>
                    Check
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderGetProblemsCard };
