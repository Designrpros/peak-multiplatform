/**
 * ViewFile.js
 * Tool definition for viewing the contents of a file.
 */

module.exports = {
    name: 'view_file',
    description: 'View the contents of a file.',
    usage: `
<tool name="view_file" path="path/to/file.ext">
</tool>
    `,
    examples: [
        `
<tool name="view_file" path="src/App.js">
</tool>
        `
    ]
};
