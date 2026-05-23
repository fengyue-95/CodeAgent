const fs = require('node:fs');
const path = require('node:path');

const target = path.join(__dirname, '..', 'dist', 'bin', 'code-agent.js');

if (fs.existsSync(target)) {
  fs.chmodSync(target, 0o755);
}
