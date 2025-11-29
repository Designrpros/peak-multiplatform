
function renderThinkingCard(content, isComplete = true) {
    if (isComplete) {
        return `
            <details class="thinking-block">
                <summary class="thinking-summary">
                    <i data-lucide="lightbulb" style="width:14px; height:14px;"></i> 
                    <span>Thinking Process</span>
                </summary>
                <div class="thinking-content">${content}</div>
            </details>
        `;
    } else {
        return `
            <details class="thinking-block" open>
                <summary class="thinking-summary">
                    <i data-lucide="loader-2" class="spin" style="width:14px; height:14px; animation: spin 1s linear infinite;"></i> 
                    <span>Thinking...</span>
                </summary>
                <div class="thinking-content">${content}</div>
            </details>
        `;
    }
}

module.exports = { renderThinkingCard };
