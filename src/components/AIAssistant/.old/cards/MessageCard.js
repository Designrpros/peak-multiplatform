const { renderSummariesCard } = require('./SummariesCard');

function renderMessageCard(role, content, commitHash = null, isComplete = true, isAuto = false, agent = null, isHtml = false) {
    // ASSISTANT / SYSTEM MESSAGES
    if (role === 'assistant' || role === 'system') {
        const renderedContent = isHtml ? content : (window.markdown ? window.markdown.render(content) : content);

        // Agent Info
        let agentColor = 'var(--peak-accent)';
        let agentName = 'AI Response';

        if (agent) {
            agentColor = agent.color || agentColor;
            agentName = agent.name || agentName;
        }

        const roleClass = role === 'assistant' ? 'ai' : role;

        // COMPLETE MESSAGE - with summaries and collapsible
        if (isComplete) {
            // Generate summaries card
            const summariesHtml = renderSummariesCard(content);

            return `
                <div class="term-chat-msg ${roleClass}">
                    <details class="message-card-minimal" open>
                        <summary class="message-summary-minimal">
                            <div class="summary-header-row">
                                <i data-lucide="chevron-right" class="message-chevron" style="width:12px; height:12px;"></i>
                                <i data-lucide="bot" style="width:12px; height:12px; color: ${agentColor};"></i>
                                <span class="message-summary-text" style="color: ${agentColor};">${agentName}</span>
                            </div>
                            <div class="summary-content-wrapper">
                                ${summariesHtml}
                            </div>
                        </summary>
                        <div class="message-content-minimal">
                            <div class="message-divider"></div>
                            ${isHtml ? renderedContent : `<div class="markdown-content">${renderedContent}</div>`}
                        </div>
                    </details>
                </div>
            `;
        } else {
            // STREAMING MESSAGE - same structure but with loading indicator
            return `
                <div class="term-chat-msg ${roleClass}">
                    <details class="message-card-minimal" open>
                        <summary class="message-summary-minimal">
                            <div class="summary-header-row">
                                <i data-lucide="loader-2" class="spin" style="width:12px; height:12px; animation: spin 1s linear infinite; color: ${agentColor};"></i>
                                <span class="message-summary-text" style="color: ${agentColor};">${agentName}</span>
                            </div>
                            <!-- No summaries yet for streaming -->
                        </summary>
                        <div class="message-content-minimal">
                            <div class="message-divider"></div>
                            ${isHtml ? renderedContent : `<div class="markdown-content">${renderedContent}</div>`}
                        </div>
                    </details>
                </div>
            `;
        }
    }

    // SYSTEM MESSAGES (Tool Outputs, Logs)
    if (role === 'system') {
        const renderedContent = isHtml ? content : (window.markdown ? window.markdown.render(content) : content);

        return `
            <div class="term-chat-msg system">
                <details class="message-card-minimal" open>
                    <summary class="message-summary-minimal" style="border-left-color: var(--peak-secondary);">
                        <div class="summary-header-row">
                            <i data-lucide="chevron-right" class="message-chevron" style="width:12px; height:12px;"></i>
                            <i data-lucide="terminal-square" style="width:12px; height:12px; color: var(--peak-secondary);"></i>
                            <span class="message-summary-text" style="color: var(--peak-secondary);">System Output</span>
                        </div>
                    </summary>
                    <div class="message-content-minimal">
                        <div class="message-divider"></div>
                        <div class="markdown-content system-content">
                            ${renderedContent}
                        </div>
                    </div>
                </details>
            </div>
        `;
    }

    // USER MESSAGES
    if (role === 'user') {
        // AUTO-CONTINUE / SYSTEM ACTION STYLE
        if (isAuto) {
            // User requested to hide auto-continue messages
            return '';
        }

        // STANDARD USER MESSAGE
        let displayContent = content;
        if (content.includes('USER QUESTION:')) {
            displayContent = content.split('USER QUESTION:').pop().trim();
        }

        // Hide "continue" messages (often from auto-run or continue button)
        if (displayContent.toLowerCase() === 'continue') {
            return '';
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

    // Fallback for other roles
    return '';
}


module.exports = { renderMessageCard };
