/**
 * RunCommand.js
 * Tool definition for running terminal commands.
 */

module.exports = {
    name: 'run_command',
    description: 'Execute a command in the terminal.',
    usage: `
<tool name="run_command">
command to execute
</tool>
    `,
    examples: [
        `
<tool name="run_command">
npm install react
</tool>
        `
    ]
};
