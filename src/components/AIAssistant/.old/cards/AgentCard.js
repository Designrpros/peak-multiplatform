/**
 * AgentCard.js
 * Displays the currently active agent in the multi-agent workflow
 */

function renderAgentCard(agent, status = 'Working') {
    const agentName = typeof agent === 'string' ? agent : agent.name;
    const agentModel = typeof agent === 'object' && agent.modelId ? agent.modelId.split('/').pop() : '';
    const agentColor = typeof agent === 'object' && agent.color ? agent.color : 'var(--peak-accent)';
    const agentId = typeof agent === 'object' && agent.id ? agent.id : '';
    const isRoot = typeof agent === 'object' && agent.parentId === null;

    const displayStatus = status === 'Working' ? '⏳ Working...' : status;

    return `
        <div class="tool-card-compact agent-activity-card" style="
            border-left: 3px solid ${agentColor} !important;
            background: linear-gradient(90deg, ${agentColor}10, transparent);
            margin: 8px 0;
            cursor: pointer;
            transition: all 0.2s;
            width: 100%;
            box-sizing: border-box;
        " data-agent-id="${agentId}" title="Click to inspect agent">
            <div class="tool-line" style="gap: 12px; flex-wrap: wrap;">
                <!-- Agent Icon -->
                <div style="
                    width:24px; 
                    height:24px; 
                    border-radius:50%; 
                    background:${agentColor}; 
                    display:flex; 
                    align-items:center; 
                    justify-content:center;
                    box-shadow: 0 2px 6px ${agentColor}40;
                    flex-shrink: 0;
                ">
                    <i data-lucide="bot" style="width:14px; height:14px; color:white;"></i>
                </div>
                
                <!-- Agent Info -->
                <div style="flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 150px;">
                    <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                        <span class="tool-label-compact" style="
                            color: ${agentColor}; 
                            font-weight:700; 
                            font-size:11px;
                            white-space: nowrap;
                        ">${agentName}</span>
                        ${isRoot ? '<span style="font-size:8px; padding:1px 4px; border-radius:2px; background:var(--peak-accent); color:white;">ROOT</span>' : ''}
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size:9px; color:var(--peak-secondary); font-family: var(--font-mono);">${agentModel}</span>
                        <span class="agent-status-text" style="font-size:9px; color:var(--peak-secondary);">${displayStatus}</span>
                    </div>
                </div>
                
                <!-- Inspect Icon -->
                <div style="
                    opacity: 0.4;
                    transition: opacity 0.2s;
                    margin-left: auto;
                ">
                    <i data-lucide="info" style="width:14px; height:14px; color:var(--peak-secondary);"></i>
                </div>
            </div>
        </div>
    `;
}

module.exports = { renderAgentCard };
