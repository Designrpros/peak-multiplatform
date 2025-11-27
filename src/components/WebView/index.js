// src/components/WebView/index.js

function getWebViewComponent(url, tabId) {
    // FIX: Added 'allowpopups' back. This enables the attempt, which Main Process now blocks & redirects.
    return `
    <div class="webview-container" style="width:100%; height:100%; display:flex; flex-direction:column;">
        <webview id="webview-${tabId}" class="tab-content" 
                 src="${url}"
                 allowpopups
                 webpreferences="nodeIntegration=false, contextIsolation=true"
                 style="width:100%; flex-grow:1; border:none;"></webview>
    </div>
    `;
}

function renderWebViewHTML(contentData) { }

function updateWebViewUI(tabId) {
    const webview = document.getElementById(`webview-${tabId}`);
    const backButton = document.getElementById('global-nav-back');
    const forwardButton = document.getElementById('global-nav-forward');
    const addressBar = document.getElementById('global-address-bar-input');
    
    if (!webview || !backButton || !forwardButton || !addressBar) return;

    backButton.disabled = !webview.canGoBack();
    forwardButton.disabled = !webview.canGoForward();
    addressBar.value = webview.getURL();
}

function attachWebViewListeners(contentData, tabId) {
    const webviewId = `webview-${tabId}`;
    const webview = document.getElementById(webviewId);
    if (!webview) return () => {};

    const updateGlobalUI = () => {
        if (webview.offsetParent !== null) {
            updateWebViewUI(tabId);
        }
    };

    const didFinishLoad = () => { 
        updateGlobalUI(); 
        
        // --- LOG HISTORY ---
        const url = webview.getURL();
        const title = webview.getTitle();
        if (url && title && url !== 'about:blank' && window.logHistoryItem) {
            window.logHistoryItem(url, title);
        }
        // -------------------

        window.ipcRenderer.send('did-finish-content-swap'); 
    };
    
    const didNavigate = (e) => { updateGlobalUI(); };
    const didNavigateInPage = (e) => { 
        const addressBar = document.getElementById('global-address-bar-input');
        if(addressBar && webview.offsetParent !== null) addressBar.value = e.url; 
    };
    const didFailLoad = (e) => { if(e.isMainFrame) window.ipcRenderer.send('did-finish-content-swap'); };
    
    webview.addEventListener('did-finish-load', didFinishLoad);
    webview.addEventListener('did-navigate', didNavigate);
    webview.addEventListener('did-navigate-in-page', didNavigateInPage);
    webview.addEventListener('did-fail-load', didFailLoad);

    // --- NEW WINDOW HANDLER (FALLBACK) ---
    // We keep this primarily to stop standard events, but the heavy lifting 
    // is now done by the Main Process via 'setWindowOpenHandler'.
    const newWindowListener = (e) => {
        e.preventDefault(); 
    };
    webview.addEventListener('new-window', newWindowListener);

    return () => {
        webview.removeEventListener('did-finish-load', didFinishLoad);
        webview.removeEventListener('did-navigate', didNavigate);
        webview.removeEventListener('did-navigate-in-page', didNavigateInPage);
        webview.removeEventListener('did-fail-load', didFailLoad);
        webview.removeEventListener('new-window', newWindowListener);
    };
}

module.exports = { getWebViewComponent, renderWebViewHTML, attachWebViewListeners, updateWebViewUI };