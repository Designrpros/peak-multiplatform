/**
 * DelegateTask.js
 * Tool to delegate a task to another agent.
 */

const DelegateTask = {
    name: 'delegate_task',
    description: 'Delegate a specific task to another specialized agent. Use this when a task requires a different expertise (e.g., "Code Expert" for writing code, "Debugger" for fixing bugs).',
    usage: `
<tool name="delegate_task" agent_id="agent-id" instruction="Specific instruction for the agent">
</tool>
    `,
    execute: async ({ agent_id, instruction }) => {
        // This tool is special; it doesn't just return a string.
        // It needs to trigger a recursive call in the MCPClient.
        // We'll return a special object that the client handles, or we can try to handle it here if we have access to the client.
        // Since tools are stateless functions, we'll return a structured response that the Client interprets.

        return JSON.stringify({
            type: 'delegation',
            agentId: agent_id,
            instruction: instruction
        });
    }
};

module.exports = DelegateTask;
