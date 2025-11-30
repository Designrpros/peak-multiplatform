
function renderAgentCard(agentName, status, icon = 'bot') {
    return `
        <div class="tool-card-compact agent-card" style="border-color: var(--peak-accent) !important;">
            <div class="tool-line">
                <div style="width:20px; height:20px; border-radius:50%; background:var(--peak-accent); display:flex; align-items:center; justify-content:center; margin-right:8px;">
                    <i data-lucide="${icon}" style="width:12px; height:12px; color:white;"></i>
                </div>
                <span class="tool-label-compact" style="color:var(--peak-accent); font-weight:600;">${agentName}</span>
                <span class="tool-content-compact" style="opacity:0.8;">${status}</span>
            </div>
        </div>
    `;
}

module.exports = { renderAgentCard };
