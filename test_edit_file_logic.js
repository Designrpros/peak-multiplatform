const fs = require('fs');

async function mockEditFile(originalContent, toolInput) {
    // Logic copied from ipc.js
    const searchStartMarker = '<<<<<<< SEARCH';
    const dividerMarker = '=======';
    const replaceEndMarker = '>>>>>>> REPLACE';

    const searchStartIndex = toolInput.indexOf(searchStartMarker);
    const dividerIndex = toolInput.indexOf(dividerMarker);
    const replaceEndIndex = toolInput.indexOf(replaceEndMarker);

    if (searchStartIndex === -1 || dividerIndex === -1 || replaceEndIndex === -1) {
        return { error: 'Invalid edit format. Missing markers.' };
    }

    const searchBlock = toolInput.substring(searchStartIndex + searchStartMarker.length, dividerIndex).trim();
    const replaceBlock = toolInput.substring(dividerIndex + dividerMarker.length, replaceEndIndex).trim();

    const normalize = (str) => str.replace(/\r\n/g, '\n').trim();
    const normalizedOriginal = normalize(originalContent);
    const normalizedSearch = normalize(searchBlock);

    if (!normalizedOriginal.includes(normalizedSearch)) {
        return { error: `Search block not found in file.\nSearch:\n${searchBlock}\n\nNormalized Original:\n${normalizedOriginal}` };
    }

    return { success: true, searchBlock, replaceBlock };
}

// Test Cases
const original = `
function hello() {
    console.log("Hello World");
}
`;

const case1_perfect = `
<<<<<<< SEARCH
function hello() {
    console.log("Hello World");
}
=======
function hello() {
    console.log("Hello Universe");
}
>>>>>>> REPLACE
`;

const case2_six_brackets = `
<<<<<< SEARCH
function hello() {
    console.log("Hello World");
}
=======
function hello() {
    console.log("Hello Universe");
}
>>>>>> REPLACE
`;

const case3_extra_spaces = `
<<<<<<< SEARCH 
function hello() {
    console.log("Hello World");
}
=======
function hello() {
    console.log("Hello Universe");
}
>>>>>>> REPLACE
`;

async function runTests() {
    console.log('--- Case 1 (Perfect) ---');
    console.log(await mockEditFile(original, case1_perfect));

    console.log('\n--- Case 2 (6 brackets) ---');
    console.log(await mockEditFile(original, case2_six_brackets));

    console.log('\n--- Case 3 (Extra spaces) ---');
    console.log(await mockEditFile(original, case3_extra_spaces));
}

runTests();
