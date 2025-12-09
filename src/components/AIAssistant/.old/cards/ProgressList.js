/**
 * ProgressList.js
 * 
 * A clean, isolated progress list component with full styling control.
 * No external CSS dependencies or style inheritance issues.
 */

class ProgressList {
    constructor(container) {
        this.container = container;
        this.items = [];
        this.itemCounter = 0;

        // Create the list structure
        this.element = document.createElement('div');
        this.element.style.cssText = 'display: flex; flex-direction: column; gap: 0; background: transparent; margin: 0; padding: 0;';

        container.appendChild(this.element);
    }

    /**
     * Add a new item to the progress list
     * @param {string} type - 'tool', 'text', 'phase'
     * @param {Node[]} contentNodes - Array of DOM nodes to render
     * @param {string} title - Display title for the item
     */
    addItem(type, contentNodes, title) {
        this.itemCounter++;
        const itemId = `progress-item-${this.itemCounter}`;

        console.log('[ProgressList] addItem called:', { type, title, nodeCount: contentNodes.length });

        // Create item container
        const item = document.createElement('div');
        item.id = itemId;
        item.dataset.type = type;
        item.style.cssText = 'display: flex; flex-direction: column; margin: 0; padding: 8px 0; background: transparent; border: none;';

        // Create header (number + title, clickable to toggle)
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer; background: transparent; border: none; padding: 0; margin: 0;';
        header.innerHTML = `
            <span style="font-size: 10px; font-weight: bold; color: var(--text-muted); min-width: 16px; text-align: right;">${this.itemCounter}</span>
            <span style="font-weight: 600; font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--peak-primary);">${title}</span>
        `;

        // Create body (content container)
        const body = document.createElement('div');
        body.style.cssText = 'display: block; padding: 4px 0 0 24px; margin: 0; background: transparent; border: none;';

        // Add content nodes to body
        contentNodes.forEach(node => {
            console.log('[ProgressList] Appending node:', node, 'textContent:', node.textContent?.substring(0, 50));
            body.appendChild(node.cloneNode(true));
        });

        console.log('[ProgressList] Body innerHTML length:', body.innerHTML.length);

        // Toggle functionality
        header.onclick = () => {
            const isCollapsed = item.dataset.collapsed === 'true';
            if (isCollapsed) {
                body.style.display = 'block';
                item.dataset.collapsed = 'false';
            } else {
                body.style.display = 'none';
                item.dataset.collapsed = 'true';
            }
        };

        // Assemble item
        item.appendChild(header);
        item.appendChild(body);

        // Add to list
        this.element.appendChild(item);
        this.items.push({ id: itemId, element: item, header, body });

        console.log('[ProgressList] Item added to DOM. Total items:', this.items.length);

        return itemId;
    }

    /**
     * Collapse a specific item
     */
    collapse(itemId) {
        const item = this.items.find(i => i.id === itemId);
        if (item) {
            item.body.style.display = 'none';
            item.element.dataset.collapsed = 'true';
        }
    }

    /**
     * Collapse all items
     */
    collapseAll() {
        this.items.forEach(item => {
            item.body.style.display = 'none';
            item.element.dataset.collapsed = 'true';
        });
    }

    /**
     * Expand all items
     */
    expandAll() {
        this.items.forEach(item => {
            item.body.style.display = 'block';
            item.element.dataset.collapsed = 'false';
        });
    }

    /**
     * Clear the list
     */
    clear() {
        this.element.innerHTML = '';
        this.items = [];
        this.itemCounter = 0;
    }

    /**
     * Add a visual divider
     */
    addDivider(label = 'Retry') {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; align-items: center; justify-content: center; gap: 8px; margin: 12px 0; opacity: 0.6;';
        div.innerHTML = `
            <div style="height: 1px; background: var(--border-color); flex: 1;"></div>
            <span style="font-size: 10px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">${label}</span>
            <div style="height: 1px; background: var(--border-color); flex: 1;"></div>
        `;
        this.element.appendChild(div);
        // We don't push to this.items to avoid it being collapsible or counted, 
        // but we track it element-wise if needed. For now simplest is just append.
    }
}

module.exports = ProgressList;
