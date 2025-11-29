
const path = require('path');

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
tryRequire(path.join(root, 'components/Dashboard/index.js'));
tryRequire(path.join(root, 'components/Workspaces/index.js'));
