
function renderCommandCard(cmd) {
    return `
        <div class="tool-block command-block">
            <div class="header">
                <i data-lucide="terminal" style="width:12px; height:12px;"></i> Suggested Command
            </div>
            <div class="content">${cmd}</div>
            <div class="footer">
                <button class="msg-action-btn tool-run-btn" data-cmd="${encodeURIComponent(cmd)}">
                    <i data-lucide="play" style="width:10px; height:10px;"></i> Run
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderCommandCard };
