// src/utils/enums.js

const InputMode = {
    SEARCH: "Search",
    NOTE: "Note",
    LLM: "LLM",
    TERMINAL: "Terminal",
    PROJECT: "Project",
    MINDMAP: "Mind Map",
    WHITEBOARD: "Whiteboard", // Excalidraw/Canvas
    KANBAN: "Tasks",          // Kanban board
    DOCS: "Docs"              // DevDocs.io wrapper
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
    // --- Paid / Premium ---
    { id: "openrouter/auto", name: "Auto (OpenRouter)", isPremium: true },
    { id: "openai/gpt-4o", name: "GPT-4o", isPremium: true },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", isPremium: true },
    { id: "google/gemini-pro-1.5", name: "Gemini 1.5 Pro", isPremium: true },
    
    // --- Free / Cheap ---
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash", isPremium: false },
    { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (Free)", isPremium: false },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", isPremium: false },
    { id: "meta-llama/llama-3.1-8b-instruct:free", name: "Llama 3.1 8B (Free)", isPremium: false },
    { id: "mistralai/mistral-7b-instruct:free", name: "Mistral 7B (Free)", isPremium: false }
];

module.exports = {
    InputMode,
    SearchEngine,
    AvailableModels
};