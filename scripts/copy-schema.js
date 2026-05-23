const fs = require('node:fs');
const path = require('node:path');

const source = path.join(__dirname, '..', 'src', 'store', 'schema.sql');
const targetDir = path.join(__dirname, '..', 'dist', 'store');
const target = path.join(targetDir, 'schema.sql');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
