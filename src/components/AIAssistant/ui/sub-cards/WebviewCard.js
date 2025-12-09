const { shell } = require('electron');

function renderWebviewCard(url) {
    const safeUrl = url || 'about:blank';

    // Unique ID for this webview to potentially target it later
    const webviewId = `webview-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    return `
        <div class="tool-card-compact webview-card" style="border-left: 3px solid var(--peak-accent); padding-left: 8px; overflow: hidden; margin-top: 8px; background: var(--peak-card-bg);">
            <div class="card-header" style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--peak-card-header-bg); border-bottom: 1px solid var(--border-color);">
                <div style="display: flex; align-items: center; gap: 8px; overflow: hidden;">
                    <i data-lucide="globe" style="width: 14px; height: 14px; color: var(--peak-accent);"></i>
                    <span style="font-size: 12px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--peak-primary);">
                        ${safeUrl}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                    <button class="icon-btn refresh-webview-btn" data-id="${webviewId}" title="Refresh" style="background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: var(--peak-secondary);">
                        <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i>
                    </button>
                    <button class="icon-btn open-external-btn" data-url="${safeUrl}" title="Open in Browser" style="background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px; color: var(--peak-secondary);">
                        <i data-lucide="external-link" style="width: 14px; height: 14px;"></i>
                    </button>
                </div>
            </div>
            <div class="webview-container" style="height: 400px; width: 100%; position: relative; background: white;">
                <webview 
                    id="${webviewId}" 
                    src="${safeUrl}" 
                    style="display:inline-flex; width:100%; height:100%;"
                    allowpopups
                    webpreferences="contextIsolation=true, nodeIntegration=false"
                ></webview>
                
                <!-- Loading Overlay -->
                <div class="webview-loading" id="loading-${webviewId}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(255,255,255,0.8); display: flex; align-items: center; justify-content: center; z-index: 10;">
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <i data-lucide="loader-2" class="spin" style="width: 24px; height: 24px; color: var(--peak-accent); animation: spin 1s linear infinite;"></i>
                        <span style="font-size: 12px; color: var(--peak-secondary);">Loading Preview...</span>
                    </div>
                </div>
            </div>
            
            <!-- Inline Script to handle loading state and buttons -->
            <script>
                (function() {
                    const webview = document.getElementById('${webviewId}');
                    const loading = document.getElementById('loading-${webviewId}');
                    const refreshBtn = document.querySelector('.refresh-webview-btn[data-id="${webviewId}"]');
                    const externalBtn = document.querySelector('.open-external-btn[data-url="${safeUrl}"]'); // Selector might match multiple if same URL, but okay for now
                    
                    if (webview) {
                        webview.addEventListener('did-start-loading', () => {
                            if (loading) loading.style.display = 'flex';
                        });
                        
                        webview.addEventListener('did-stop-loading', () => {
                            if (loading) loading.style.display = 'none';
                        });
                        
                        webview.addEventListener('dom-ready', () => {
                            if (loading) loading.style.display = 'none';
                            // Optional: Insert CSS to hide scrollbars or adjust styling
                        });
                        
                        webview.addEventListener('did-fail-load', (e) => {
                             if (loading) {
                                loading.innerHTML = '<div style="color: #dc2626; font-size: 12px; text-align: center; padding: 20px;">Failed to load<br>' + e.errorDescription + '</div>';
                             }
                        });
                    }
                    
                    if (refreshBtn && webview) {
                        refreshBtn.onclick = () => webview.reload();
                    }
                    
                    if (externalBtn) {
                        externalBtn.onclick = () => {
                            require('electron').shell.openExternal('${safeUrl}');
                        };
                    }
                })();
            </script>
        </div>
    `;
}

module.exports = { renderWebviewCard };
