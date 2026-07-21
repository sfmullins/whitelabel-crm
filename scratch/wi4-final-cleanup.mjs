import fs from 'node:fs';

const temporaryPaths = [
  '.github/workflows/wi4-audit-apply.yml',
  'scratch/wi4-audit-loader.mjs',
  'scratch/wi4-audit.parts',
  'scratch/wi4-audit-hotfix.mjs',
  'scratch/wi4-audit-idempotency.mjs',
  'scratch/wi4-audit-validation.txt',
  'scratch/wi4-bootstrap-loader.mjs',
  'scratch/wi4-bootstrap.parts',
  'scratch/wi4-corrections.mjs',
  'scratch/wi4-postgenerate.mjs',
  'scratch/wi4-validation.txt',
  'scratch/wi4-final-cleanup.mjs',
];

for (const target of temporaryPaths) {
  fs.rmSync(target, { recursive: true, force: true });
}
console.log('Removed temporary WI4 implementation and audit scaffolding.');
