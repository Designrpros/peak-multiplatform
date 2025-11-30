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
            const version = localStorage.getItem('peak-agents-version');

            // Migration: Clear old agents if version doesn't match
            // Version 4: Add Reviewer Agents
            const CURRENT_VERSION = '4';
            if (stored && version !== CURRENT_VERSION) {
                console.log('[AgentRegistry] Migrating agents to version', CURRENT_VERSION);
                localStorage.removeItem('peak-agents');
                localStorage.setItem('peak-agents-version', CURRENT_VERSION);
                return this.loadDefaultAgents();
            }

            if (stored) {
                localStorage.setItem('peak-agents-version', CURRENT_VERSION);
                return JSON.parse(stored);
            }

            // First time setup
            localStorage.setItem('peak-agents-version', CURRENT_VERSION);
        } catch (e) {
            console.error('Failed to load agents:', e);
        }
        return this.loadDefaultAgents();
    }

    loadDefaultAgents() {
        return [
            {
                id: 'general',
                name: 'General Assistant',
                description: 'A helpful AI assistant for general tasks.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: null,
                isDefault: true,
                isSystem: true
            },
            {
                id: 'code-expert',
                name: 'Code Expert',
                description: 'Focused on writing high-quality, efficient code.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: null,
                isDefault: false,
                isSystem: true
            },
            {
                id: 'code-reviewer',
                name: 'Code Reviewer',
                description: 'Specialized in reviewing code for bugs, security, and style.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are a Code Reviewer. Focus on identifying bugs, security vulnerabilities, and code style issues. Be constructive and concise.',
                isDefault: false,
                isSystem: true
            },
            {
                id: 'decision-reviewer',
                name: 'Decision Reviewer',
                description: 'Reviews architectural and design decisions.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are a Decision Reviewer. Evaluate architectural choices, trade-offs, and long-term implications. Ensure alignment with project goals.',
                isDefault: false,
                isSystem: true
            },
            {
                id: 'debugger',
                name: 'Debugger',
                description: 'Specialized in finding and fixing bugs.',
                modelId: 'openrouter/auto',
                systemPrompt: null,
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
