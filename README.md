# 🌌 The Peak Creative Studio

**Peak Creative Studio** is a modern, cross-platform IDE focused on enhancing developer productivity through integrated tools and AI-driven context. Built on Electron, it provides a unified environment combining a sophisticated code editor, a powerful terminal, and intelligent project management using the ModelContextProtocol (MCP).

## ✨ Core Features & Technologies

| Feature | Technology | Description |
| :--- | :--- | :--- |
| **Integrated Terminal** | [Xterm.js](https://xtermjs.org/) | A fast, feature-rich terminal emulator for command-line tasks directly within the application. |
| **Advanced Code Editor** | [CodeMirror 6](https://codemirror.net/) | A modern, extendable text editor supporting syntax highlighting for hundreds of languages (JavaScript, CSS, HTML, JSON, Python, Rust, Ruby, etc.). |
| **Intelligent Context** | **ModelContextProtocol (MCP)** | Advanced data handling and communication protocol designed for integrating AI and language models directly into the development workflow. |
| **Cross-Platform Delivery** | [Electron](https://www.electronjs.org/) | Enables seamless building and distribution across macOS, Windows, and Linux. |

## 🛠️ Tech Stack Overview

*   **Platform:** Electron
*   **Editor:** CodeMirror 6
*   **Terminal:** Xterm.js
*   **Framework:** Node.js / JavaScript/TypeScript

## ⬇️ Setup and Development

These steps will get the development environment running on your machine.

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/en/) (v18+) and npm installed.

### 1. Install Dependencies

First, install the standard Node.js packages and ensure any native modules are correctly built for your Electron environment.

```bash
# Install Node.js packages
npm install
```

**Note:** The `postinstall` script should automatically handle the native module rebuild (`npm run rebuild`). If you encounter issues, run it manually:

```bash
npm run rebuild
```

### 2. Start Development

Use the dedicated `start` script to launch the application in a development window. This command will start the application with necessary development flags enabled.

```bash
npm start
```
*The application's main window will launch once the Electron process is ready.*

## 📦 Building for Production

To create a production-ready application package for distribution, use the build scripts provided by `electron-builder`. All final packages will be placed in the newly created `dist/` directory.

### Build All Supported Platforms

For convenience, run:
```bash
npm run build 
# or 
npm run dist
```

### Build Specific Platforms

| Platform | Command | Output Architecture |
| :--- | :--- | :--- |
| **macOS** | `npm run dist:mac` | x64, arm64 (Universal) |
| **Windows** | `npm run dist:win` | x64, arm64 |
| **Linux** | `npm run dist:linux` | x64, arm64 |
