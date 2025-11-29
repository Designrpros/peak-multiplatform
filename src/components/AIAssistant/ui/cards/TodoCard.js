const { renderMarkdown } = require('../../../../utils/markdown');

function escapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function unescapeHTML(str) {
    if (!str) return '';
    return str
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/>/g, ">")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
}

function renderTodoCard(content) {
    const unescaped = unescapeHTML(content);
    const rendered = renderMarkdown(unescaped);
    return `
        <div class="tool-block todo-block">
            <div class="header">
                <i data-lucide="list-todo" style="width:12px; height:12px;"></i> Plan Update
            </div>
            <div class="content markdown-content">
                ${rendered}
            </div>
        </div>
    `;
}

module.exports = { renderTodoCard };
