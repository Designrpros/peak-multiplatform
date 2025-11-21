// src/components/TerminalView/theme.js

// Helper to get CSS variable values
function getVar(varName) {
    return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

/**
 * Reads the app's current CSS variables and returns a
 * complete theme object for xterm.js.
 */
function getCurrentTheme() {
    const isDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Base colors are read live from your style.css
    const theme = {
        foreground: getVar('--peak-primary'),
        background: getVar('--text-background-color'),
        cursor: getVar('--peak-accent'),
        selectionBackground: getVar('--peak-accent'),
        selectionForeground: '#FFFFFF',
        
        // --- THIS IS THE NEW LINE ---
        padding: 12 // Adds 12px padding inside the terminal
    };

    // ANSI colors are static, but we pick the set based on mode
    // (Using Atom One colors)
    const ansi = {
        black: isDarkMode ? '#282C34' : '#000000',
        red: '#E06C75',
        green: '#98C379',
        yellow: '#E5C07B',
        blue: '#61AFEF',
        magenta: '#C678DD',
        cyan: '#56B6C2',
        white: '#ABB2BF',
        brightBlack: '#5C6370',
        brightRed: '#E06C75',
        brightGreen: '#98C379',
        brightYellow: '#E5C07B',
        brightBlue: '#61AFEF',
        brightMagenta: '#C678DD',
        brightCyan: '#56B6C2',
        brightWhite: '#FFFFFF'
    };
    
    return { ...theme, ...ansi };
}

module.exports = {
    getCurrentTheme
};