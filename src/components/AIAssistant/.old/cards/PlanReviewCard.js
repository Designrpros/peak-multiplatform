/**
 * PlanReviewCard.js
 * Interactive card for reviewing and approving AI-generated implementation plans
 */

class PlanReviewCard {
    constructor({ files, onApprove, onRequestChanges }) {
        this.files = files; // Array of { path, content }
        this.onApprove = onApprove;
        this.onRequestChanges = onRequestChanges;
        this.element = this.render();
    }

    render() {
        const card = document.createElement('div');
        card.className = 'plan-review-card';
        card.style.cssText = `
            background: linear-gradient(135deg, rgba(79, 70, 229, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%);
            border: 1px solid rgba(139, 92, 246, 0.3);
            border-radius: 12px;
            padding: 20px;
            margin: 16px 0;
            backdrop-filter: blur(10px);
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 16px;
            font-weight: 600;
            font-size: 16px;
            color: var(--text-primary, #e2e8f0);
        `;
        header.innerHTML = `
            <i data-lucide="clipboard-check" style="width: 20px; height: 20px; stroke: #a78bfa;"></i>
            <span>Plan Review Required</span>
        `;

        const filesContainer = document.createElement('div');
        filesContainer.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 12px;
            margin-bottom: 20px;
        `;

        // Render each file as expandable section
        this.files.forEach(file => {
            const fileSection = this.renderFileSection(file);
            filesContainer.appendChild(fileSection);
        });

        const actions = document.createElement('div');
        actions.style.cssText = `
            display: flex;
            gap: 12px;
            align-items: center;
        `;

        const approveBtn = document.createElement('button');
        approveBtn.className = 'plan-approve-btn';
        approveBtn.style.cssText = `
            flex: 1;
            padding: 12px 20px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: transform 0.2s, box-shadow 0.2s;
        `;
        approveBtn.innerHTML = `
            <i data-lucide="check-circle" style="width: 18px; height: 18px;"></i>
            Approve & Continue
        `;
        approveBtn.onmouseover = () => {
            approveBtn.style.transform = 'translateY(-2px)';
            approveBtn.style.boxShadow = '0 4px 12px rgba(16, 185, 129, 0.4)';
        };
        approveBtn.onmouseout = () => {
            approveBtn.style.transform = 'translateY(0)';
            approveBtn.style.boxShadow = 'none';
        };
        approveBtn.onclick = () => this.handleApprove();

        const changesBtn = document.createElement('button');
        changesBtn.className = 'plan-changes-btn';
        changesBtn.style.cssText = `
            padding: 12px 20px;
            background: rgba(148, 163, 184, 0.1);
            color: var(--text-secondary, #94a3b8);
            border: 1px solid rgba(148, 163, 184, 0.3);
            border-radius: 8px;
            font-weight: 600;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 0.2s;
        `;
        changesBtn.innerHTML = `
            <i data-lucide="message-circle" style="width: 18px; height: 18px;"></i>
            Request Changes
        `;
        changesBtn.onmouseover = () => {
            changesBtn.style.background = 'rgba(148, 163, 184, 0.2)';
            changesBtn.style.borderColor = 'rgba(148, 163, 184, 0.5)';
        };
        changesBtn.onmouseout = () => {
            changesBtn.style.background = 'rgba(148, 163, 184, 0.1)';
            changesBtn.style.borderColor = 'rgba(148, 163, 184, 0.3)';
        };
        changesBtn.onclick = () => this.handleRequestChanges();

        actions.appendChild(approveBtn);
        actions.appendChild(changesBtn);

        card.appendChild(header);
        card.appendChild(filesContainer);
        card.appendChild(actions);

        // Initialize Lucide icons
        if (window.lucide) {
            window.lucide.createIcons({ icons: card.querySelectorAll('[data-lucide]') });
        }

        return card;
    }

    renderFileSection(file) {
        const section = document.createElement('details');
        section.open = true;
        section.style.cssText = `
            background: rgba(0, 0, 0, 0.2);
            border-radius: 8px;
            padding: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        const summary = document.createElement('summary');
        summary.style.cssText = `
            cursor: pointer;
            font-weight: 600;
            color: var(--text-primary, #e2e8f0);
            display: flex;
            align-items: center;
            gap: 8px;
            user-select: none;
        `;

        const icon = file.path.includes('TODO') ? 'list-checks' : 'file-text';
        summary.innerHTML = `
            <i data-lucide="${icon}" style="width: 16px; height: 16px;"></i>
            ${file.path}
        `;

        const content = document.createElement('div');
        content.style.cssText = `
            margin-top: 12px;
            padding: 12px;
            background: rgba(0, 0, 0, 0.3);
            border-radius: 6px;
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', monospace;
            font-size: 13px;
            line-height: 1.6;
            color: var(--text-secondary, #cbd5e1);
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
        `;
        content.textContent = file.content;

        section.appendChild(summary);
        section.appendChild(content);

        // Initialize icons for this section
        if (window.lucide) {
            window.lucide.createIcons({ icons: section.querySelectorAll('[data-lucide]') });
        }

        return section;
    }

    handleApprove() {
        console.log('[PlanReviewCard] User approved plan');
        this.element.style.opacity = '0.5';
        this.element.style.pointerEvents = 'none';

        // Add approved indicator
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(16, 185, 129, 0.95);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-weight: 600;
            display: flex;
            align-items: center;
            gap: 8px;
        `;
        indicator.innerHTML = `
            <i data-lucide="check" style="width: 20px; height: 20px;"></i>
            Approved
        `;
        this.element.style.position = 'relative';
        this.element.appendChild(indicator);

        if (window.lucide) {
            window.lucide.createIcons({ icons: indicator.querySelectorAll('[data-lucide]') });
        }

        if (this.onApprove) {
            setTimeout(() => this.onApprove(), 500);
        }
    }

    handleRequestChanges() {
        console.log('[PlanReviewCard] User requested changes');

        // Focus input bar and add prompt
        const inputBar = document.querySelector('.chat-input, textarea[placeholder*="Type"]');
        if (inputBar) {
            inputBar.value = 'Please make the following changes to the plan:\n\n';
            inputBar.focus();
            // Set cursor at end
            inputBar.setSelectionRange(inputBar.value.length, inputBar.value.length);
        }

        // Optionally hide this card
        this.hide();
    }

    hide() {
        if (this.element && this.element.parentNode) {
            this.element.style.transition = 'opacity 0.3s, transform 0.3s';
            this.element.style.opacity = '0';
            this.element.style.transform = 'scale(0.95)';
            setTimeout(() => {
                this.element.remove();
            }, 300);
        }
    }

    getElement() {
        return this.element;
    }
}

module.exports = PlanReviewCard;
