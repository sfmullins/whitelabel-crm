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

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeText(text) {
  return text.replace(/\r\n?/g, '\n').split('\n').map(line => line.trimEnd()).join('\n').trim();
}

function formatLicense(license) {
  return typeof license === 'string' ? license : JSON.stringify(license);
}

function getLicensePriority(file) {
  const upper = file.toUpperCase();
  const priorities = new Map([
    ['LICENSE', 1],
    ['LICENSE.TXT', 2],
    ['LICENSE.MD', 3],
    ['LICENCE', 4],
    ['LICENCE.TXT', 5],
    ['LICENCE.MD', 6]
  ]);

  if (priorities.has(upper)) {
    return priorities.get(upper);
  }
  if (upper.startsWith('LICENSE') && upper !== 'LICENSES.JSON') {
    return 7;
  }
  if (upper.startsWith('LICENCE')) {
    return 8;
  }
  if (upper.startsWith('COPYING')) {
    return 9;
  }
  return Number.POSITIVE_INFINITY;
}

function findLicenseFile(files) {
  return files
    .map(file => ({ file, priority: getLicensePriority(file) }))
    .filter(candidate => Number.isFinite(candidate.priority))
    .sort((a, b) => (a.priority - b.priority) || compareText(a.file, b.file))[0]?.file;
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
    const comparison = compareText(aPart, bPart);
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
      const files = fs.readdirSync(depDir, { withFileTypes: true })
        .filter(dirent => dirent.isFile())
        .map(dirent => dirent.name)
        .sort(compareText);
      const licenseFile = findLicenseFile(files);

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
  const nameComparison = compareText(a.name, b.name);
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

while (lines.length > 0 && lines[lines.length - 1] === '') {
  lines.pop();
}

const outputText = `${lines.join('\n').replace(/[ \t]+$/gm, '')}\n`;
fs.writeFileSync(path.join(rootDir, 'THIRD_PARTY_LICENSES.txt'), outputText, 'utf8');
console.log('Successfully generated THIRD_PARTY_LICENSES.txt!');
