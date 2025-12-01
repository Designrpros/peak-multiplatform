/**
 * SummariesCard.js
 * Renders a dedicated summaries card for AI responses
 */

const SummaryExtractor = require('../../utils/SummaryExtractor');

function renderSummariesCard(content) {
    const summary = SummaryExtractor.extract(content);

    // Generate key points list
    const keyPointsHtml = summary.keyPoints.length > 0
        ? summary.keyPoints.map(point => `<li>${point}</li>`).join('')
        : '<li class="no-points">No key points extracted</li>';

    // Generate actions list  
    const actionsHtml = summary.actions.length > 0
        ? summary.actions.map(action => {
            if (action.type === 'file_modifications') {
                return `<span class="action-badge">${action.icon} ${action.count} file(s) modified</span>`;
            }
            return `<span class="action-badge">${action.icon} ${action.type}</span>`;
        }).join('')
        : '';

    // Generate stats
    const statsHtml = Object.keys(summary.stats).length > 0
        ? Object.entries(summary.stats)
            .map(([key, value]) => `<span class="stat-badge">${value} ${key}</span>`)
            .join('')
        : '';

    return `
        <div class="summaries-card-minimal">
            <ul class="key-points-list minimal">
                ${keyPointsHtml}
            </ul>
            ${actionsHtml || statsHtml ? `
                <div class="summaries-meta minimal">
                    ${actionsHtml}
                    ${statsHtml}
                </div>
            ` : ''}
        </div>
    `;
}

module.exports = { renderSummariesCard };
