const { execSync } = require('child_process');

/**
 * Recursively kills a process and its children.
 * @param {number} pid - The process ID to kill.
 */
function killProcessTree(pid) {
    try {
        // 1. Try to kill the process group first (negative PID)
        // This is more effective for shells that spawn children
        try {
            process.kill(-pid, 'SIGKILL');
            return; // If successful, the whole group is gone
        } catch (e) {
            // Process group killing might fail if not a group leader or on Windows
        }

        // 2. Fallback: Manually find and kill children
        // pgrep -P <pid> returns a list of child PIDs
        try {
            const childPids = execSync(`pgrep -P ${pid}`).toString().trim().split('\n');
            childPids.forEach(childPid => {
                if (childPid && childPid.trim() !== '') {
                    killProcessTree(parseInt(childPid.trim()));
                }
            });
        } catch (e) {
            // pgrep might fail if no children found
        }

        // 3. Kill the process itself
        process.kill(pid, 'SIGKILL');
    } catch (e) {
        // Ignore errors (process might already be dead)
        // console.error(`Failed to kill process ${pid}:`, e.message);
    }
}

module.exports = { killProcessTree };
