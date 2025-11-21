// src/components/Docs/index.js

function renderDocsHTML() {
    return `
        <div class="docs-container" style="width:100%; height:100%; display:flex; flex-direction:column;">
            <webview id="devdocs-view" 
                     src="https://devdocs.io" 
                     style="width:100%; flex-grow:1; border:none;"></webview>
        </div>
    `;
}

function attachDocsListeners() {
    const webview = document.getElementById('devdocs-view');
    return () => {};
}

module.exports = { renderDocsHTML, attachDocsListeners };