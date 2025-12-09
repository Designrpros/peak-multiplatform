const fs = require('fs');
const path = require('path');
const ProjectStructure = require('./ProjectStructure');

/**
 * Manages .peak/project-context.md files for AI context
 */
class ProjectContextManager {
    constructor() {
        this.contextCache = new Map();
    }

    /**
     * Get project context for AI (combined auto-generated + custom)
     * @param {string} projectRoot - Project root path
     * @returns {string} Markdown formatted context
     */
    getContext(projectRoot) {
        if (!projectRoot) return '';

        // Check cache
        const cacheKey = projectRoot;
        if (this.contextCache.has(cacheKey)) {
            const cached = this.contextCache.get(cacheKey);
            if (Date.now() - cached.timestamp < 60000) { // 1min cache
                return cached.context;
            }
        }

        const peakDir = path.join(projectRoot, '.peak');
        const contextPath = path.join(peakDir, 'project-context.md');

        let context = '';

        // Try to read existing context file
        if (fs.existsSync(contextPath)) {
            try {
                const userContext = fs.readFileSync(contextPath, 'utf8');
                context = userContext;
            } catch (err) {
                console.error('[ProjectContext] Error reading context file:', err);
            }
        } else {
            // Generate default context
            context = this.generateDefaultContext(projectRoot);

            // Auto-save it
            this.saveContext(projectRoot, context);
        }

        // Cache result
        this.contextCache.set(cacheKey, {
            context,
            timestamp: Date.now()
        });

        return context;
    }

