/**
 * StepCard.js
 * Renders a collapsible step card with a title and content.
 * Used for multi-step agent workflows.
 */

function renderStepCard(title, content, isComplete = false) {
    // If incomplete, force open. If complete, default to closed (or open if it was the last one?)
    // Usually, we want previous steps collapsed, current step open.
    // StreamParser will call this repeatedly.
    // If isComplete is false, it means it's the active step -> Open.
    // If isComplete is true, it means it's done -> Collapsed (by default).

    const openAttr = !isComplete ? 'open' : '';

    const icon = isComplete
        ? '<i data-lucide="check-circle-2" style="width:14px; height:14px; color: var(--peak-success);"></i>'
        : '<i data-lucide="loader-2" class="spin" style="width:14px; height:14px; color: var(--peak-accent);"></i>';

    const statusClass = isComplete ? 'step-complete' : 'step-active';

    return `
        <div class="step-card ${statusClass}">
            <details ${openAttr}>
                <summary class="step-summary">
                    <div class="step-header-left">
                        <span class="step-icon">${icon}</span>
                        <span class="step-title">${title}</span>
                    </div>
                    <i data-lucide="chevron-down" class="step-chevron"></i>
                </summary>
                <div class="step-content">
                    ${content}
                </div>
            </details>
        </div>
    `;
}

module.exports = { renderStepCard };
