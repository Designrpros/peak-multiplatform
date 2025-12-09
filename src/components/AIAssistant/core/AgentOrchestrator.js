/**
 * AgentOrchestrator.js
 * Manages multi-agent loops (Planner -> Coder -> Reviewer) using a State Machine.
 */

const MCPClient = require('./MCPClient');
const AgentRegistry = require('./AgentRegistry');
const AgentLogger = require('./AgentLogger');

// Workflow States
const WorkflowState = {
    IDLE: 'IDLE',
    PLANNING: 'PLANNING',
    REVIEW_PLAN: 'REVIEW_PLAN',
    EXECUTING: 'EXECUTING',
    REVIEW_CHANGES: 'REVIEW_CHANGES',
    FINISHED: 'FINISHED'
};

class AgentOrchestrator {
    constructor() {
        this.state = WorkflowState.IDLE;
        this.executionQueue = []; // Queue for agents
        this.originalRequest = null;
        this.context = null;
        this.accumulatedHistory = [];
        this.maxSteps = 20; // Increased safety limit
        this.stepCount = 0;
        this.currentPlan = null; // Store the structured plan
    }

    /**
     * Starts a multi-agent execution flow.
     * @param {string} prompt - The user's original request.
     * @param {object} context - Project context.
     * @param {Array} rootAgents - Array of initial agent IDs (roots).
     */
    async startLoop(prompt, context, rootAgents = []) {
        if (this.state !== WorkflowState.IDLE) {
            console.warn('[AgentOrchestrator] Loop already active in state:', this.state);
            return;
        }

        this.transitionTo(WorkflowState.PLANNING);

        this.executionQueue = [...rootAgents];
        this.originalRequest = prompt;
        this.context = context;
        this.accumulatedHistory = [];
        this.stepCount = 0;
        this.currentPlan = null;

        AgentLogger.system('Multi-Agent Flow Started', {
            roots: rootAgents,
            prompt: prompt
        });

        await this.executeNextStep();
    }

    transitionTo(newState) {
        console.log(`[AgentOrchestrator] Transition: ${this.state} -> ${newState}`);
        this.state = newState;

        // Notify UI
        window.dispatchEvent(new CustomEvent('peak-workflow-state-change', {
            detail: { state: this.state }
        }));
    }

