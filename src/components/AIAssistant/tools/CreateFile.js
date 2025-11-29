/**
 * CreateFile.js
 * Tool definition for creating or overwriting files.
 */

module.exports = {
    name: 'create_file',
    description: 'Create or overwrite a file with the specified content.',
    usage: `
<tool name="create_file" path="path/to/file.ext">
File content here...
</tool>
    `,
    examples: [
        `
<tool name="create_file" path="src/components/Button.js">
import React from 'react';
export const Button = () => <button>Click me</button>;
</tool>
        `
    ]
};
