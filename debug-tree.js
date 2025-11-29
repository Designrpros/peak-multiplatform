const { EditorState } = require('@codemirror/state');
const { javascript } = require('@codemirror/lang-javascript');
const { syntaxTree } = require('@codemirror/language');

const content = "function foo() { return 1 "; // Missing closing brace
const state = EditorState.create({
    doc: content,
    extensions: [javascript()]
});

const tree = syntaxTree(state);
console.log("Tree found:", !!tree);

tree.iterate({
    enter: (node) => {
        if (node.type.isError) {
            console.log("Error Node Found:");
            console.log("  Type Name:", node.type.name);
            console.log("  From:", node.from, "To:", node.to);
            console.log("  Props:", node.type.props);
            // Check if there's any other info we can extract
            const text = state.doc.sliceString(node.from, node.to);
            console.log("  Text:", text);

            // Look at parent
            const parent = node.node.parent;
            if (parent) {
                console.log("  Parent Type:", parent.type.name);
            }
        }
    }
});
