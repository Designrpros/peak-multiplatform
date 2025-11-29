// src/utils/markdown.js
const { marked } = require('marked');
const hljs = require('highlight.js');

// Configure Highlight.js
hljs.configure({
    ignoreUnescapedHTML: true
});

// Configure Marked
const renderer = new marked.Renderer();

// Custom Code Block Rendering with "Apply" button
renderer.code = (code, language) => {
    const validLang = !!(language && hljs.getLanguage(language));
    const highlighted = validLang
        ? hljs.highlight(code, { language }).value
        : hljs.highlightAuto(code).value;

    return `
        <div class="chat-code-block">
            <div class="code-header">
                <span class="lang-badge">${language || 'text'}</span>
                    <button class="copy-btn" title="Copy Code" onclick="navigator.clipboard.writeText(this.closest('.chat-code-block').querySelector('code').innerText)">
                        <i data-lucide="copy"></i>
                    </button>
                </div>
            <pre><code class="hljs ${language}">${highlighted}</code></pre>
        </div>`;
};

marked.setOptions({
    renderer: renderer,
    highlight: function (code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-',
    gfm: true,
    breaks: true
});

function renderMarkdown(text) {
    if (!text) return '';
    try {
        return marked.parse(text);
    } catch (e) {
        console.error("Markdown parsing error:", e);
        return text;
    }
}

module.exports = { renderMarkdown };