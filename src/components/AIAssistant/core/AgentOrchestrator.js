/**
 * AgentOrchestrator.js
 * Manages multi-agent loops (Planner -> Coder -> Reviewer).
 */

const MCPClient = require('./MCPClient');
const AgentRegistry = require('./AgentRegistry');
const AgentLogger = require('./AgentLogger');

class AgentOrchestrator {
    constructor() {
        this.isLoopActive = false;
        this.executionQueue = []; // Stack/Queue for agents to run
        this.originalRequest = null;
        this.context = null;
        this.accumulatedHistory = [];
        this.maxSteps = 10; // Safety limit
        this.stepCount = 0;
    }

    /**
     * Starts a multi-agent execution flow.
     * @param {string} prompt - The user's original request.
     * @param {object} context - Project context.
     * @param {Array} rootAgents - Array of initial agent IDs (roots).
     */
    async startLoop(prompt, context, rootAgents = []) {
        if (this.isLoopActive) {
            console.warn('[AgentOrchestrator] Loop already active.');
            return;
        }

        this.isLoopActive = true;
        this.executionQueue = [...rootAgents]; // Initialize with roots
        this.originalRequest = prompt;
        this.context = context;
        this.accumulatedHistory = [];
        this.stepCount = 0;

        AgentLogger.system('Multi-Agent Flow Started', {
            roots: rootAgents,
            prompt: prompt
        });

        await this.executeNextStep();
    }

    async executeNextStep() {
        if (this.executionQueue.length === 0 || this.stepCount >= this.maxSteps) {
            this.finishLoop();
            return;
        }

        this.stepCount++;
        const agentId = this.executionQueue.shift(); // FIFO (Queue) - BFS-ish, or use pop() for DFS? Queue is safer for "Manager then Worker" flow.
        const agent = AgentRegistry.getAgent(agentId);

        if (!agent) {
            AgentLogger.error(`Agent not found: ${agentId}`);
            await this.executeNextStep();
            return;
        }

        // Get children agents for delegation
        const allAgents = AgentRegistry.getAgents();
        const children = allAgents.filter(a => a.parentId === agent.id && a.isChainEnabled);

        this.currentAgent = agent;
        this.currentChildren = children;

        // Notify UI of active agent change
        window.dispatchEvent(new CustomEvent('agent:active-change', {
            detail: { agent }
        }));

        AgentLogger.system(`Step ${this.stepCount}: ${agent.name}`, {
            agentId: agent.id,
            role: agent.name,
            agentColor: agent.color
        });

        // --- Construct Prompt ---
        let stepPrompt = '';
        const previousOutput = this.accumulatedHistory.length > 0
            ? this.accumulatedHistory[this.accumulatedHistory.length - 1].content
            : null;

        if (children.length > 0) {
            // This is a Manager Agent
            stepPrompt = this.constructManagerPrompt(agent, children, this.originalRequest, previousOutput);
        } else {
            // This is a Worker Agent
            stepPrompt = this.constructWorkerPrompt(agent, this.originalRequest, previousOutput);
        }

        // --- Send Request ---
        const client = MCPClient.getInstance();

        this.setupCompletionListener();

        // Ensure tool definitions are present
        let systemPrompt = agent.systemPrompt || '';
        if (!systemPrompt.includes('<tool_definition>') && !systemPrompt.includes('TOOLS AVAILABLE')) {
            const ToolRegistry = require('../tools/ToolRegistry');
            const tools = await ToolRegistry.getSystemPromptTools();
            systemPrompt += `\n\n# TOOLS AVAILABLE\n${tools}\n\n# MANDATORY RULES\n1. Use tools for all file operations.\n2. Do not output code blocks for files. YOU MUST USE the \`create_file\` or \`update_file\` tools.`;
        }

        await client.sendMessage(stepPrompt, this.context, agent.modelId, null, systemPrompt, agent);
    }

    setupCompletionListener() {
        const completionHandler = (e) => this.handleAgentCompletion(e);
        window.addEventListener('mcp:stream-complete', completionHandler, { once: true });
    }

    waitForContinue() {
        console.log('[AgentOrchestrator] Waiting for continuation...');
        this.setupCompletionListener();
    }

    handleAgentCompletion(e) {
        if (e.detail.error) {
            AgentLogger.error(`Agent ${this.currentAgent.name} failed`, { error: e.detail.error });
            this.executeNextStep();
            return;
        }

        const content = e.detail.raw;

        // Save output
        this.accumulatedHistory.push({
            agentId: this.currentAgent.id,
            role: 'assistant',
            content: content
        });

        let delegated = false;

        // --- Check for Delegation (support both tag formats) ---
        if (this.currentChildren.length > 0) {
            // Format 1: <delegate agent="agent-id" />
            let delegationMatch = content.match(/<delegate\s+agent="([^"]+)"\s*\/?>/i);

            //Format 2: <delegate_task agent_id="agent-id" instruction="...">
            if (!delegationMatch) {
                delegationMatch = content.match(/<delegate_task\s+agent_id="([^"]+)"/i);
            }

