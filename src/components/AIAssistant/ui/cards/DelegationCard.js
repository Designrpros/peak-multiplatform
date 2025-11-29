
function renderDelegationCard(agentId, instruction) {
    return `
        <div class="tool-block delegation-block">
            <div class="header">
                <i data-lucide="users" style="width:12px; height:12px;"></i> Delegate Task
            </div>
            <div class="content">
                <strong>To Agent:</strong> ${agentId}<br/>
                <strong>Instruction:</strong> ${instruction}
            </div>
            <div class="footer">
                <button class="msg-action-btn tool-delegate-btn" data-agent_id="${encodeURIComponent(agentId)}" data-instruction="${encodeURIComponent(instruction)}">
                    <i data-lucide="arrow-right-circle" style="width:12px; height:12px;"></i> Delegate
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderDelegationCard };
