const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const action = process.argv[2] || 'package';
if (action !== 'package' && action !== 'make') {
  console.error(`Invalid action: ${action}. Use 'package' or 'make'.`);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const desktopDir = __dirname;
const stageDir = path.join(desktopDir, 'stage');

console.log(`Starting staging build for Electron packaging. Action: ${action}`);

// 1. Clean Staging and Output Directories
if (fs.existsSync(stageDir)) {
  console.log(`Cleaning old stage directory at ${stageDir}...`);
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

// 2. Build monorepo packages to ensure latest code is compiled
console.log('Building monorepo workspaces...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

// 3. NPM Pack the workspaces
console.log('Generating shared workspace tarball...');
execSync('npm pack', { cwd: path.join(rootDir, 'shared'), stdio: 'inherit' });
const sharedTarball = fs.readdirSync(path.join(rootDir, 'shared'))
  .find(f => f.startsWith('shared-') && f.endsWith('.tgz'));
if (!sharedTarball) throw new Error('Failed to find packed shared tarball');

console.log('Generating backend workspace tarball...');
execSync('npm pack', { cwd: path.join(rootDir, 'backend'), stdio: 'inherit' });
const backendTarball = fs.readdirSync(path.join(rootDir, 'backend'))
  .find(f => f.startsWith('backend-') && f.endsWith('.tgz'));
if (!backendTarball) throw new Error('Failed to find packed backend tarball');

// Move tarballs into stage directory
fs.renameSync(
  path.join(rootDir, 'shared', sharedTarball),
  path.join(stageDir, sharedTarball)
);
fs.renameSync(
  path.join(rootDir, 'backend', backendTarball),
  path.join(stageDir, backendTarball)
);

// 4. Copy Staging Source Files
console.log('Copying compiled desktop process files...');
fs.mkdirSync(path.join(stageDir, 'dist'), { recursive: true });
fs.cpSync(path.join(desktopDir, 'dist'), path.join(stageDir, 'dist'), { recursive: true });
fs.copyFileSync(path.join(desktopDir, 'forge.config.js'), path.join(stageDir, 'forge.config.js'));

// 5. Generate staging package.json
console.log('Generating staging package.json...');
const desktopPkg = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));

// Replace workspaces references with local tarballs
desktopPkg.dependencies = {
  ...desktopPkg.dependencies,
  "shared": `./${sharedTarball}`,
  "backend": `./${backendTarball}`
};

// Add required plugins to devDependencies
desktopPkg.devDependencies = {
  ...desktopPkg.devDependencies,
  "@electron-forge/plugin-auto-unpack-natives": "^7.3.0"
};

fs.writeFileSync(
  path.join(stageDir, 'package.json'),
  JSON.stringify(desktopPkg, null, 2),
  'utf8'
);

// 6. Copy frontend compiled assets and Drizzle migration resources
console.log('Copying frontend production assets...');
fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(stageDir, 'frontend'), { recursive: true });

console.log('Copying backend database migrations...');
fs.cpSync(path.join(rootDir, 'backend', 'drizzle'), path.join(stageDir, 'drizzle'), { recursive: true });

// 7. Install Staging Dependencies
console.log('Installing production staging dependencies...');
execSync('npm install --no-audit --no-fund', { cwd: stageDir, stdio: 'inherit' });

// 8. Run Electron Forge Packager/Maker
console.log(`Running Electron Forge ${action} inside staging directory...`);
execSync(`npx electron-forge ${action}`, { cwd: stageDir, stdio: 'inherit' });

// 9. Re-materialize outputs to desktop/out/
console.log('Copying packaged outputs to desktop/out/');
const desktopOutDir = path.join(desktopDir, 'out');
if (fs.existsSync(desktopOutDir)) {
  fs.rmSync(desktopOutDir, { recursive: true, force: true });
}
fs.cpSync(path.join(stageDir, 'out'), desktopOutDir, { recursive: true });

console.log('Staging build and packaging completed successfully!');
