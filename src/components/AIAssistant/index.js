const { getAIAssistHTML, getSettingsHTML } = require('./AIAssistantView');
const LayoutController = require('./ui/LayoutController');

let layoutController = null;

function attachAIAssistListeners(currentFileContent, currentFilePath) {
    // Initialize the LayoutController which manages ChatView and TasksView
    if (layoutController) {
        layoutController.destroy();
    }
    layoutController = new LayoutController();

    // If we need to pass initial context, we can do it here or let the controller fetch it
    // The controller fetches it on init/demand.

    // Return cleanup function for Inspector
    return () => {
        if (layoutController) {
            layoutController.destroy();
            layoutController = null;
        }
    };
}

module.exports = {
    getAIAssistHTML,
    getSettingsHTML,
    attachAIAssistListeners
};