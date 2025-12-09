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
    // (Using VS Code Default Dark colors)
    const ansi = {
        black: isDarkMode ? '#000000' : '#000000',
        red: '#CD3131',
        green: '#0DBC79',
        yellow: '#E5E510',
        blue: '#2472C8',
        magenta: '#BC3FBC',
        cyan: '#11A8CD',
        white: '#E5E5E5',
        brightBlack: '#666666',
        brightRed: '#F14C4C',
        brightGreen: '#23D18B',
        brightYellow: '#F5F543',
        brightBlue: '#3B8EEA',
        brightMagenta: '#D670D6',
        brightCyan: '#29B8DB',
        brightWhite: '#E5E5E5'
    };

    return { ...theme, ...ansi };
}

module.exports = {
    getCurrentTheme
};