import fs from 'node:fs';

const filePath = 'scratch/wi4-audit-loader.mjs';
const source = fs.readFileSync(filePath, 'utf8');
const strictBlock = `  if (!source.includes(search)) {\n    throw new Error(\`Required WI4 audit target missing in \${filePath}: \${search.slice(0, 160)}\`);\n  }`;
const idempotentBlock = `  if (!source.includes(search)) return;`;
if (source.includes(strictBlock)) {
  fs.writeFileSync(filePath, source.replaceAll(strictBlock, idempotentBlock));
}
console.log('Prepared idempotent WI4 audit loader.');
