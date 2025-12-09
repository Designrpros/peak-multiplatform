/**
 * CanvasController.js
 * Manages the "Canvas" area - a persistent state view separate from the chat stream.
 * This handles the agent's current plan, scratchpad/draft code, and high-level task state.
 */

class CanvasController {
    constructor(containerElement) {
        this.container = containerElement;
        this.planElement = null;
        this.draftElement = null;
        this.isVisible = false;

        this.initialize();
    }

    initialize() {
        // Create the canvas area structure
        this.container.innerHTML = `
            <div id="ai-canvas-area" style="display: none;">
                <div class="canvas-header">
                    <h3>Agent Workspace</h3>
                    <button class="canvas-close-btn" id="canvas-close-btn">
                        <i data-lucide="x" style="width:14px; height:14px;"></i>
                    </button>
                </div>
                <div class="canvas-content">
                    <div class="canvas-section" id="canvas-plan-section">
                        <div class="canvas-section-header">
                            <i data-lucide="list-checks" style="width:14px; height:14px;"></i>
                            <span>Plan</span>
                        </div>
                        <div class="canvas-plan-content"></div>
                    </div>
                    <div class="canvas-section" id="canvas-draft-section" style="display: none;">
                        <div class="canvas-section-header">
                            <i data-lucide="code" style="width:14px; height:14px;"></i>
                            <span>Draft</span>
                        </div>
                        <pre class="canvas-draft-content"></pre>
                    </div>
                </div>
            </div>
        `;

        // Get references
        this.canvasArea = this.container.querySelector('#ai-canvas-area');
        this.planElement = this.container.querySelector('.canvas-plan-content');
        this.draftElement = this.container.querySelector('.canvas-draft-content');
        this.draftSection = this.container.querySelector('#canvas-draft-section');

        // Attach close button
        const closeBtn = this.container.querySelector('#canvas-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        this.setupStyles();

        if (window.lucide) window.lucide.createIcons();
    }

    setupStyles() {
        // Inject Canvas-specific styles if not already present
        if (document.getElementById('canvas-styles')) return;

        const style = document.createElement('style');
        style.id = 'canvas-styles';
        style.textContent = `
            #ai-canvas-area {
                position: absolute;
                top: 0;
                right: 0;
                width: 35%;
                height: 100%;
                background: var(--window-background-color);
                border-left: 1px solid var(--border-color);
                display: flex;
                flex-direction: column;
                z-index: 10;
                box-shadow: -2px 0 8px rgba(0,0,0,0.1);
            }
            
            .canvas-header {
                padding: 12px 16px;
                border-bottom: 1px solid var(--border-color);
                display: flex;
                align-items: center;
                justify-content: space-between;
                background: var(--control-background-color);
            }
            
            .canvas-header h3 {
                margin: 0;
                font-size: 13px;
                font-weight: 600;
                color: var(--peak-primary);
            }
            
            .canvas-close-btn {
                background: transparent;
                border: none;
                color: var(--peak-secondary);
                cursor: pointer;
                padding: 4px;
                border-radius: 4px;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s;
            }
            
            .canvas-close-btn:hover {
                background: var(--window-background-color);
                color: var(--peak-primary);
            }
            
            .canvas-content {
                flex: 1;
                overflow-y: auto;
                padding: 16px;
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            
            .canvas-section {
                border: 1px solid var(--border-color);
                border-radius: 8px;
                overflow: hidden;
                background: var(--window-background-color);
            }
            
            .canvas-section-header {
                padding: 8px 12px;
                background: var(--control-background-color);
                border-bottom: 1px solid var(--border-color);
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 11px;
                font-weight: 600;
                color: var(--peak-primary);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }
            
            .canvas-plan-content {
                padding: 12px;
                font-size: 12px;
                line-height: 1.6;
                color: var(--peak-primary);
            }
            
            .canvas-plan-content ul {
                list-style: none;
                padding: 0;
                margin: 0;
            }
            
            .canvas-plan-content li {
                padding: 4px 0;
                position: relative;
                padding-left: 20px;
            }
            
            .canvas-plan-content li::before {
                content: "•";
                position: absolute;
                left: 0;
                color: var(--peak-accent);
            }
            
            .canvas-plan-content li.completed::before {
                content: "✓";
                color: var(--peak-success);
            }
            
            .canvas-draft-content {
                padding: 12px;
                font-family: 'GeistMono', monospace;
                font-size: 11px;
                line-height: 1.5;
                color: var(--peak-primary);
                margin: 0;
                max-height: 400px;
                overflow-y: auto;
                background: var(--text-background-color);
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Update the plan section with markdown content
     * @param {string} markdown - Markdown formatted plan (will be rendered as HTML)
     */
    updatePlan(markdown) {
        if (!this.planElement) return;

        // Simple markdown to HTML conversion (basic list support)
        const html = markdown
            .replace(/^\s*[-*]\s+\[x\]\s+(.+)$/gm, '<li class="completed">$1</li>')
            .replace(/^\s*[-*]\s+\[ \]\s+(.+)$/gm, '<li>$1</li>')
            .replace(/^\s*[-*]\s+(.+)$/gm, '<li>$1</li>')
            .replace(/^#+\s+(.+)$/gm, '<strong>$1</strong><br>');

        this.planElement.innerHTML = `<ul>${html}</ul>`;
        this.show();

        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Update the draft/scratchpad section with code
     * @param {string} code - Code content to display
     */
    updateDraft(code) {
        if (!this.draftElement) return;

        // Escape HTML
        const safeCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        this.draftElement.textContent = safeCode;
        this.draftSection.style.display = 'block';
        this.show();
    }

    /**
     * Clear all canvas content
     */
    clear() {
        if (this.planElement) this.planElement.innerHTML = '';
        if (this.draftElement) this.draftElement.textContent = '';
        if (this.draftSection) this.draftSection.style.display = 'none';
    }

    /**
     * Show the canvas area
     */
    show() {
        if (this.canvasArea) {
            this.canvasArea.style.display = 'flex';
            this.isVisible = true;
        }
    }

    /**
     * Hide the canvas area
     */
    hide() {
        if (this.canvasArea) {
            this.canvasArea.style.display = 'none';
            this.isVisible = false;
        }
    }

    /**
     * Toggle canvas visibility
     */
    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }
}

module.exports = CanvasController;
