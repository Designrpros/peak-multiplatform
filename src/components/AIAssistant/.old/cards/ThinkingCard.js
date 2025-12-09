/**
 * ThinkingCard.js
 * Minimal thinking card that displays a single line by default
 * and expands on click to show the full thinking process in a fixed-height scrollview.
 */

function renderThinkingCard(content, isComplete = false) {
    // Escape content to prevent HTML injection
    const safeContent = content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const icon = isComplete
        ? '<i data-lucide="brain" style="width:12px; height:12px;"></i>'
        : '<i data-lucide="loader-2" class="spin" style="width:12px; height:12px;"></i>';

    const headerText = isComplete ? 'Thought Process' : 'Thinking...';

    return `
        <div class="thinking-block-minimal">
            <details ${!isComplete ? '' : ''}>
                <summary class="thinking-summary-minimal">
                    <span class="thinking-icon">${icon}</span>
                    <span class="thinking-text">${headerText}</span>
                    <i data-lucide="chevron-down" class="thinking-chevron"></i>
                </summary>
                <div class="thinking-scroll-area">
                    <pre class="thinking-content-raw">${safeContent}</pre>
                </div>
            </details>
        </div>
    `;
}

module.exports = { renderThinkingCard };
