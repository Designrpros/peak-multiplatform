/**
 * CardRenderer.js
 * 
 * Generic card rendering engine.
 * Replaces ALL 14 individual card classes with config-driven rendering.
 * 
 * This is the killer feature - one renderer, many card types.
 */

const { ipcRenderer } = require('electron');

class CardRenderer {
    constructor() {
        this.cardElements = new Map(); // cardId -> DOM element
    }

    /**
     * Render a card from configuration
     * @param {object} config - Card configuration from CardFactory
     * @returns {HTMLElement} Rendered card element
     */
    render(config) {
        const card = document.createElement('div');
        card.className = `peak-card peak-card-${config.type}`;
        card.dataset.cardId = config.id;
        card.dataset.type = config.type;
        card.style.cssText = `
            background: var(--card-background);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 12px;
            overflow: hidden;
            width: 100%;
            box-sizing: border-box;
        `;

        // Apply special styling for phase cards
        if (config.style === 'accent') {
            card.style.borderLeft = '4px solid var(--peak-primary)';
        }

        // Header
        const header = this._renderHeader(config);
        card.appendChild(header);

        // Content (if collapsible and collapsed, hide it)
        if (config.content !== null && config.content !== undefined) {
            const content = this._renderContent(config);
            if (config.collapsible && config.collapsed) {
                content.style.display = 'none';
            }
            card.appendChild(content);
        }

        // Actions
        if (config.actions && config.actions.length > 0) {
            const actions = this._renderActions(config);
            card.appendChild(actions);
        }

        // Store reference
        this.cardElements.set(config.id, card);

        return card;
    }

    /**
     * Update an existing card
     */
    update(cardId, updates) {
        const cardEl = this.cardElements.get(cardId);
        if (!cardEl) {
            console.warn(`[CardRenderer] Card not found: ${cardId}`);
            return;
        }

        // Update based on what changed
        if (updates.status) {
            cardEl.dataset.status = updates.status;
            // Update status indicator
            const statusIndicator = cardEl.querySelector('.card-status');
            if (statusIndicator) {
                statusIndicator.textContent = this._getStatusIcon(updates.status);
            }
        }

        if (updates.content) {
            const contentEl = cardEl.querySelector('.card-content-inner');
            if (contentEl) {
                contentEl.textContent = updates.content;
            }
        }
    }

    /**
     * Toggle card collapse
     */
    toggleCollapse(cardId) {
        const cardEl = this.cardElements.get(cardId);
        if (!cardEl) return;

        const content = cardEl.querySelector('.card-content');
        const chevron = cardEl.querySelector('.card-chevron');

        if (content) {
            const isCollapsed = content.style.display === 'none';
            content.style.display = isCollapsed ? 'block' : 'none';
            if (chevron) {
                chevron.style.transform = isCollapsed ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        this.cardElements.clear();
    }

    // ==================== Private Renderers ====================

    _renderHeader(config) {
        const header = document.createElement('div');
        header.className = 'card-header';
        header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px;
            cursor: ${config.collapsible ? 'pointer' : 'default'};
        `;

        // Left side: icon + title
        const left = document.createElement('div');
        left.style.cssText = 'display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;';

        // Status indicator (for tool cards)
        if (config.type === 'tool') {
            const status = document.createElement('span');
            status.className = 'card-status';
            status.style.cssText = 'font-size: 12px;';
            status.textContent = this._getStatusIcon(config.status);
            left.appendChild(status);
        }

        // Icon
        const icon = document.createElement('i');
        icon.dataset.lucide = config.icon || 'box';
        icon.style.cssText = 'width: 14px; height: 14px; opacity: 0.7;';
        left.appendChild(icon);

        // Title
        const title = document.createElement('span');
        title.className = 'card-title';
        title.style.cssText = 'font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
        title.textContent = config.title;
        left.appendChild(title);

        header.appendChild(left);

        // Right side: chevron (if collapsible)
        if (config.collapsible) {
            const chevron = document.createElement('i');
            chevron.className = 'card-chevron';
            chevron.dataset.lucide = 'chevron-down';
            chevron.style.cssText = `
                width: 12px;
                height: 12px;
                opacity: 0.5;
                transition: transform 0.2s;
                transform: rotate(${config.collapsed ? '0deg' : '180deg'});
            `;
            header.appendChild(chevron);
        }

        // Add click handler for collapse
        if (config.collapsible) {
            header.addEventListener('click', () => {
                this.toggleCollapse(config.id);
            });
        }

        // Initialize lucide icons
        if (window.lucide) window.lucide.createIcons();

        return header;
    }

    _renderContent(config) {
        const content = document.createElement('div');
        content.className = 'card-content';
        content.style.cssText = `
            padding: 12px;
            border-top: 1px solid var(--border-color);
            font-size: 12px;
            max-height: 400px;
            overflow-y: auto;
        `;

        const inner = document.createElement('div');
        inner.className = 'card-content-inner';
        inner.style.cssText = 'white-space: pre-wrap; word-break: break-word; font-family: monospace;';
        inner.textContent = config.content;

        content.appendChild(inner);
        return content;
    }

    _renderActions(config) {
        const actions = document.createElement('div');
        actions.className = 'card-actions';
        actions.style.cssText = `
            display: flex;
            gap: 8px;
            padding: 8px 12px;
            border-top: 1px solid var(--border-color);
            background: var(--background-subtle);
        `;

        for (const action of config.actions) {
            const btn = document.createElement('button');
            btn.className = 'card-action-btn';
            btn.style.cssText = `
                padding: 4px 12px;
                font-size: 11px;
                border-radius: 4px;
                border: 1px solid var(--border-color);
                background: var(--background);
                color: var(--text-color);
                cursor: pointer;
                transition: all 0.2s;
            `;
            btn.textContent = action.label;

            // Add hover effect
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'var(--accent-color-subtle)';
            });
            btn.addEventListener('mouseleave', () => {
                btn.style.background = 'var(--background)';
            });

            // Add click handler
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._handleAction(config, action);
            });

            actions.appendChild(btn);
        }

        return actions;
    }

    _getStatusIcon(status) {
        switch (status) {
            case 'pending': return '⏳';
            case 'executing': return '⚙️';
            case 'complete': return '✅';
            case 'error': return '❌';
            default: return '○';
        }
    }

    _handleAction(config, action) {
        console.log('[CardRenderer] Action clicked:', action.type, config);

        switch (action.type) {
            case 'copy':
                navigator.clipboard.writeText(config.content);
                break;

            case 'open_file':
                if (action.data && action.data.path) {
                    window.dispatchEvent(new CustomEvent('peak-open-file', {
                        detail: { path: action.data.path }
                    }));
                }
                break;

            case 'rerun':
                if (action.data && action.data.command) {
                    // Trigger tool execution
                    window.dispatchEvent(new CustomEvent('peak-rerun-command', {
                        detail: action.data
                    }));
                }
                break;

            default:
                console.warn('[CardRenderer] Unknown action type:', action.type);
        }
    }
}

module.exports = CardRenderer;
