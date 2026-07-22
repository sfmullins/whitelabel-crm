const fs = require('node:fs');
const path = require('node:path');

const cjsDirectory = path.resolve(__dirname, '..', 'dist', 'cjs');
fs.mkdirSync(cjsDirectory, { recursive: true });
fs.writeFileSync(
  path.join(cjsDirectory, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
  'utf8',
);
