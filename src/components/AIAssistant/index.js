// src/components/AIAssistant/index.js
const { getAIAssistHTML } = require('./AIAssistantView');
const { attachAIAssistListeners } = require('./AIAssistantLogic');

module.exports = {
    getAIAssistHTML,
    attachAIAssistListeners
};