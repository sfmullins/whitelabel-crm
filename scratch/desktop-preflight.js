const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredPaths = [
  'shared/dist/types.js',
  'shared/dist/cjs/types.js',
  'backend/dist/embed.js',
  'frontend/dist/index.html',
  'desktop/dist/main.js',
  'desktop/dist/preload.js',
  'backend/drizzle/meta/_journal.json',
];

function fail(message) {
  throw new Error(message);
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

for (const relativePath of requiredPaths) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    fail(`Missing required packaging artifact or source asset: ${relativePath}`);
  }
}

const migrationsDir = path.join(root, 'backend/drizzle');
const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql'));
if (migrationFiles.length === 0) {
  fail('Drizzle migration directory must contain at least one SQL migration');
}

const migrationMetaDir = path.join(migrationsDir, 'meta');
const migrationMetaFiles = fs.readdirSync(migrationMetaDir).filter((file) => file.endsWith('.json'));
if (!migrationMetaFiles.includes('_journal.json') || migrationMetaFiles.length < 2) {
  fail('Drizzle migration metadata must include _journal.json and at least one snapshot JSON file');
}

const frontendAssets = path.join(root, 'frontend/dist/assets');
if (!fs.existsSync(frontendAssets) || fs.readdirSync(frontendAssets).length === 0) {
  fail('Frontend production assets are missing from frontend/dist/assets');
}

const rootPkg = readJson('package.json');
for (const script of ['build', 'test', 'db:smoke', 'desktop:preflight', 'desktop:smoke']) {
  if (!rootPkg.scripts || !rootPkg.scripts[script]) {
    fail(`Missing root package script: ${script}`);
  }
}

const desktopPkg = readJson('desktop/package.json');
if (desktopPkg.main !== 'dist/main.js') {
  fail('desktop/package.json main must point at dist/main.js');
}
for (const script of ['build', 'package', 'make']) {
  if (!desktopPkg.scripts || !desktopPkg.scripts[script]) {
    fail(`Missing desktop package script: ${script}`);
  }
}
if (!desktopPkg.dependencies || desktopPkg.dependencies.backend !== '*') {
  fail('desktop/package.json must depend on the backend workspace');
}

const stageJs = fs.readFileSync(path.join(root, 'desktop/stage.js'), 'utf8');
for (const text of [
  "path.join(rootDir, 'shared')",
  "path.join(rootDir, 'backend')",
  "path.join(rootDir, 'frontend', 'dist')",
  "path.join(rootDir, 'backend', 'drizzle')",
]) {
  if (!stageJs.includes(text)) {
    fail(`desktop/stage.js no longer references required staging asset: ${text}`);
  }
}

const forgeConfig = require(path.join(root, 'desktop/forge.config.js'));
const extraResource = forgeConfig.packagerConfig && forgeConfig.packagerConfig.extraResource;
if (!Array.isArray(extraResource)) {
  fail('desktop/forge.config.js must configure packagerConfig.extraResource');
}
for (const asset of ['drizzle', 'frontend']) {
  if (!extraResource.some((entry) => String(entry).endsWith(asset))) {
    fail(`desktop forge extraResource must include ${asset}`);
  }
}

console.log('Desktop packaging preflight passed without launching Electron.');
