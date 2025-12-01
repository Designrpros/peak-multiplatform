// Mock document for Node.js environment
global.document = {
    createElement: () => ({
        innerHTML: '',
        textContent: 'mock content',
        querySelector: () => null,
        firstElementChild: { innerHTML: '' }
    })
};

const StreamParser = require('./src/components/AIAssistant/utils/StreamParser');

const parser = new StreamParser();

const input = `I will run the command to build the Xcode project again.

<tool name="run_command">
xcodebuild -project MindNodeClone.xcodeproj -scheme MindNodeClone -configuration Debug build
</tool>`;

console.log('--- Input ---');
console.log(input);
console.log('\n--- Parsed Output ---');
const output = parser.parse(input);
console.log(output);

console.log('\n--- Analysis ---');
if (output.includes('command-card')) {
    console.log('✅ SUCCESS: Command card found in output');
} else {
    console.log('❌ FAILURE: Command card NOT found in output');
}
