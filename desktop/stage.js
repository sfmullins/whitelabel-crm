const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, execSync } = require('node:child_process');
const { verifyInstalledDependencyGraph } = require('./stage-policy');

const action = process.argv[2] || 'package';
if (action !== 'package' && action !== 'make') {
  console.error(`Invalid action: ${action}. Use 'package' or 'make'.`);
  process.exit(1);
}

const rootDir = path.resolve(__dirname, '..');
const desktopDir = __dirname;
const stageDir = path.join(desktopDir, 'stage');

function packWorkspace(workspaceDirectory, expectedPackageName) {
  const output = execFileSync('npm', ['pack', '--json'], {
    cwd: workspaceDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  let result;
  try {
    result = JSON.parse(output);
  } catch (error) {
    throw new Error(`npm pack returned invalid JSON for ${expectedPackageName}: ${error.message}`);
  }

  if (!Array.isArray(result) || result.length !== 1 || typeof result[0].filename !== 'string') {
    throw new Error(`npm pack did not return exactly one tarball for ${expectedPackageName}`);
  }

  const filename = path.basename(result[0].filename);
  if (!filename.endsWith('.tgz') || !filename.startsWith(`${expectedPackageName}-`)) {
    throw new Error(`Unexpected npm pack filename for ${expectedPackageName}: ${filename}`);
  }

  const absolutePath = path.join(workspaceDirectory, filename);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`npm pack reported a missing tarball for ${expectedPackageName}: ${filename}`);
  }

  return filename;
}

console.log(`Starting staging build for Electron packaging. Action: ${action}`);

if (fs.existsSync(stageDir)) {
  console.log(`Cleaning old stage directory at ${stageDir}...`);
  fs.rmSync(stageDir, { recursive: true, force: true });
}
fs.mkdirSync(stageDir, { recursive: true });

console.log('Building monorepo workspaces...');
execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

console.log('Generating shared workspace tarball...');
const sharedTarball = packWorkspace(path.join(rootDir, 'shared'), 'shared');

console.log('Generating backend workspace tarball...');
const backendTarball = packWorkspace(path.join(rootDir, 'backend'), 'backend');

fs.renameSync(path.join(rootDir, 'shared', sharedTarball), path.join(stageDir, sharedTarball));
fs.renameSync(path.join(rootDir, 'backend', backendTarball), path.join(stageDir, backendTarball));

console.log('Copying compiled desktop process files...');
fs.mkdirSync(path.join(stageDir, 'dist'), { recursive: true });
fs.cpSync(path.join(desktopDir, 'dist'), path.join(stageDir, 'dist'), { recursive: true });
fs.copyFileSync(path.join(desktopDir, 'forge.config.js'), path.join(stageDir, 'forge.config.js'));

console.log('Generating staging package.json...');
const desktopPackage = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
const stagingPackage = {
  name: desktopPackage.name,
  version: desktopPackage.version,
  private: true,
  description: desktopPackage.description,
  author: desktopPackage.author,
  main: desktopPackage.main,
  dependencies: {
    backend: `file:./${backendTarball}`,
    shared: `file:./${sharedTarball}`,
  },
  devDependencies: desktopPackage.devDependencies,
};
fs.writeFileSync(path.join(stageDir, 'package.json'), `${JSON.stringify(stagingPackage, null, 2)}\n`, 'utf8');

console.log('Copying frontend production assets...');
fs.cpSync(path.join(rootDir, 'frontend', 'dist'), path.join(stageDir, 'frontend'), { recursive: true });

console.log('Copying backend database migrations...');
fs.cpSync(path.join(rootDir, 'backend', 'drizzle'), path.join(stageDir, 'drizzle'), { recursive: true });

console.log('Installing production staging dependencies...');
execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--package-lock=false'], {
  cwd: stageDir,
  stdio: 'inherit',
});
console.log('Verifying staged runtime dependency versions against the reviewed root lockfile...');
verifyInstalledDependencyGraph(stageDir, path.join(rootDir, 'package-lock.json'));

const rootElectron = path.join(rootDir, 'node_modules', 'electron');
const stagedElectron = path.join(stageDir, 'node_modules', 'electron');
if (!fs.existsSync(rootElectron)) throw new Error('Reviewed root Electron installation is unavailable');
if (fs.existsSync(stagedElectron)) fs.rmSync(stagedElectron, { recursive: true, force: true });
fs.symlinkSync(rootElectron, stagedElectron, process.platform === 'win32' ? 'junction' : 'dir');

const forgeExecutable = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-forge.cmd' : 'electron-forge');
if (!fs.existsSync(forgeExecutable)) throw new Error('Reviewed Electron Forge executable is unavailable');
console.log(`Running Electron Forge ${action} inside staging directory...`);
execFileSync(forgeExecutable, [action], { cwd: stageDir, stdio: 'inherit' });

console.log('Copying packaged outputs to desktop/out/');
const desktopOutDir = path.join(desktopDir, 'out');
if (fs.existsSync(desktopOutDir)) fs.rmSync(desktopOutDir, { recursive: true, force: true });
fs.cpSync(path.join(stageDir, 'out'), desktopOutDir, { recursive: true });

console.log('Staging build and packaging completed successfully!');
