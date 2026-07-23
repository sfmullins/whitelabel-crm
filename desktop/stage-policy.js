const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function packageNameFromLockPath(lockPath, entry) {
  if (entry && typeof entry.name === 'string') return entry.name;
  const marker = 'node_modules/';
  const index = lockPath.lastIndexOf(marker);
  if (index >= 0) {
    const remainder = lockPath.slice(index + marker.length);
    const parts = remainder.split('/');
    return remainder.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
  }
  if (lockPath && !lockPath.includes('node_modules')) return path.posix.basename(lockPath);
  return null;
}

function collectAllowedPackageVersions(lock) {
  const allowed = new Set();
  for (const [lockPath, entry] of Object.entries(lock.packages || {})) {
    if (!entry || typeof entry !== 'object' || typeof entry.version !== 'string') continue;
    const name = packageNameFromLockPath(lockPath, entry);
    if (name) allowed.add(`${name}@${entry.version}`);
  }
  return allowed;
}

function findUnexpectedPackages(lock, tree) {
  const allowed = collectAllowedPackageVersions(lock);
  const unexpected = new Set();
  const walk = (dependencies) => {
    for (const [name, node] of Object.entries(dependencies || {})) {
      if (!node || typeof node !== 'object') continue;
      if (typeof node.version === 'string' && !allowed.has(`${name}@${node.version}`)) {
        unexpected.add(`${name}@${node.version}`);
      }
      walk(node.dependencies);
    }
  };
  walk(tree.dependencies);
  return [...unexpected].sort();
}

function verifyInstalledDependencyGraph(stageDirectory, rootLockPath) {
  const lock = JSON.parse(fs.readFileSync(rootLockPath, 'utf8'));
  const tree = JSON.parse(execFileSync('npm', ['ls', '--all', '--omit=dev', '--json'], {
    cwd: stageDirectory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  }));
  const unexpected = findUnexpectedPackages(lock, tree);
  if (unexpected.length) {
    throw new Error(
      `Staged runtime resolved versions outside the reviewed root lockfile:\n${unexpected.map((item) => `- ${item}`).join('\n')}`,
    );
  }
}

module.exports = {
  collectAllowedPackageVersions,
  findUnexpectedPackages,
  verifyInstalledDependencyGraph,
};
