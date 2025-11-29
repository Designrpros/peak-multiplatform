/**
 * AgentRegistry.js
 * Manages the list of available AI Agents.
 */

const { AvailableModels } = require('../../../utils/enums');
const SYSTEM_PROMPT_TEMPLATE = require('./SystemPrompt');

class AgentRegistry {
    constructor() {
        this.agents = this.loadAgents();
    }

    loadAgents() {
        try {
            const stored = localStorage.getItem('peak-agents');
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load agents:', e);
        }
        return this.getDefaultAgents();
    }

    getDefaultAgents() {
        return [
            {
                id: 'default-assistant',
                name: 'General Assistant',
                description: 'The standard AI assistant for general tasks.',
                modelId: 'openrouter/auto',
                systemPrompt: SYSTEM_PROMPT_TEMPLATE,
                isDefault: true,
                isSystem: true // Cannot be deleted
            },
            {
                id: 'code-expert',
                name: 'Code Expert',
                description: 'Focused on writing high-quality, efficient code.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: "You are an expert software engineer. Your goal is to write clean, efficient, and maintainable code. Always prioritize best practices, type safety (where applicable), and performance. When modifying code, ensure you understand the surrounding context. Provide concise explanations for your changes.",
                isDefault: false,
                isSystem: true
            },
            {
                id: 'debugger',
                name: 'Debugger',
                description: 'Specialized in finding and fixing bugs.',
                modelId: 'openrouter/auto',
                systemPrompt: "You are a debugging expert. Your primary goal is to identify the root cause of issues and propose fixes. Analyze the code carefully, look for logical errors, race conditions, and edge cases. When proposing a fix, explain why the bug occurred and how your fix resolves it.",
                isDefault: false,
                isSystem: true
            }
        ];
    }

    getAgents() {
        return this.agents;
    }

    getAgent(id) {
        return this.agents.find(a => a.id === id) || this.agents[0];
    }

    saveAgent(agent) {
        if (!agent.id) {
            agent.id = 'agent-' + Date.now();
        }

        const index = this.agents.findIndex(a => a.id === agent.id);
        if (index >= 0) {
            this.agents[index] = agent;
        } else {
            this.agents.push(agent);
        }

        this.persist();
        return agent;
    }

    deleteAgent(id) {
        const agent = this.getAgent(id);
        if (agent && agent.isSystem) {
            throw new Error('Cannot delete system agents.');
        }

        this.agents = this.agents.filter(a => a.id !== id);
        this.persist();
    }

    persist() {
        localStorage.setItem('peak-agents', JSON.stringify(this.agents));
        window.dispatchEvent(new CustomEvent('peak-agents-updated'));
    }

    resetDefaults() {
        this.agents = this.getDefaultAgents();
        this.persist();
    }
}

// Singleton
const instance = new AgentRegistry();
module.exports = instance;
