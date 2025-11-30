/**
 * AgentLogger.js
 * Global logger for capturing agent execution logs in the Inspector
 */

class AgentLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 500;
        this.listeners = [];

        // Expose globally for easy access
        window.peakAgentLogger = this;

        // Load persisted logs
        this.loadLogs();
    }

    loadLogs() {
        try {
            const stored = localStorage.getItem('peak-agent-logs');
            if (stored) {
                this.logs = JSON.parse(stored);
            }
        } catch (e) {
            console.error('Failed to load agent logs:', e);
            this.logs = [];
        }
    }

    saveLogs() {
        try {
            // Persist only the last 200 logs to avoid quota issues
            const logsToSave = this.logs.slice(-200);
            localStorage.setItem('peak-agent-logs', JSON.stringify(logsToSave));
        } catch (e) {
            console.error('Failed to save agent logs:', e);
        }
    }

    log(type, message, data = {}) {
        const logEntry = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            time: new Date().toLocaleTimeString(),
            type, // 'agent', 'tool', 'error', 'system'
            message,
            data
        };

        this.logs.push(logEntry);

        // Trim if too many logs
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }

        this.saveLogs();

        // Notify listeners
        this.emit('log', logEntry);

        // Also log to console for debugging
        const prefix = `[Agent Logger - ${type.toUpperCase()}]`;
        if (type === 'error') {
            console.error(prefix, message, data);
        } else {
            console.log(prefix, message, data);
        }
    }

    agent(message, data) {
        this.log('agent', message, data);
    }

    tool(message, data) {
        this.log('tool', message, data);
    }

    error(message, data) {
        this.log('error', message, data);
    }

    system(message, data) {
        this.log('system', message, data);
    }

    clear() {
        this.logs = [];
        localStorage.removeItem('peak-agent-logs');
        this.emit('clear');
    }

    getLogs(filter = 'all') {
        if (filter === 'all') {
            return this.logs;
        }
        return this.logs.filter(log => log.type === filter);
    }

    on(event, callback) {
        this.listeners.push({ event, callback });
    }

    off(event, callback) {
        this.listeners = this.listeners.filter(
            l => !(l.event === event && l.callback === callback)
        );
    }

    emit(event, data) {
        this.listeners
            .filter(l => l.event === event)
            .forEach(l => l.callback(data));
    }
}

// Singleton
const instance = new AgentLogger();
module.exports = instance;
