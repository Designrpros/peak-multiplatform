/**
 * ToolResultCard.js
 * ULTRA minimal - tiniest possible format
 */

function renderToolResultCard(toolName, result) {
    const summary = generateSummary(toolName, result);
    const icon = getIconForTool(toolName);

    // ULTRA MINIMAL - tiny font, no spacing, super compact
    return `<div style="width: 100%; box-sizing: border-box; font-size:9px; color:#6b7280; opacity:0.7; margin:2px 0; line-height:1;"><i data-lucide="${icon}" style="width:8px; height:8px; color:#10b981; vertical-align:middle; margin-right:4px;"></i><span style="opacity:0.5;">${toolName}</span> <span style="opacity:0.3;">·</span> <span>${summary}</span></div>`;
}

function getIconForTool(toolName) {
    const icons = {
        'list_directory': 'folder',
        'view_file': 'file-text',
        'search_project': 'search',
        'get_problems': 'alert-circle',
        'edit_file': 'edit',
        'create_file': 'file-plus',
        'delete_file': 'trash-2',
        'run_command': 'terminal'
    };
    return icons[toolName] || 'check-circle';
}

function generateSummary(toolName, result) {
    if (!result) return 'No results';

    switch (toolName) {
        case 'list_directory':
            if (Array.isArray(result)) {
                const fileCount = result.filter(f => f.type === 'file').length;
                const dirCount = result.filter(f => f.type === 'directory').length;
                return `${fileCount} files, ${dirCount} folders`;
            }
            break;
        case 'search_project':
            if (Array.isArray(result)) {
                return `${result.length} matches`;
            }
            break;
        case 'view_file':
            if (typeof result === 'string') {
                const lines = result.split('\n').length;
                return `${lines} lines`;
            }
            break;
        case 'edit_file':
            if (result && result.linesChanged) {
                return `${result.linesChanged} lines edited`;
            } else if (typeof result === 'string' && result.includes('success')) {
                return 'updated';
            }
            return 'modified';
        case 'get_problems':
            if (Array.isArray(result)) {
                const errors = result.filter(p => p.severity === 'error').length;
                const warnings = result.length - errors;
                if (errors > 0 && warnings > 0) {
                    return `${errors} errors, ${warnings} warnings`;
                } else if (errors > 0) {
                    return `${errors} errors`;
                } else if (warnings > 0) {
                    return `${warnings} warnings`;
                } else {
                    return 'no problems';
                }
            }
            break;
    }

    // Default
    if (typeof result === 'string') {
        if (result.length < 30) {
            return result;  // Show short results inline
        }
        return `${result.length} chars`;
    } else if (Array.isArray(result)) {
        return `${result.length} items`;
    }

    return 'done';
}

module.exports = { renderToolResultCard };