    async executeNextStep() {
        if (this.state === WorkflowState.IDLE || this.state === WorkflowState.FINISHED) return;

        // Check limits
        if (this.stepCount >= this.maxSteps) {
            AgentLogger.error('Max steps reached. Stopping loop.');
            this.finishLoop();
            return;
        }

        // Check Queue
        if (this.executionQueue.length === 0) {
            // If queue is empty but we are not finished, what do we do?
            // In EXECUTING state, if queue is empty, we might be done with execution phase.
            if (this.state === WorkflowState.EXECUTING) {
                // Check if we should move to Review or Finish
                // For now, let's assume if queue is empty, we are done.
                this.finishLoop();
            }
            return;
        }

        this.stepCount++;
        const agentId = this.executionQueue.shift();
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

        AgentLogger.system(`Step ${this.stepCount}: ${agent.name} (${this.state})`, {
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
            // Manager/Planner
            stepPrompt = this.constructManagerPrompt(agent, children, this.originalRequest, previousOutput);
        } else {
            // Worker
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

    handleAgentCompletion(e) {
        if (e.detail.error) {
            if (e.detail.error === 'Aborted by user') {
                this.stopLoop();
                return;
            }
            AgentLogger.error(`Agent ${this.currentAgent.name} failed`, { error: e.detail.error });
            // Retry or move on? For now, move on.
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

        // --- 1. CHECK FOR PLAN (Planner Agent) ---
        if (this.currentAgent.id === 'planner') {
            // Look for <plan> tag
            if (content.includes('<plan>')) {
                console.log('[AgentOrchestrator] Plan detected. Pausing for approval.');
                this.transitionTo(WorkflowState.REVIEW_PLAN);
                // We do NOT schedule next step. We wait for user action.
                return;
            }
        }

        // --- 2. CHECK FOR DELEGATION ---
        let delegated = false;
        if (this.currentChildren.length > 0) {
            // Format 1: <delegate agent="agent-id" />
            let delegationMatch = content.match(/<delegate\s+agent="([^"]+)"\s*\/?>/i);
            // Format 2: <delegate_task agent_id="agent-id" ...>
            if (!delegationMatch) {
                delegationMatch = content.match(/<delegate_task\s+agent_id="([^"]+)"/i);
            }

            if (delegationMatch) {
                const targetAgentId = delegationMatch[1];
                if (this.currentChildren.find(c => c.id === targetAgentId)) {
                    AgentLogger.system(`${this.currentAgent.name} delegated to ${targetAgentId}`);
                    this.executionQueue.unshift(targetAgentId);
                    delegated = true;
                }
            }
        }

        // --- 3. CHECK FOR TOOLS (Pause for Auto-Execution) ---
        // If we are in EXECUTING state, we might need to pause for the tool to run.
        // ChatView handles the actual execution via 'handleAutoExecution'.
        // But we need to know if we should wait.
        const hasTools = /<(tool|create_file|update_file|run_command|delete_file|search_project|list_directory)/.test(content);

        if (hasTools) {
            console.log('[AgentOrchestrator] Tools detected. Pausing loop for execution.');
            // We don't change state, but we stop the immediate recursion.
            // The ChatView will call resumeLoop() after tools are done.
            return;
        }

        // If no tools and no plan pause, continue immediately
        setTimeout(() => {
            if (this.state !== WorkflowState.IDLE && this.state !== WorkflowState.REVIEW_PLAN && this.state !== WorkflowState.FINISHED) {
                this.executeNextStep();
            }
        }, 1000);
    }

    // --- User Actions ---

    handlePlanApproval(approved, feedback = null) {
        if (approved) {
            this.approvePlan();
        } else {
            this.rejectPlan(feedback);
        }
    }

    approvePlan() {
        if (this.state !== WorkflowState.REVIEW_PLAN) return;

        AgentLogger.system('Plan Approved by User');
        this.transitionTo(WorkflowState.EXECUTING);

        // Resume execution (Planner delegated to Coder, so Coder should be in queue or we need to prompt Planner to delegate?)
        // Actually, if Planner output <plan> AND <delegate>, the delegate is in queue.
        // If Planner ONLY output <plan>, we might need to nudge it to delegate.

        // Let's check if queue has items.
        if (this.executionQueue.length > 0) {
            this.executeNextStep();
        } else {
            // Planner didn't delegate? Nudge it.
            // Or maybe we just manually add 'code-expert' if it's the standard flow?
            // Let's assume Planner follows instructions and delegates.
            // If not, we might need a "Start Execution" prompt.
            AgentLogger.warn('Queue empty after plan approval. Nudging Planner to delegate...');
            // For now, let's just try to resume.
            this.resumeLoop();
        }
    }

    rejectPlan(feedback) {
        if (this.state !== WorkflowState.REVIEW_PLAN) return;

        AgentLogger.system('Plan Rejected/Refined by User', { feedback });
        this.transitionTo(WorkflowState.PLANNING);

        // Add feedback to history
        this.accumulatedHistory.push({
            role: 'user',
            content: `The plan is rejected. Feedback: ${feedback}\nPlease revise the plan.`
        });

        // Re-queue Planner
        this.executionQueue.unshift('planner');
        this.executeNextStep();
    }

    resumeLoop() {
        if (this.state === WorkflowState.IDLE || this.state === WorkflowState.FINISHED) return;
        console.log('[AgentOrchestrator] Resuming loop...');

        // If we paused for tools, we just call executeNextStep
        // But wait, if the tool execution added a result to history, we want the SAME agent to see it?
        // Or the NEXT agent?
        // Usually, the same agent continues to process the tool result.
        // So we should re-queue the current agent?

        if (this.currentAgent) {
            // We want the current agent to see the tool output and continue.
            this.executionQueue.unshift(this.currentAgent.id);
        }

        this.executeNextStep();
    }

    stopLoop() {
        this.transitionTo(WorkflowState.FINISHED);
        this.executionQueue = [];
        AgentLogger.system('Multi-Agent Flow Stopped');
    }

    finishLoop() {
        this.transitionTo(WorkflowState.FINISHED);
        AgentLogger.system('Multi-Agent Flow Finished', { steps: this.stepCount });
        window.dispatchEvent(new CustomEvent('peak-multi-agent-loop-complete'));
    }

    // --- Prompt Construction ---

    constructManagerPrompt(agent, children, originalRequest, previousOutput) {
        const childrenList = children.map(c => `- ID: "${c.id}", Name: "${c.name}"`).join('\n');
        let base = `You are a MANAGER AGENT (${agent.name}).\n`;
        base += `Your role is to ORCHESTRATE work. You do NOT execute tasks yourself.\n\n`;
        base += `AVAILABLE SUB-AGENTS:\n${childrenList}\n\n`;
        base += `USER REQUEST:\n"${originalRequest}"\n\n`;

        if (previousOutput) {
            base += `PREVIOUS OUTPUT:\n${previousOutput}\n\n`;
        }

        base += `INSTRUCTIONS:\n`;
        base += `1. Analyze the request.\n`;
        base += `2. If you haven't created a plan yet, output a <plan> block.\n`;
        base += `3. Delegate to sub-agents using <delegate agent="AGENT_ID" />.\n`;

        return base;
    }

    constructWorkerPrompt(agent, originalRequest, previousOutput) {
        if (!previousOutput) return originalRequest;
        return `Previous Output:\n${previousOutput}\n\nYour Task:\nPerform your role (${agent.name}) based on the request "${originalRequest}".`;
    }
}

const instance = new AgentOrchestrator();
module.exports = instance;
