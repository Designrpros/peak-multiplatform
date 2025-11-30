

function renderThinkingCard(content, isComplete = true) {
    // Extract first meaningful line as summary (skip empty lines)
    const lines = content.split('\n').filter(l => l.trim());
    const firstLine = lines[0] || 'Thinking...';
    const summary = firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;

    if (isComplete) {
        return `
            <details class="thinking-block-minimal">
                <summary class="thinking-summary-minimal">
                    <i data-lucide="chevron-right" class="thinking-chevron" style="width:12px; height:12px; transition: transform 0.2s;"></i>
                    <span class="thinking-summary-text">${summary}</span>
                </summary>
                <div class="thinking-content-minimal">${content}</div>
            </details>
        `;
    } else {
        // Still show streaming with loader, but collapsed
        return `
            <details class="thinking-block-minimal">
                <summary class="thinking-summary-minimal">
                    <i data-lucide="loader-2" class="spin" style="width:12px; height:12px; animation: spin 1s linear infinite;"></i>
                    <span class="thinking-summary-text">Thinking...</span>
                </summary>
                <div class="thinking-content-minimal">${content}</div>
            </details>
        `;
    }
}

module.exports = { renderThinkingCard };

