
function renderGetProblemsCard() {
    return `
        <div class="tool-block problems-block">
            <div class="header">
                <i data-lucide="alert-triangle" style="width:12px; height:12px;"></i> Get Problems
            </div>
            <div class="content">Check project for errors and warnings.</div>
            <div class="footer">
                <button class="msg-action-btn tool-problems-btn">
                    <i data-lucide="list" style="width:10px; height:10px;"></i> Check Problems
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderGetProblemsCard };
