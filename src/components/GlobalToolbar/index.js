// src/components/GlobalToolbar/index.js

function renderGlobalToolbar() {
    return `
        <div id="global-toolbar">
            <div class="global-navigation-controls">
                <button id="global-nav-back" class="nav-button" disabled><i data-lucide="chevron-left"></i></button>
                <button id="global-nav-forward" class="nav-button" disabled><i data-lucide="chevron-right"></i></button>
                <button id="global-nav-reload" class="nav-button"><i data-lucide="rotate-cw"></i></button>
            </div>
            <div class="global-address-bar-container">
                <input type="text" id="global-address-bar-input" class="address-bar" placeholder="Enter URL or Search">
            </div>

            <div class="global-toolbar-controls">
                <a onclick="window.addEmptyTab()" title="New Tab" class="toolbar-button-wrapper">
                    <i data-lucide="plus" class="toolbar-button"></i>
                </a>
                
                <a onclick="window.openInspector('notes')" title="Note History" class="toolbar-button-wrapper">
                    <i data-lucide="notebook" class="toolbar-button"></i>
                </a>
                <a onclick="window.openInspector('chat')" title="Chat History" class="toolbar-button-wrapper">
                    <i data-lucide="message-square" class="toolbar-button"></i>
                </a>
                <a onclick="window.openInspector('mindmap')" title="Mind Map History" class="toolbar-button-wrapper">
                    <i data-lucide="git-fork" class="toolbar-button"></i>
                </a>
                <a onclick="window.openInspector('tasks')" title="Task Board" class="toolbar-button-wrapper">
                    <i data-lucide="check-square" class="toolbar-button"></i>
                </a>
                <a onclick="window.openInspector('whiteboard')" title="Whiteboard History" class="toolbar-button-wrapper">
                    <i data-lucide="pen-tool" class="toolbar-button"></i>
                </a>
                
                <a onclick="window.openInspector('log')" title="Web History" class="toolbar-button-wrapper">
                    <i data-lucide="history" class="toolbar-button"></i>
                </a>
                <a onclick="window.openInspector('session')" title="Session History" class="toolbar-button-wrapper">
                    <i data-lucide="database" class="toolbar-button"></i>
                </a>
            </div>
        </div>
    `;
}

module.exports = {
    renderGlobalToolbar
};