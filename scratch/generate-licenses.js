const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const rootDir = path.resolve(__dirname, '../');
const workspaces = [
  { name: 'shared', packagePath: path.join(rootDir, 'shared/package.json') },
  { name: 'backend', packagePath: path.join(rootDir, 'backend/package.json') },
  { name: 'frontend', packagePath: path.join(rootDir, 'frontend/package.json') },
  { name: 'desktop', packagePath: path.join(rootDir, 'desktop/package.json') }
];
const internalPackages = new Set(workspaces.map(workspace => workspace.name));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getDirectDependencies(pkgPath) {
  const content = readJson(pkgPath);
  return [
    ...Object.keys(content.dependencies || {}),
    ...Object.keys(content.devDependencies || {})
  ];
}

function findPackageRoot(resolvedPath) {
  let current = fs.statSync(resolvedPath).isDirectory() ? resolvedPath : path.dirname(resolvedPath);
  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'package.json');
    if (fs.existsSync(pkgPath)) {
      return current;
    }
    current = path.dirname(current);
  }
  throw new Error(`Unable to find package root for ${resolvedPath}`);
}

function resolveDependencyFromWorkspace(dep, workspacePackagePath) {
  const workspaceRequire = createRequire(workspacePackagePath);
  try {
    return findPackageRoot(workspaceRequire.resolve(`${dep}/package.json`));
  } catch (pkgJsonError) {
    try {
      return findPackageRoot(workspaceRequire.resolve(dep));
    } catch (mainError) {
      throw new Error(`Unable to resolve ${dep} from ${workspacePackagePath}: ${mainError.message}`);
    }
  }
}

function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim();
}

function formatLicense(license) {
  return typeof license === 'string' ? license : JSON.stringify(license);
}

function compareVersions(a, b) {
  const aParts = String(a).split(/[^0-9A-Za-z]+/);
  const bParts = String(b).split(/[^0-9A-Za-z]+/);
  const length = Math.max(aParts.length, bParts.length);
  for (let index = 0; index < length; index += 1) {
    const aPart = aParts[index] || '';
    const bPart = bParts[index] || '';
    const aNum = /^\d+$/.test(aPart) ? Number(aPart) : null;
    const bNum = /^\d+$/.test(bPart) ? Number(bPart) : null;
    if (aNum !== null && bNum !== null && aNum !== bNum) {
      return aNum - bNum;
    }
    const comparison = aPart.localeCompare(bPart);
    if (comparison !== 0) {
      return comparison;
    }
  }
  return 0;
}

const entries = new Map();
for (const workspace of workspaces) {
  if (!fs.existsSync(workspace.packagePath)) {
    continue;
  }

  for (const dep of getDirectDependencies(workspace.packagePath)) {
    if (internalPackages.has(dep)) {
      continue;
    }

    const depDir = resolveDependencyFromWorkspace(dep, workspace.packagePath);
    const pkgInfo = readJson(path.join(depDir, 'package.json'));
    const name = pkgInfo.name || dep;
    const version = pkgInfo.version || '0.0.0';
    const key = `${name}@${version}`;

    if (!entries.has(key)) {
      const files = fs.readdirSync(depDir).sort((a, b) => a.localeCompare(b));
      const licenseFile = files.find(file => {
        const upper = file.toUpperCase();
        return upper.startsWith('LICENSE') || upper.startsWith('LICENCE') || upper.startsWith('COPYING');
      });

      entries.set(key, {
        name,
        version,
        license: pkgInfo.license || pkgInfo.licenses || 'UNKNOWN',
        author: pkgInfo.author ? (typeof pkgInfo.author === 'string' ? pkgInfo.author : pkgInfo.author.name) : 'Various Authors',
        licenseText: licenseFile
          ? normalizeText(fs.readFileSync(path.join(depDir, licenseFile), 'utf8'))
          : 'Refer to package documentation or public registry for license text.'
      });
    }
  }
}

const sortedEntries = Array.from(entries.values()).sort((a, b) => {
  const nameComparison = a.name.localeCompare(b.name);
  return nameComparison || compareVersions(a.version, b.version);
});

const lines = [
  '========================================================================',
  'THIRD-PARTY SOFTWARE LICENSE NOTICES AND DISCLAIMERS',
  '========================================================================',
  '',
  'This software makes use of direct third-party open-source workspace dependencies.',
  'Below is a compilation of direct dependency licenses and disclaimers; it is not a complete transitive legal audit.',
  ''
];

for (const entry of sortedEntries) {
  lines.push('------------------------------------------------------------------------');
  lines.push(`Package: ${entry.name} (v${entry.version})`);
  lines.push(`License: ${formatLicense(entry.license)}`);
  lines.push(`Author: ${entry.author}`);
  lines.push('------------------------------------------------------------------------');
  lines.push(entry.licenseText);
  lines.push('');
}

const outputText = `${lines.join('\n').replace(/[ \t]+$/gm, '')}\n`;
fs.writeFileSync(path.join(rootDir, 'THIRD_PARTY_LICENSES.txt'), outputText, 'utf8');
console.log('Successfully generated THIRD_PARTY_LICENSES.txt!');
