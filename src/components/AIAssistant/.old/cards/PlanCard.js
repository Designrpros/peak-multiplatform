/**
 * PlanCard.js
 * Renders a structured plan for user approval.
 */

// const { renderCardHeader } = require('./CardUtils');

function renderPlanCard(planXml) {
    // Parse XML
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(planXml, "text/xml");
    const steps = Array.from(xmlDoc.querySelectorAll('step'));

    const stepsHtml = steps.map(step => {
        const id = step.getAttribute('id');
        const content = step.textContent;
        return `
            <div class="plan-step" style="display:flex; gap:8px; padding:6px 0; border-bottom:1px solid var(--border-color);">
                <div style="font-weight:600; color:var(--peak-secondary); min-width:20px;">${id}.</div>
                <div style="color:var(--text-color); font-size:12px;">${content}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="plan-card" style="
            background: var(--bg-secondary);
            border: 1px solid var(--peak-primary);
            border-radius: 6px;
            margin: 8px 0;
            overflow: hidden;
        ">
            <div class="plan-header" style="
                background: var(--peak-primary-dim);
                padding: 8px 12px;
                display: flex;
                align-items: center;
                gap: 8px;
                border-bottom: 1px solid var(--peak-primary);
            ">
                <i data-lucide="map" style="width:14px; height:14px; color:var(--peak-primary);"></i>
                <span style="font-weight:600; font-size:12px; color:var(--peak-primary);">Proposed Plan</span>
            </div>
            
            <div class="plan-content" style="padding: 12px;">
                ${stepsHtml}
            </div>

            <div class="plan-actions" style="
                padding: 8px 12px;
                background: var(--bg-tertiary);
                display: flex;
                gap: 8px;
                justify-content: flex-end;
                border-top: 1px solid var(--border-color);
            ">
                <button class="plan-reject-btn" onclick="window.dispatchEvent(new CustomEvent('peak-plan-reject'))" style="
                    background: transparent;
                    border: 1px solid var(--peak-error);
                    color: var(--peak-error);
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: 11px;
                    cursor: pointer;
                ">Reject / Refine</button>
                
                <button class="plan-approve-btn" onclick="window.dispatchEvent(new CustomEvent('peak-plan-approve'))" style="
                    background: var(--peak-primary);
                    border: none;
                    color: white;
                    padding: 4px 12px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                ">
                    <i data-lucide="check" style="width:12px; height:12px;"></i>
                    Approve Plan
                </button>
            </div>
        </div>
    `;
}

module.exports = { renderPlanCard };
