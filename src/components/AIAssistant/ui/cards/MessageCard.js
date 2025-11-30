const { renderSummariesCard } = require('./SummariesCard');

function renderMessageCard(role, content, commitHash = null, isComplete = true, isAuto = false) {
    // Render Markdown
    if (role === 'assistant' || role === 'system') {
        const renderedContent = window.markdown ? window.markdown.render(content) : content;

        // Only make complete messages collapsible with summaries
        if (isComplete) {
            // Generate summaries card
            const summariesHtml = renderSummariesCard(content);

            return `
                <div class="term-chat-msg ${role}">
                    <details class="message-card-minimal">
                        <summary class="message-summary-minimal">
                            <i data-lucide="chevron-right" class="message-chevron" style="width:12px; height:12px;"></i>
                            <i data-lucide="bot" style="width:12px; height:12px; color: var(--peak-accent);"></i>
                            <span class="message-summary-text">AI Response</span>
                        </summary>
                        <div class="message-content-minimal">
                            ${summariesHtml}
                            <div class="message-divider"></div>
                            <div class="markdown-content">
                                ${renderedContent}
                            </div>
                        </div>
                    </details>
                </div>
            `;
        } else {
            // Streaming message - show normally without collapse
            return `<div class="term-chat-msg ${role} markdown-content">${renderedContent}</div>`;
        }
    } else {
        // User message

        // AUTO-CONTINUE / SYSTEM ACTION STYLE
        if (isAuto) {
            return `
                <div class="term-chat-msg system-action" style="display:flex; justify-content:center; margin: 8px 0; opacity: 0.8;">
                    <div style="background:var(--peak-bg-secondary); color:var(--peak-secondary); padding: 4px 12px; border-radius: 12px; font-size: 11px; display:flex; align-items:center; gap:6px; border:1px solid var(--peak-border);">
                        <i data-lucide="fast-forward" style="width:10px; height:10px;"></i>
                        <span>${content === 'continue' ? 'Auto-Continuing...' : content}</span>
                    </div>
                </div>
            `;
        }

        // STANDARD USER MESSAGE
        let displayContent = content;
        if (content.includes('USER QUESTION:')) {
            displayContent = content.split('USER QUESTION:').pop().trim();
        }

        const isLongMessage = displayContent.length > 300;
        const collapsedClass = isLongMessage ? 'collapsed' : '';
        const showMoreBtn = isLongMessage
            ? `<button class="show-more-btn" data-action="toggle-expand">Show More</button>`
            : '';

        let revertBtnHtml = '';
        if (commitHash) {
            revertBtnHtml = `
                <button class="revert-btn" data-action="revert" data-hash="${commitHash}" title="Revert project to this state">
                    <i data-lucide="rotate-ccw"></i>
                </button>
            `;
        }

        return `
            <div class="term-chat-msg ${role} markdown-content">
                <div class="user-msg-content ${collapsedClass}">
                    <span>${displayContent}</span>
                </div>
                <div class="msg-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:4px; min-height:20px;">
                    ${showMoreBtn}
                    ${revertBtnHtml}
                </div>
            </div>
        `;
    }
}

module.exports = { renderMessageCard };
