
const path = require('path');
const fs = require('fs');

function tryRequire(filePath) {
    try {
        require(filePath);
        console.log(`✅ Successfully loaded: ${filePath}`);
    } catch (e) {
        console.error(`❌ Failed to load: ${filePath}`);
        console.error(e);
    }
}

const root = path.join(process.cwd(), 'src');

console.log('--- Testing Critical Components ---');
tryRequire(path.join(root, 'utils/enums.js'));
tryRequire(path.join(root, 'components/LandingPage/index.js'));
tryRequire(path.join(root, 'components/SettingsView/index.js'));
tryRequire(path.join(root, 'components/Dashboard/index.js'));
tryRequire(path.join(root, 'components/Workspaces/index.js'));
tryRequire(path.join(root, 'tab-manager.js'));
