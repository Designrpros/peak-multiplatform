// src/utils/enums.js

const InputMode = {
    SEARCH: "Search",
    KANBAN: "Tasks",          // Kanban board
    NOTE: "Note",
    LLM: "LLM",
    PROJECT: "Project",
    TERMINAL: "Terminal",
    MINDMAP: "Mind Map",
    WHITEBOARD: "Whiteboard", // Excalidraw/Canvas
    DOCS: "Docs",             // DevDocs.io wrapper
    WORKSPACES: "Workspaces"  // Replaces FINDER
};

const SearchEngine = [
    { id: "google", name: "Google", url: "https://www.google.com/search?q=" },
    { id: "duckduckgo", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=" },
    { id: "bing", name: "Bing", url: "https://www.bing.com/search?q=" },
    { id: "brave", name: "Brave Search", url: "https://search.brave.com/search?q=" },
    { id: "startpage", name: "Startpage", url: "https://www.startpage.com/sp/search?query=" },
    { id: "wikipedia", name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=" },
    { id: "stackoverflow", name: "Stack Overflow", url: "https://stackoverflow.com/search?q=" },
    { id: "github", name: "GitHub", url: "https://github.com/search?q=" },
    { id: "mdn", name: "MDN Web Docs", url: "https://developer.mozilla.org/en-US/search?q=" },
    { id: "googlescholar", name: "Google Scholar", url: "https://scholar.google.com/scholar?q=" },
    { id: "wolframalpha", name: "WolframAlpha", url: "https://www.wolframalpha.com/input/?i=" },
    { id: "youtube", name: "YouTube", url: "https://www.youtube.com/results?search_query=" },
    { id: "unsplash", name: "Unsplash", url: "https://unsplash.com/s/photos/" },
    { id: "imdb", name: "IMDb", url: "https://www.imdb.com/find?q=" }
];

const AvailableModels = [
    { id: "openrouter/auto", name: "Auto", isPremium: true, supportsReasoning: true },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1", isPremium: true, supportsReasoning: true },
    { id: "x-ai/grok-4-fast", name: "Grok 4 Fast", isPremium: true, supportsReasoning: true },
    { id: "openai/gpt-5", name: "GPT-5", isPremium: true, supportsReasoning: true },
    { id: "google/gemini-2.5-flash-preview-09-2025", name: "Gemini 2.5 Flash", isPremium: true, supportsReasoning: true },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", isPremium: true, supportsReasoning: true },
    { id: "google/gemini-3-pro-preview", name: "Gemini 3 Pro", isPremium: true, supportsReasoning: true },
    { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", isPremium: true, supportsReasoning: true },
    { id: "x-ai/grok-code-fast-1", name: "Grok Code Fast 1", isPremium: true, supportsReasoning: true }
];

module.exports = {
    InputMode,
    SearchEngine,
    AvailableModels
};