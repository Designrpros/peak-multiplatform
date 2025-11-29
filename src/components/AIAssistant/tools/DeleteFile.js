/**
 * DeleteFile.js
 * Tool definition for deleting files.
 */

module.exports = {
    name: 'delete_file',
    description: 'Delete a file from the project.',
    usage: `
<tool name="delete_file" path="path/to/file.ext">
</tool>
    `,
    examples: [
        `
<tool name="delete_file" path="src/unused.js">
</tool>
        `
    ]
};