    /**
     * Generate default project context
     * @param {string} projectRoot - Project root path
     * @returns {string} Default context markdown
     */
    generateDefaultContext(projectRoot) {
        const projectName = path.basename(projectRoot);
        const structure = ProjectStructure.generateTree(projectRoot, 3);
        const summary = ProjectStructure.getDirectorySummary(projectRoot);

        // Detect everything dynamically
        const detection = this.detectProjectDetails(projectRoot);

        return `# Project: ${projectName}

## Project Type
${detection.projectType}

## Language${detection.languages.length > 1 ? 's' : ''}
${detection.languages.join(', ')}

## Directory Structure

${structure}

## Key Directories
${summary}

## Coding Conventions
${detection.conventions.length > 0 ? detection.conventions.join('\n') : '- Follow existing code patterns in the project'}

${detection.buildTools.length > 0 ? `## Build Tools\n${detection.buildTools.join(', ')}\n` : ''}
${detection.frameworks.length > 0 ? `## Frameworks & Libraries\n${detection.frameworks.slice(0, 5).join(', ')}${detection.frameworks.length > 5 ? ` (and ${detection.frameworks.length - 5} more)` : ''}\n` : ''}
## Notes
<!-- You can add custom notes here. This file is created automatically but you can edit it.
     The AI will read this context to better understand your project structure and conventions. -->
`;
    }

    /**
     * Detect project details from files and structure
     * @param {string} projectRoot - Project root path
     * @returns {Object} Detection results
     */
    detectProjectDetails(projectRoot) {
        const result = {
            projectType: 'Unknown Project',
            languages: [],
            frameworks: [],
            buildTools: [],
            conventions: []
        };

        // Check for package.json (JavaScript/TypeScript)
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                const deps = { ...pkg.dependencies, ...pkg.devDependencies };

                // Detect framework
                if (deps['next']) {
                    result.projectType = 'Next.js Application';
                    result.frameworks.push('Next.js');
                } else if (deps['react']) {
                    result.projectType = deps['vite'] ? 'React + Vite Application' : 'React Application';
                    result.frameworks.push('React');
                } else if (deps['vue']) {
                    result.projectType = 'Vue.js Application';
                    result.frameworks.push('Vue.js');
                } else if (deps['@angular/core']) {
                    result.projectType = 'Angular Application';
                    result.frameworks.push('Angular');
                } else if (deps['svelte']) {
                    result.projectType = 'Svelte Application';
                    result.frameworks.push('Svelte');
                } else if (deps['express']) {
                    result.projectType = 'Express/Node.js Backend';
                    result.frameworks.push('Express');
                } else if (deps['fastify']) {
                    result.projectType = 'Fastify/Node.js Backend';
                    result.frameworks.push('Fastify');
                } else if (deps['nestjs']) {
                    result.projectType = 'NestJS Backend';
                    result.frameworks.push('NestJS');
                } else {
                    result.projectType = 'Node.js Project';
                }

                // Add other notable frameworks
                if (deps['react']) result.frameworks.push('React');
                if (deps['tailwindcss']) result.frameworks.push('Tailwind CSS');
                if (deps['@tanstack/react-query']) result.frameworks.push('React Query');
                if (deps['zustand'] || deps['redux']) result.frameworks.push(deps['zustand'] ? 'Zustand' : 'Redux');

                // Detect language
                if (deps['typescript'] || fs.existsSync(path.join(projectRoot, 'tsconfig.json'))) {
                    result.languages.push('TypeScript');
                    result.conventions.push('- Use TypeScript for all new files');
                    result.conventions.push('- Define prop types with interfaces');
                } else {
                    result.languages.push('JavaScript');
                }

                // Build tools
                if (deps['vite']) result.buildTools.push('Vite');
                if (deps['webpack']) result.buildTools.push('Webpack');
                if (deps['esbuild']) result.buildTools.push('esbuild');
                if (deps['turbo']) result.buildTools.push('Turborepo');

                // Conventions
                if (deps['eslint']) result.conventions.push('- Follow ESLint rules defined in project');
                if (deps['prettier']) result.conventions.push('- Use Prettier for code formatting');
                if (deps['tailwindcss']) result.conventions.push('- Use Tailwind CSS for styling');

            } catch (err) {
                console.error('[ProjectContext] Error reading package.json:', err);
            }
        }

        // Check for Python projects
        if (fs.existsSync(path.join(projectRoot, 'requirements.txt')) ||
            fs.existsSync(path.join(projectRoot, 'pyproject.toml')) ||
            fs.existsSync(path.join(projectRoot, 'setup.py'))) {
            result.projectType = 'Python Project';
            result.languages.push('Python');

            if (fs.existsSync(path.join(projectRoot, 'manage.py'))) {
                result.projectType = 'Django Application';
                result.frameworks.push('Django');
            }

            const reqPath = path.join(projectRoot, 'requirements.txt');
            if (fs.existsSync(reqPath)) {
                const req = fs.readFileSync(reqPath, 'utf8');
                if (req.includes('flask')) {
                    result.projectType = 'Flask Application';
                    result.frameworks.push('Flask');
                }
                if (req.includes('fastapi')) {
                    result.projectType = 'FastAPI Application';
                    result.frameworks.push('FastAPI');
                }
            }
        }

        // Check for Go projects
        if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
            result.projectType = 'Go Project';
            result.languages.push('Go');
        }

        // Check for Rust projects
        if (fs.existsSync(path.join(projectRoot, 'Cargo.toml'))) {
            result.projectType = 'Rust Project';
            result.languages.push('Rust');
            result.buildTools.push('Cargo');
        }

        // Check for Java/Kotlin projects
        if (fs.existsSync(path.join(projectRoot, 'pom.xml'))) {
            result.projectType = 'Maven (Java) Project';
            result.languages.push('Java');
            result.buildTools.push('Maven');
        } else if (fs.existsSync(path.join(projectRoot, 'build.gradle')) ||
            fs.existsSync(path.join(projectRoot, 'build.gradle.kts'))) {
            result.projectType = 'Gradle Project';
            result.languages.push(fs.existsSync(path.join(projectRoot, 'build.gradle.kts')) ? 'Kotlin' : 'Java');
            result.buildTools.push('Gradle');
        }

        // Check for Ruby projects
        if (fs.existsSync(path.join(projectRoot, 'Gemfile'))) {
            result.projectType = 'Ruby Project';
            result.languages.push('Ruby');

            const gemfile = fs.readFileSync(path.join(projectRoot, 'Gemfile'), 'utf8');
            if (gemfile.includes('rails')) {
                result.projectType = 'Ruby on Rails Application';
                result.frameworks.push('Rails');
            }
        }

        // Check for PHP projects
        if (fs.existsSync(path.join(projectRoot, 'composer.json'))) {
            result.projectType = 'PHP Project';
            result.languages.push('PHP');

            try {
                const composer = JSON.parse(fs.readFileSync(path.join(projectRoot, 'composer.json'), 'utf8'));
                if (composer.require && composer.require['laravel/framework']) {
                    result.projectType = 'Laravel Application';
                    result.frameworks.push('Laravel');
                }
            } catch (err) { }
        }

        // Check for C/C++ projects
        if (fs.existsSync(path.join(projectRoot, 'CMakeLists.txt'))) {
            result.projectType = 'CMake (C/C++) Project';
            result.languages.push('C/C++');
            result.buildTools.push('CMake');
        }

        // Default fallback
        if (result.languages.length === 0) {
            result.languages.push('Unknown');
        }

        return result;
    }

    /**
     * Save context to file
     * @param {string} projectRoot - Project root path  
     * @param {string} content - Context markdown content
     */
    saveContext(projectRoot, content) {
        const peakDir = path.join(projectRoot, '.peak');
        const contextPath = path.join(peakDir, 'project-context.md');

        try {
            // Ensure .peak directory exists
            if (!fs.existsSync(peakDir)) {
                fs.mkdirSync(peakDir, { recursive: true });
            }

            fs.writeFileSync(contextPath, content, 'utf8');
            console.log('[ProjectContext] Saved context to', contextPath);

            // Invalidate cache
            this.contextCache.delete(projectRoot);
        } catch (err) {
            console.error('[ProjectContext] Error saving context:', err);
        }
    }

    /**
     * Invalidate cache for a project
     */
    invalidate(projectRoot) {
        this.contextCache.delete(projectRoot);
        ProjectStructure.invalidateCache(projectRoot);
    }

    /**
     * Check if context file exists
     */
    exists(projectRoot) {
        const contextPath = path.join(projectRoot, '.peak', 'project-context.md');
        return fs.existsSync(contextPath);
    }
}

module.exports = new ProjectContextManager();
