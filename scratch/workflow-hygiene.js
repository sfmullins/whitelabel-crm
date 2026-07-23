const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workflowDirectory = path.join(root, '.github', 'workflows');
const obsolete = new Set([
  'wi4-bootstrap.yml',
  'wi5-validation.yml',
  'wi6-validation.yml',
  'wi7-validation.yml',
]);
const failures = [];

for (const filename of fs.readdirSync(workflowDirectory).filter((value) => /\.ya?ml$/i.test(value)).sort()) {
  if (obsolete.has(filename)) failures.push(`${filename}: obsolete work-item workflow remains after merge`);
  const content = fs.readFileSync(path.join(workflowDirectory, filename), 'utf8');
  if (/^\s*pull_request_target\s*:/m.test(content)) {
    failures.push(`${filename}: pull_request_target is not permitted`);
  }
  for (const match of content.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    const at = reference.lastIndexOf('@');
    const version = at >= 0 ? reference.slice(at + 1) : '';
    if (!/^[0-9a-f]{40}$/i.test(version)) {
      failures.push(`${filename}: action is not pinned to a full commit SHA: ${reference}`);
    }
  }
}

if (failures.length) {
  console.error(`Workflow hygiene failed:\n${failures.map((failure) => `- ${failure}`).join('\n')}`);
  process.exit(1);
}
console.log('Workflow hygiene passed.');
