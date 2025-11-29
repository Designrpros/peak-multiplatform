
function renderMessageCard(role, content, commitHash = null) {
    const div = document.createElement('div');
    div.className = `term-chat-msg ${role} markdown-content`;

    // Render Markdown
    if (role === 'assistant' || role === 'system') {
        div.innerHTML = window.markdown ? window.markdown.render(content) : content;
    } else {
        // User message
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

    // For assistant, we just return the div string
    return `<div class="term-chat-msg ${role} markdown-content">${window.markdown ? window.markdown.render(content) : content}</div>`;
}

module.exports = { renderMessageCard };
