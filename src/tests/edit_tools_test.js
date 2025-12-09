const assert = require('assert');

// Mock function representing the new regex logic in ipc.js
function mockEditFileParsed(c) {
    const searchStartRegex = /^[<]{6,7}\s*SEARCH\s*$/m;
    const dividerRegex = /^[=]{6,7}\s*$/m;
    const replaceEndRegex = /^[>]{6,7}\s*REPLACE\s*$/m;

    const searchStartMatch = searchStartRegex.exec(c);
    const dividerMatch = dividerRegex.exec(c);
    const replaceEndMatch = replaceEndRegex.exec(c);

    if (!searchStartMatch || !dividerMatch || !replaceEndMatch) {
        return { error: 'Invalid markers' };
    }

    const searchStartIndex = searchStartMatch.index;
    const searchStartLength = searchStartMatch[0].length;

    const dividerIndex = dividerMatch.index;
    const dividerLength = dividerMatch[0].length;

    const replaceEndIndex = replaceEndMatch.index;

    const searchBlock = c.substring(searchStartIndex + searchStartLength, dividerIndex).trim();
    const replaceBlock = c.substring(dividerIndex + dividerLength, replaceEndIndex).trim();

    return { searchBlock, replaceBlock };
}

// Test Inputs
const case6Brackets = `
<<<<<< SEARCH
foo
======
bar
>>>>>> REPLACE
`;

const case7Brackets = `
<<<<<<< SEARCH
foo
=======
bar
>>>>>>> REPLACE
`;

// Validation
try {
    console.log('Testing 6 brackets...');
    const res6 = mockEditFileParsed(case6Brackets);
    assert.strictEqual(res6.searchBlock, 'foo');
    assert.strictEqual(res6.replaceBlock, 'bar');
    console.log('PASS');

    console.log('Testing 7 brackets...');
    const res7 = mockEditFileParsed(case7Brackets);
    assert.strictEqual(res7.searchBlock, 'foo');
    assert.strictEqual(res7.replaceBlock, 'bar');
    console.log('PASS');

} catch (e) {
    console.error('FAIL', e);
    process.exit(1);
}
