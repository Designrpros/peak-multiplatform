/**
 * CardFactory.js
 * 
 * Creates card configurations from AI operations.
 * Replaces 14 individual card classes with config-driven approach.
 * 
 * Strategy: Instead of separate card classes, generate configurations
 * that a generic renderer can use.
 */

class CardFactory {
    /**
     * Create card configuration from operation
     * @param {object} operation - Operation from StreamProcessor
     * @returns {object} Card configuration for rendering
     */
    static createCard(operation) {
        switch (operation.type) {
            case 'tool_call':
                return this._createToolCard(operation);
            case 'thinking':
                return this._createThinkingCard(operation);
            case 'text':
                return this._createTextCard(operation);
            case 'phase_change':
                return this._createPhaseCard(operation);
            case 'header':
                return this._createHeaderCard(operation);
            default:
                return this._createGenericCard(operation);
        }
    }

    // ==================== Card Builders ====================

    static _createToolCard(operation) {
        const { toolName, args, content, id } = operation;

        //Get tool-specific formatting
        let title = `Running: ${toolName}`;
        let icon = 'tool';
        let collapsible = true;
        let contentDisplay = content;

        // Tool-specific customization
        switch (toolName) {
            case 'view_file':
            case 'read_file':
                icon = 'file';
                title = `Reading: ${args.path || 'file'}`;
                break;

            case 'list_directory':
                icon = 'folder';
                title = `Listing: ${args.path || '.'}`;
                break;

            case 'create_file':
                icon = 'file-plus';
                title = `Creating: ${args.path || 'file'}`;
                break;

            case 'update_file':
            case 'edit_file':
                icon = 'edit';
                title = `Editing: ${args.path || 'file'}`;
                break;

            case 'delete_file':
                icon = 'trash';
                title = `Deleting: ${args.path || 'file'}`;
                break;

            case 'run_command':
                icon = 'terminal';
                const cmd = args.command || content.split('\n')[0] || 'command';
                title = `Running: ${cmd.substring(0, 40)}${cmd.length > 40 ? '...' : ''}`;
                // Fix visibility: Ensure the command is visible in the card body if content is empty (pending state)
                if (!contentDisplay) {
                    contentDisplay = `Command: ${args.command}\nCWD: ${args.cwd || 'root'}`;
                }
                break;

            case 'search_project':
                icon = 'search';
                title = `Searching: ${args.query || 'project'}`;
                break;

            case 'get_problems':
                icon = 'alert-circle';
                title = 'Getting Problems';
                break;

            case 'capture_live_view':
                icon = 'camera';
                title = 'Capturing Live View';
                break;
        }

        return {
            id,
            type: 'tool',
            toolName,
            title,
            icon,
            collapsible,
            collapsed: false,
            content: contentDisplay,
            args,
            actions: this._getToolActions(toolName, args),
            status: 'pending', // pending, executing, complete, error
            timestamp: Date.now()
        };
    }

    static _createThinkingCard(operation) {
        return {
            id: operation.id,
            type: 'thinking',
            title: 'Thinking...',
            icon: 'brain',
            collapsible: true,
            collapsed: true, // Collapsed by default
            content: operation.content,
            actions: [],
            timestamp: Date.now()
        };
    }

    static _createTextCard(operation) {
        // Extract a title from content (first sentence or first 50 chars)
        const content = operation.content;
        const firstSentence = content.split(/[.!?\n]/)[0].trim();
        const title = firstSentence.length > 50
            ? firstSentence.substring(0, 50) + '...'
            : firstSentence || 'Response';

        return {
            id: operation.id,
            type: 'text',
            title,
            icon: 'message-square',
            collapsible: true,
            collapsed: false,
            content: operation.content,
            actions: [
                { type: 'copy', label: 'Copy' }
            ],
            timestamp: Date.now()
        };
    }

    static _createPhaseCard(operation) {
        return {
            id: operation.id,
            type: 'phase',
            title: operation.title,
            icon: 'flag',
            collapsible: false,
            content: null,
            actions: [],
            style: 'accent', // Visual emphasis
            timestamp: Date.now()
        };
    }

    static _createHeaderCard(operation) {
        return {
            id: operation.id,
            type: 'header',
            title: operation.title,
            icon: 'chevron-right',
            collapsible: false,
            content: null,
            actions: [],
            timestamp: Date.now()
        };
    }

    static _createGenericCard(operation) {
        return {
            id: operation.id,
            type: 'generic',
            title: operation.type || 'Operation',
            icon: 'box',
            collapsible: true,
            collapsed: false,
            content: JSON.stringify(operation, null, 2),
            actions: [],
            timestamp: Date.now()
        };
    }

    // ==================== Action Builders ====================

    static _getToolActions(toolName, args) {
        const actions = [];

        // Copy action for all tools
        actions.push({ type: 'copy', label: 'Copy Output' });

        // Tool-specific actions
        switch (toolName) {
            case 'view_file':
            case 'read_file':
                if (args.path) {
                    actions.push({
                        type: 'open_file',
                        label: 'Open File',
                        data: { path: args.path }
                    });
                }
                break;

            case 'create_file':
            case 'update_file':
                if (args.path) {
                    actions.push({
                        type: 'open_file',
                        label: 'View File',
                        data: { path: args.path }
                    });
                }
                break;

            case 'run_command':
                actions.push({
                    type: 'rerun',
                    label: 'Re-run Command',
                    data: { command: args.command, cwd: args.cwd }
                });
                break;
        }

        return actions;
    }

    /**
     * Create a batch of cards from multiple operations
     */
    static createCards(operations) {
        return operations.map(op => this.createCard(op));
    }

    /**
     * Update card with new data (e.g., tool result)
     */
    static updateCard(card, updates) {
        return { ...card, ...updates, updatedAt: Date.now() };
    }
}

module.exports = CardFactory;
