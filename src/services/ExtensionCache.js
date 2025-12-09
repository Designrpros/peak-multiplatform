// src/services/ExtensionCache.js
// Extension Cache Management - Caches downloaded .vsix files and metadata

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

/**
 * ExtensionCache manages local caching of:
 * - Downloaded .vsix files (to avoid re-downloading)
 * - Extension metadata from Open VSX (to reduce API calls)
 */
class ExtensionCache {
    constructor() {
        this.cacheDir = path.join(os.homedir(), '.peak', 'extension-cache');
        this.vsixCacheDir = path.join(this.cacheDir, 'vsix');
        this.metadataCacheFile = path.join(this.cacheDir, 'metadata.json');
        this.metadataCache = {};

        this.ensureCacheDirectories();
        this.loadMetadataCache();
    }

    /**
     * Ensure cache directories exist
     */
    ensureCacheDirectories() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
            console.log('[ExtensionCache] Created cache directory:', this.cacheDir);
        }

        if (!fs.existsSync(this.vsixCacheDir)) {
            fs.mkdirSync(this.vsixCacheDir, { recursive: true });
            console.log('[ExtensionCache] Created vsix cache directory:', this.vsixCacheDir);
        }
    }

    /**
     * Load metadata cache from disk
     */
    loadMetadataCache() {
        try {
            if (fs.existsSync(this.metadataCacheFile)) {
                const data = fs.readFileSync(this.metadataCacheFile, 'utf8');
                this.metadataCache = JSON.parse(data);
                console.log('[ExtensionCache] Loaded metadata cache with', Object.keys(this.metadataCache).length, 'entries');
            }
        } catch (err) {
            console.error('[ExtensionCache] Failed to load metadata cache:', err);
            this.metadataCache = {};
        }
    }

    /**
     * Save metadata cache to disk
     */
    saveMetadataCache() {
        try {
            fs.writeFileSync(this.metadataCacheFile, JSON.stringify(this.metadataCache, null, 2));
        } catch (err) {
            console.error('[ExtensionCache] Failed to save metadata cache:', err);
        }
    }

    /**
     * Generate cache key for an extension
     * @param {string} extensionId - e.g., "PKief.material-icon-theme"
     * @param {string} version - e.g., "5.12.0" or "latest"
     */
    getCacheKey(extensionId, version = 'latest') {
        return `${extensionId}@${version}`;
    }

    /**
     * Get cached .vsix file path
     * @param {string} extensionId
     * @param {string} version
     * @returns {string|null} Path to cached .vsix file or null if not cached
     */
    getCachedVsixPath(extensionId, version = 'latest') {
        const cacheKey = this.getCacheKey(extensionId, version);
        const fileName = `${cacheKey}.vsix`;
        const filePath = path.join(this.vsixCacheDir, fileName);

        if (fs.existsSync(filePath)) {
            console.log('[ExtensionCache] Cache HIT for', cacheKey);
            return filePath;
        }

        console.log('[ExtensionCache] Cache MISS for', cacheKey);
        return null;
    }

    /**
     * Cache a .vsix file
     * @param {string} extensionId
     * @param {string} version
     * @param {Buffer} vsixBuffer - The .vsix file content
     * @returns {string} Path to cached file
     */
    cacheVsixFile(extensionId, version, vsixBuffer) {
        const cacheKey = this.getCacheKey(extensionId, version);
        const fileName = `${cacheKey}.vsix`;
        const filePath = path.join(this.vsixCacheDir, fileName);

        try {
            fs.writeFileSync(filePath, vsixBuffer);
            console.log('[ExtensionCache] Cached .vsix file:', cacheKey);
            return filePath;
        } catch (err) {
            console.error('[ExtensionCache] Failed to cache .vsix file:', err);
            return null;
        }
    }

    /**
     * Get cached extension metadata
     * @param {string} extensionId
     * @returns {Object|null} Cached metadata or null if expired/missing
     */
    getCachedMetadata(extensionId) {
        const cached = this.metadataCache[extensionId];

        if (!cached) {
            return null;
        }

        // Check if cache expired (1 hour TTL)
        const now = Date.now();
        const cacheAge = now - cached.timestamp;
        const ONE_HOUR = 60 * 60 * 1000;

        if (cacheAge > ONE_HOUR) {
            console.log('[ExtensionCache] Metadata cache expired for', extensionId);
            delete this.metadataCache[extensionId];
            this.saveMetadataCache();
            return null;
        }

        console.log('[ExtensionCache] Metadata cache HIT for', extensionId);
        return cached.data;
    }

    /**
     * Cache extension metadata
     * @param {string} extensionId
     * @param {Object} metadata - Extension metadata from Open VSX
     */
    cacheMetadata(extensionId, metadata) {
        this.metadataCache[extensionId] = {
            timestamp: Date.now(),
            data: metadata
        };

        this.saveMetadataCache();
        console.log('[ExtensionCache] Cached metadata for', extensionId);
    }

    /**
     * Clear expired cache entries
     */
    clearExpired() {
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;
        let cleared = 0;

        // Clear expired metadata
        for (const [extensionId, cached] of Object.entries(this.metadataCache)) {
            const cacheAge = now - cached.timestamp;
            if (cacheAge > ONE_HOUR) {
                delete this.metadataCache[extensionId];
                cleared++;
            }
        }

        if (cleared > 0) {
            this.saveMetadataCache();
            console.log('[ExtensionCache] Cleared', cleared, 'expired metadata entries');
        }
    }

    /**
     * Clear all cached data
     */
    clearAll() {
        // Clear .vsix files
        try {
            const files = fs.readdirSync(this.vsixCacheDir);
            for (const file of files) {
                const filePath = path.join(this.vsixCacheDir, file);
                fs.unlinkSync(filePath);
            }
            console.log('[ExtensionCache] Cleared', files.length, '.vsix files');
        } catch (err) {
            console.error('[ExtensionCache] Failed to clear .vsix cache:', err);
        }

        // Clear metadata
        this.metadataCache = {};
        this.saveMetadataCache();
        console.log('[ExtensionCache] Cleared all cache');
    }

    /**
     * Get cache statistics
     */
    getStats() {
        let vsixCount = 0;
        let vsixSize = 0;

        try {
            const files = fs.readdirSync(this.vsixCacheDir);
            vsixCount = files.length;

            for (const file of files) {
                const filePath = path.join(this.vsixCacheDir, file);
                const stats = fs.statSync(filePath);
                vsixSize += stats.size;
            }
        } catch (err) {
            console.error('[ExtensionCache] Failed to get cache stats:', err);
        }

        return {
            vsixCount,
            vsixSizeMB: (vsixSize / (1024 * 1024)).toFixed(2),
            metadataCount: Object.keys(this.metadataCache).length,
            cacheDir: this.cacheDir
        };
    }
}

module.exports = ExtensionCache;
