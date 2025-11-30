/**
 * ToolRegistry.js
 * Central registry for all available MCP tools.
 */

const CreateFile = require('./CreateFile');
const RunCommand = require('./RunCommand');
const DeleteFile = require('./DeleteFile');
const SearchProject = require('./SearchProject');

const ViewFile = require('./ViewFile');
const UpdateFile = require('./UpdateFile');
const GetProblems = require('./GetProblems');
const CaptureLiveView = require('./CaptureLiveView');
const ReadURL = require('./ReadURL');
const ListDirectory = require('./ListDirectory');
const DelegateTask = require('./DelegateTask');

const tools = [
    CreateFile,
    UpdateFile,
    RunCommand,
    DeleteFile,
    SearchProject,
    ViewFile,
    ListDirectory,
    GetProblems,
    CaptureLiveView,
    ReadURL,
    DelegateTask
];

class ToolRegistry {
    static getTools() {
        return tools;
    }

    static getSystemPromptTools() {
        return tools.map(tool => {
            return `
<tool_definition>
<name>${tool.name}</name>
<description>${tool.description}</description>
<usage>
${tool.usage.trim()}
</usage>
</tool_definition>
            `.trim();
        }).join('\n\n');
    }
}

module.exports = ToolRegistry;
