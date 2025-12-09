// src/services/ExtensionLoader.js
// Load and install VSCode extensions from .vsix files

const fs = require('fs');
const path = require('path');
const unzipper = require('unzipper');
const { promisify } = require('util');
const mkdir = promisify(fs.mkdir);
const access = promisify(fs.access);
const ExtensionCache = require('./ExtensionCache');

/**
 * Extension Loader
 * Handles .vsix file extraction and installation
 */
class ExtensionLoader {
    constructor() {
        this.extensionsDir = path.join(require('os').homedir(), '.peak', 'extensions');
        this.cache = new ExtensionCache();
        this.ensureExtensionsDirectory();
    }

    async ensureExtensionsDirectory() {
        try {
            await access(this.extensionsDir);
        } catch (e) {
            await mkdir(this.extensionsDir, { recursive: true });
            console.log('[ExtensionLoader] Created extensions directory:', this.extensionsDir);
        }
    }

    /**
     * Install extension from .vsix file
     * @param {string} vsixPath - Path to .vsix file
     * @returns {Promise<{id, path, manifest}>}
     */
    async installFromVSIX(vsixPath) {
        console.log('[ExtensionLoader] Installing extension from:', vsixPath);

        try {
            // VSIX files are ZIP archives
            // Extract to temporary directory first
            const tempDir = path.join(require('os').tmpdir(), `peak-ext-${Date.now()}`);
            await mkdir(tempDir, { recursive: true });

            // Extract .vsix
            await fs.createReadStream(vsixPath)
                .pipe(unzipper.Extract({ path: tempDir }))
                .promise();

            // Read extension/package.json from the archive
            const manifestPath = path.join(tempDir, 'extension', 'package.json');

            if (!fs.existsSync(manifestPath)) {
                throw new Error('Invalid .vsix file: no extension/package.json found');
            }

            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            if (!manifest.name || !manifest.publisher) {
                throw new Error('Invalid manifest: missing name or publisher');
            }

            const extensionId = `${manifest.publisher}.${manifest.name}`;
            const targetDir = path.join(this.extensionsDir, extensionId);

            // Remove existing installation if present
            if (fs.existsSync(targetDir)) {
                console.log('[ExtensionLoader] Removing existing installation');
                fs.rmSync(targetDir, { recursive: true, force: true });
            }

            // Move extension directory to extensions folder
            const sourceExtensionDir = path.join(tempDir, 'extension');
            await this.copyDirectory(sourceExtensionDir, targetDir);

            // Clean up temp directory
            fs.rmSync(tempDir, { recursive: true, force: true });

            console.log('[ExtensionLoader] Installed extension:', extensionId);

            return {
                id: extensionId,
                path: targetDir,
                manifest
            };
        } catch (err) {
            console.error('[ExtensionLoader] Installation failed:', err);
            throw err;
        }
    }

    /**
     * Uninstall extension
     * @param {string} extensionId
     */
    async uninstallExtension(extensionId) {
        let extensionPath = path.join(this.extensionsDir, extensionId);

        if (!fs.existsSync(extensionPath)) {
            // Check bundled extensions directory
            const bundledExtensionsDir = path.join(require('os').homedir(), '.peak', 'bundled-extensions');
            extensionPath = path.join(bundledExtensionsDir, extensionId);

            if (!fs.existsSync(extensionPath)) {
                throw new Error(`Extension ${extensionId} not found`);
            }
        }

        console.log('[ExtensionLoader] Uninstalling:', extensionId);
        fs.rmSync(extensionPath, { recursive: true, force: true });
    }

    /**
     * Download extension from URL (e.g., Open VSX)
     * @param {string} downloadUrl - URL to .vsix file
     * @param {string} extensionId - Optional extension ID for caching (e.g., "PKief.material-icon-theme")
     * @param {string} version - Optional version for caching (e.g., "5.12.0" or "latest")
     * @returns {Promise<string>} Path to downloaded .vsix file
     */
    async downloadExtension(downloadUrl, extensionId = null, version = 'latest') {
        // Check cache first if we have extension ID
        if (extensionId) {
            const cachedPath = this.cache.getCachedVsixPath(extensionId, version);
            if (cachedPath) {
                console.log('[ExtensionLoader] Using cached .vsix file');
                return cachedPath;
            }
        }

        const https = require('https');
        const http = require('http');

        const tempVsixPath = path.join(
            require('os').tmpdir(),
            `peak-download-${Date.now()}.vsix`
        );

        console.log('[ExtensionLoader] Downloading from:', downloadUrl);

        return new Promise((resolve, reject) => {
            const client = downloadUrl.startsWith('https') ? https : http;

            client.get(downloadUrl, (response) => {
                if (response.statusCode === 302 || response.statusCode === 301) {
                    // Handle redirect
                    return this.downloadExtension(response.headers.location, extensionId, version)
                        .then(resolve)
                        .catch(reject);
                }

                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed with status ${response.statusCode}`));
                    return;
                }

                const chunks = [];

                response.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                response.on('end', () => {
                    const buffer = Buffer.concat(chunks);

                    // Write to temp file
                    fs.writeFileSync(tempVsixPath, buffer);
                    console.log('[ExtensionLoader] Downloaded to:', tempVsixPath);

                    // Cache the file if we have extension ID
                    if (extensionId) {
                        this.cache.cacheVsixFile(extensionId, version, buffer);
                    }

                    resolve(tempVsixPath);
                });

                response.on('error', reject);
            }).on('error', reject);
        });
    }

    /**
     * Install extension from URL
     * @param {string} downloadUrl
     * @param {string} extensionId - Optional extension ID for caching
     * @param {string} version - Optional version for caching
     */
    async installFromURL(downloadUrl, extensionId = null, version = 'latest') {
        const vsixPath = await this.downloadExtension(downloadUrl, extensionId, version);

        try {
            const result = await this.installFromVSIX(vsixPath);

            // Only clean up if not from cache
            if (!vsixPath.includes('extension-cache')) {
                fs.unlinkSync(vsixPath);
            }

            return result;
        } catch (err) {
            // Clean up on error (but not if from cache)
            if (fs.existsSync(vsixPath) && !vsixPath.includes('extension-cache')) {
                fs.unlinkSync(vsixPath);
            }
            throw err;
        }
    }

    /**
     * Copy directory recursively
     */
    async copyDirectory(source, dest) {
        await mkdir(dest, { recursive: true });

        const entries = fs.readdirSync(source, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(source, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    /**
     * List all installed extensions
     */
    async listInstalled() {
        const extensions = [];

        if (!fs.existsSync(this.extensionsDir)) {
            return extensions;
        }

        const dirs = fs.readdirSync(this.extensionsDir);

        for (const dir of dirs) {
            const extensionPath = path.join(this.extensionsDir, dir);
            const manifestPath = path.join(extensionPath, 'package.json');

            if (fs.existsSync(manifestPath)) {
                try {
                    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                    extensions.push({
                        id: dir,
                        path: extensionPath,
                        manifest
                    });
                } catch (e) {
                    console.error('[ExtensionLoader] Failed to read manifest for', dir, e);
                }
            }
        }

        return extensions;
    }
}

module.exports = ExtensionLoader;
