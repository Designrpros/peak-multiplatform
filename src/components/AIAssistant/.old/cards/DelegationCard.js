
function renderDelegationCard(agentId, instruction) {
    const shortInstruction = instruction.length > 60 ? instruction.slice(0, 60) + '…' : instruction;

    return `
        <div class="tool-card-compact">
            <div class="tool-line">
                <i data-lucide="users" style="width:10px; height:10px; flex-shrink:0; color:#8b5cf6; opacity:0.8;"></i>
                <span class="tool-label-compact" style="color:#8b5cf6;">Delegate</span>
                <span class="tool-content-compact">${agentId} → ${shortInstruction}</span>
                <button class="tool-action-btn-compact tool-delegate-btn" data-agent_id="${encodeURIComponent(agentId)}" data-instruction="${encodeURIComponent(instruction)}">
                    <i data-lucide="send" style="width:9px; height:9px;"></i>
                    Send
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderDelegationCard };
