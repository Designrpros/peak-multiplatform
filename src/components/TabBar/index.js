// src/components/TabBar/index.js

function renderTabBar(tabs, selectedId) {
    const tabsHtml = tabs.map((tab, index) => {
        const isSelected = tab.id === selectedId;
        return `
            <div 
                class="tab-button ${isSelected ? 'selected-tab' : ''}" 
                onclick="window.selectTab(${tab.id})"
                draggable="true"
                data-tab-id="${tab.id}"
                data-index="${index}"
            >
                <i data-lucide="${tab.icon}"></i>
                <span>${tab.title}</span>
                
                <a class="close-button-wrapper" onclick="event.stopPropagation(); window.closeTab(${tab.id});">
                    <i data-lucide="x" class="close-button"></i>
                </a>
            </div>
        `;
    }).join('');

    return `
        <div class="tab-scroller" id="tab-scroller-inner">
            ${tabsHtml}
        </div>
    `;
}

function attachTabListeners() {
    const container = document.getElementById('tab-scroller-inner');
    if (!container) return;

    let draggedItem = null;

    const tabs = container.querySelectorAll('.tab-button');
    
    tabs.forEach(tab => {
        // Drag Start
        tab.addEventListener('dragstart', (e) => {
            draggedItem = tab;
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', tab.dataset.index);
            requestAnimationFrame(() => tab.style.opacity = '0.4');
        });

        // Drag End
        tab.addEventListener('dragend', () => {
            draggedItem = null;
            tabs.forEach(t => {
                t.style.opacity = '1';
                t.classList.remove('drag-over-left', 'drag-over-right');
            });
        });

        // Drag Over
        tab.addEventListener('dragover', (e) => {
            e.preventDefault(); // Necessary for drop
            if (tab === draggedItem) return;

            const rect = tab.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            
            tab.classList.remove('drag-over-left', 'drag-over-right');
            
            if (e.clientX < midpoint) {
                tab.classList.add('drag-over-left');
            } else {
                tab.classList.add('drag-over-right');
            }
        });

        // Drag Leave
        tab.addEventListener('dragleave', () => {
            tab.classList.remove('drag-over-left', 'drag-over-right');
        });

        // Drop
        tab.addEventListener('drop', (e) => {
            e.preventDefault();
            if (tab === draggedItem) return;
            
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(tab.dataset.index);
            
            // Calculate logic based on drop position (left vs right)
            const rect = tab.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            const dropPosition = e.clientX < midpoint ? 'before' : 'after';
            
            let finalIndex = toIndex;
            if (dropPosition === 'after' && fromIndex > toIndex) finalIndex = toIndex + 1;
            if (dropPosition === 'before' && fromIndex < toIndex) finalIndex = toIndex - 1;
            
            // Simple swap logic or complex move? Simple index swap for now is easiest UX
            // But insert is better. Let's do a simple reorder call.
            
            window.reorderTabs(fromIndex, toIndex); // We will bridge this
        });
    });
}

module.exports = {
    renderTabBar,
    attachTabListeners
};