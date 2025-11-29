/**
 * UpdateFile.js
 * Tool definition for updating existing files.
 */

module.exports = {
    name: 'update_file',
    description: 'Update an existing file with new content. Use this to modify files.',
    usage: `
<tool name="update_file" path="path/to/file.ext">
New file content here...
</tool>
    `,
    examples: [
        `
<tool name="update_file" path="src/components/Button.js">
import React from 'react';
export const Button = () => <button className="updated">Click me</button>;
</tool>
        `
    ]
};
