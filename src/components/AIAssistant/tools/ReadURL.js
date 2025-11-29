/**
 * ReadURL.js
 * Tool definition for reading content from a URL.
 */

module.exports = {
    name: 'read_url',
    description: 'Read the content of a URL. Use this to read documentation, web pages, or external resources.',
    usage: `
<tool name="read_url" url="https://example.com">
</tool>
    `,
    examples: [
        `
<tool name="read_url" url="https://devdocs.io/javascript/">
</tool>
        `
    ]
};
