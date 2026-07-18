const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../');
const workspacePackagePaths = [
  path.join(rootDir, 'shared/package.json'),
  path.join(rootDir, 'backend/package.json'),
  path.join(rootDir, 'frontend/package.json'),
  path.join(rootDir, 'desktop/package.json')
];
const internalPackages = new Set(['shared', 'backend', 'frontend', 'desktop']);

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

function findDependencyDir(dep) {
  const candidates = [
    path.join(rootDir, 'node_modules', dep),
    path.join(rootDir, 'shared', 'node_modules', dep),
    path.join(rootDir, 'backend', 'node_modules', dep),
    path.join(rootDir, 'frontend', 'node_modules', dep),
    path.join(rootDir, 'desktop', 'node_modules', dep)
  ];
  return candidates.find(candidate => fs.existsSync(path.join(candidate, 'package.json')));
}

const dependencies = new Set();
for (const pkg of workspacePackagePaths) {
  if (fs.existsSync(pkg)) {
    for (const dep of getDirectDependencies(pkg)) {
      if (!internalPackages.has(dep)) {
        dependencies.add(dep);
      }
    }
  }
}

let outputText = '========================================================================\n';
outputText += 'THIRD-PARTY SOFTWARE LICENSE NOTICES AND DISCLAIMERS\n';
outputText += '========================================================================\n\n';
outputText += 'This software makes use of direct third-party open-source workspace dependencies.\n';
outputText += 'Below is a compilation of direct dependency licenses and disclaimers; it is not a complete transitive legal audit.\n\n';

for (const dep of Array.from(dependencies).sort()) {
  const depDir = findDependencyDir(dep);
  if (!depDir) {
    throw new Error(`Unable to locate installed dependency package.json for ${dep}`);
  }

  const pkgInfo = readJson(path.join(depDir, 'package.json'));
  const license = pkgInfo.license || pkgInfo.licenses || 'UNKNOWN';
  const author = pkgInfo.author ? (typeof pkgInfo.author === 'string' ? pkgInfo.author : pkgInfo.author.name) : 'Various Authors';
  const version = pkgInfo.version || '0.0.0';

  outputText += '------------------------------------------------------------------------\n';
  outputText += `Package: ${dep} (v${version})\n`;
  outputText += `License: ${typeof license === 'string' ? license : JSON.stringify(license)}\n`;
  outputText += `Author: ${author}\n`;
  outputText += '------------------------------------------------------------------------\n';

  const files = fs.readdirSync(depDir);
  const licenseFile = files.find(f => {
    const upper = f.toUpperCase();
    return upper.startsWith('LICENSE') || upper.startsWith('LICENCE') || upper.startsWith('COPYING');
  });

  if (licenseFile) {
    const licContent = fs.readFileSync(path.join(depDir, licenseFile), 'utf8');
    outputText += licContent.trim().split(/\r?\n/).map(line => line.trimEnd()).join('\n') + '\n\n';
  } else {
    outputText += 'Refer to package documentation or public registry for license text.\n\n';
  }
}

fs.writeFileSync(path.join(rootDir, 'THIRD_PARTY_LICENSES.txt'), outputText);
console.log('Successfully generated THIRD_PARTY_LICENSES.txt!');
