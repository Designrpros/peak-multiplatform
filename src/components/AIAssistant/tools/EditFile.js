/**
 * EditFile.js
 * Tool definition for editing existing files using search/replace blocks.
 */

module.exports = {
    name: 'edit_file',
    description: 'Edit an existing file by replacing a specific block of text. Use this for partial edits to large files.',
    usage: `
<tool name="edit_file" path="path/to/file.ext">
<<<<<<< SEARCH
Code to find
=======
Code to insert
>>>>>>> REPLACE
</tool>
    `,
    examples: [
        `
<tool name="edit_file" path="src/components/Button.js">
<<<<<<< SEARCH
    return (
        <button className="btn">
            {children}
        </button>
    );
=======
    return (
        <button className="btn primary">
            {children}
        </button>
    );
>>>>>>> REPLACE
</tool>
        `
    ]
};