            if (delegationMatch) {
                const targetAgentId = delegationMatch[1];
                // Verify target is a valid child
                if (this.currentChildren.find(c => c.id === targetAgentId)) {
                    AgentLogger.system(`${this.currentAgent.name} delegated to ${targetAgentId}`);
                    // Add to FRONT of queue (immediate execution)
                    this.executionQueue.unshift(targetAgentId);
                    delegated = true;
                    this.consecutiveNoDelegations = 0; // Reset counter
                } else {
                    AgentLogger.warn(`${this.currentAgent.name} tried to delegate to invalid child: ${targetAgentId}`);
                }
            }
        }

        // Track consecutive non-delegations to prevent infinite loops
        if (!delegated && this.currentChildren.length > 0) {
            this.consecutiveNoDelegations = (this.consecutiveNoDelegations || 0) + 1;
            if (this.consecutiveNoDelegations >= 3) {
                AgentLogger.error(`${this.currentAgent.name} failed to delegate 3 times consecutively. Stopping loop to prevent infinite recursion.`);
                this.finishLoop();
                return;
            }
        }

        // Check for tool usage (pause if needed)
        const hasTools = /<(tool|create_file|update_file|run_command|delete_file|search_project|list_directory)/.test(content);
        if (hasTools) {
            AgentLogger.system(`Agent ${this.currentAgent.name} proposed actions. Waiting for review...`);
            window.dispatchEvent(new CustomEvent('peak-agent-waiting-review', {
                detail: { agentId: this.currentAgent.id }
            }));
            return; // Pause loop
        }

        // Move to next step
        setTimeout(() => {
            if (this.isLoopActive) {
                this.executeNextStep();
            }
        }, 1000);
    }

    constructManagerPrompt(agent, children, originalRequest, previousOutput) {
        const childrenList = children.map(c => `- ID: "${c.id}", Name: "${c.name}", Description: "${c.description}"`).join('\n');

        let base = `You are a MANAGER AGENT (${agent.name}).\n`;
        base += `Your role is to ORCHESTRATE work by delegating to specialized sub-agents. You do NOT execute tasks yourself.\n\n`;

        base += `AVAILABLE SUB-AGENTS:\n${childrenList}\n\n`;

        base += `USER REQUEST:\n"${originalRequest}"\n\n`;

        if (previousOutput) {
            base += `PREVIOUS AGENT OUTPUT:\n${previousOutput}\n\n`;
        }

        base += `CRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE RULES:\n`;
        base += `1. You are a MANAGER. You do NOT execute tasks, install packages, or write code yourself.\n`;
        base += `2. You MUST delegate to one of your sub-agents listed above.\n`;
        base += `3. Analyze which sub-agent is best suited for the current step.\n`;
        base += `4. Provide a brief analysis (2-3 sentences) explaining WHY you're delegating to that agent.\n`;
        base += `5. Then output EXACTLY this tag on a new line: <delegate agent="AGENT_ID" />\n`;
        base += `6. MANDATORY: You must delegate at least once. Do not claim the task is "complete" without delegating.\n`;
        base += `7. If no sub-agent is appropriate, explain why and request user guidance.\n\n`;

        base += `EXAMPLE RESPONSE:\n`;
        base += `"The user needs to install dependencies. The Coder agent is responsible for executing terminal commands and managing build processes, so I'm delegating this task to them.\n`;
        base += `<delegate agent="coder" />"\n\n`;

        base += `Now analyze the request and delegate appropriately.\n`;

        return base;
    }

    constructWorkerPrompt(agent, originalRequest, previousOutput) {
        if (!previousOutput) return originalRequest;

        return `
Previous Agent Output:
${previousOutput}

Your Task:
Based on the user request "${originalRequest}" and the context above, perform your specific role (${agent.name}).
        `.trim();
    }

    resumeLoop() {
        if (!this.isLoopActive) return;
        console.log('[AgentOrchestrator] Resuming flow...');
        this.executeNextStep();
    }

    stopLoop() {
        console.log('[AgentOrchestrator] Stopping flow...');
        this.isLoopActive = false;
        this.executionQueue = [];
        AgentLogger.system('Multi-Agent Flow Stopped by User');
    }

    finishLoop() {
        this.isLoopActive = false;
        AgentLogger.system('Multi-Agent Flow Finished', { steps: this.stepCount });
        window.dispatchEvent(new CustomEvent('peak-multi-agent-loop-complete'));
    }
}

const instance = new AgentOrchestrator();
module.exports = instance;
