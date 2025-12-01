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
            // Version 8: Updated System Prompts for TODO management
            const CURRENT_VERSION = '8';
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
        const { AgentColors } = require('../../../utils/enums');

        return [
            {
                id: 'general',
                name: 'General Assistant',
                description: 'A helpful AI assistant for general tasks.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: null,
                color: AgentColors.GENERAL,
                isDefault: true,
                isSystem: true,
                isChainEnabled: false,
                parentId: null
            },
            {
                id: 'planner',
                name: 'Planner',
                description: 'Breaks down complex tasks into actionable steps.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are a Planner. Your goal is to analyze the user request and create a detailed, step-by-step implementation plan. You are responsible for maintaining the `TODO.md` file. Always start by reading `TODO.md` if it exists. Create it if it doesn\'t. Update it with the new plan. Use `list_directory` to understand the project structure before planning.',
                color: AgentColors.PLANNER,
                isDefault: false,
                isSystem: true,
                isChainEnabled: true,
                parentId: null
            },
            {
                id: 'code-expert',
                name: 'Code Expert',
                description: 'Focused on writing high-quality, efficient code.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are a Code Expert. Implement the code based on the provided plan or request. Focus on clean, efficient, and maintainable code. Ensure the code compiles and runs correctly. ALWAYS verify your changes by running `npm run build` or equivalent command if applicable. Use `view_file` to understand existing code before modifying it.',
                color: AgentColors.CODE_EXPERT,
                isDefault: false,
                isSystem: true,
                isChainEnabled: true,
                parentId: null
            },
            {
                id: 'code-reviewer',
                name: 'Code Reviewer',
                description: 'Specialized in reviewing code for bugs, security, and style.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are a Code Reviewer. Review the provided code implementation. Focus on identifying bugs, security vulnerabilities, and code style issues. Be constructive and concise. ALWAYS verify the code compiles by running `npm run build` or equivalent command if applicable. After verifying the code, update `TODO.md` to mark the relevant tasks as completed.',
                color: AgentColors.CODE_REVIEWER,
                isDefault: false,
                isSystem: true,
                isChainEnabled: true,
                parentId: null
            },
            {
                id: 'decision-reviewer',
                name: 'Decision Reviewer',
                description: 'Reviews architectural and design decisions.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are a Decision Reviewer. Evaluate architectural choices, trade-offs, and long-term implications. Ensure alignment with project goals. DO NOT just guess. Use tools like `list_directory`, `view_file`, and `run_command` to gather information before making decisions. If you are unsure, ask the user or delegate to a researcher.',
                color: AgentColors.DECISION_REVIEWER,
                isDefault: false,
                isSystem: true,
                isChainEnabled: false,
                parentId: null
            },
            {
                id: 'debugger',
                name: 'Debugger',
                description: 'Specialized in finding and fixing bugs.',
                modelId: 'openrouter/auto',
                systemPrompt: 'You are a Debugger. Analyze the provided error logs or buggy code. Identify the root cause and propose a fix.',
                color: AgentColors.DEBUGGER,
                isDefault: false,
                isSystem: true,
                isChainEnabled: false,
                parentId: null
            },
            {
                id: 'aesthetics',
                name: 'Aesthetics Agent',
                description: 'Specialized in UI/UX design and visual aesthetics.',
                modelId: 'anthropic/claude-sonnet-4',
                systemPrompt: 'You are an Aesthetics Agent. Your goal is to ensure the application looks beautiful, modern, and consistent. Focus on CSS, layout, typography, and animations. Use the `generate_image` tool to create UI mockups if needed.',
                color: AgentColors.AESTHETICS,
                isDefault: false,
                isSystem: true,
                isChainEnabled: false,
                parentId: null
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

    setAgents(agents) {
        this.agents = agents;
        this.persist();
    }

    resetDefaults() {
        this.agents = this.getDefaultAgents();
        this.persist();
    }
}

// Singleton
const instance = new AgentRegistry();
module.exports = instance;
