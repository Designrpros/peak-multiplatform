
// Mock DOM
global.document = {
    createElement: (tag) => ({
        innerHTML: '',
        textContent: '',
        style: {},
        classList: { add: () => { }, contains: () => false },
        appendChild: () => { },
        setAttribute: () => { },
        dataset: {},
        querySelector: () => null
    })
};

const StreamParser = require('./src/components/AIAssistant/utils/StreamParser');
const ToolRegistry = require('./src/components/AIAssistant/tools/ToolRegistry');

// Mock ToolRegistry
ToolRegistry.getCachedTools = () => [
    { name: 'directory_tree', serverId: 'filesystem' },
    { name: 'read_text_file', serverId: 'filesystem' }
];

const parser = new StreamParser();
const input = `
It seems I initially tried to list a restricted path. I apologize for the error. Given the project root is \`/Users/vegarberentsen/my-peak-app\`, I will try to list the contents recursively from the root of your project to understand the structure.

I'll also reattempt to read \`readme.md\`.

<tool name="directory_tree" path="." excludePatterns=".git,node_modules">
</tool>
<tool name="read_text_file" path="readme.md">
</tool>
`;

console.log('--- Input ---');
console.log(input);
console.log('--- Output ---');
const output = parser.parse(input);
console.log(output);
