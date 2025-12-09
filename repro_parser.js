const StreamParser = require('./src/components/AIAssistant/utils/StreamParser');

// Mock dependencies
window = { markdown: { render: (text) => text } };
document = {
    createElement: () => ({ innerHTML: '', textContent: '', querySelector: () => null })
};

const parser = new StreamParser();

const input = `I'll transform this project into a landing page for app testers. First, I'll examine the existing file structure to see what I'm working with.<tool_code>
<tool_name>list_directory</tool_name>
<usage>
<tool name="list_directory" path="./" recursive="true">
</tool>
</usage>
</tool_code>`;

console.log('--- Input ---');
console.log(input);

const normalized = parser.normalizeToolWrappers(input);
console.log('\n--- Normalized ---');
console.log(normalized);

const filtered = parser.filterSystemNoise(normalized);
console.log('\n--- Filtered ---');
console.log(filtered);

const processed = parser.processTools(filtered);
console.log('\n--- Processed ---');
console.log(processed);
