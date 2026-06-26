const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '../');

function getDependencies(pkgPath) {
  const content = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return Object.keys(content.dependencies || {});
}

const packages = [
  path.join(rootDir, 'shared/package.json'),
  path.join(rootDir, 'backend/package.json'),
  path.join(rootDir, 'frontend/package.json')
];

const dependencies = new Set();
for (const pkg of packages) {
  if (fs.existsSync(pkg)) {
    getDependencies(pkg).forEach(dep => {
      if (dep !== 'shared') {
        dependencies.add(dep);
      }
    });
  }
}

let outputText = '========================================================================\n';
outputText += 'THIRD-PARTY SOFTWARE LICENSE NOTICES AND DISCLAIMERS\n';
outputText += '========================================================================\n\n';
outputText += 'This software makes use of third-party open-source components.\n';
outputText += 'Below is a compilation of all dependencies, licenses, and disclaimers:\n\n';

for (const dep of Array.from(dependencies).sort()) {
  let depDir = path.join(rootDir, 'node_modules', dep);
  
  // Hoisting fallbacks
  if (!fs.existsSync(depDir)) {
    depDir = path.join(rootDir, 'backend', 'node_modules', dep);
  }
  if (!fs.existsSync(depDir)) {
    depDir = path.join(rootDir, 'frontend', 'node_modules', dep);
  }

  const pkgPath = path.join(depDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkgInfo = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const license = pkgInfo.license || pkgInfo.licenses || 'UNKNOWN';
    const author = pkgInfo.author ? (typeof pkgInfo.author === 'string' ? pkgInfo.author : pkgInfo.author.name) : 'Various Authors';
    const version = pkgInfo.version || '0.0.0';

    outputText += '------------------------------------------------------------------------\n';
    outputText += `Package: ${dep} (v${version})\n`;
    outputText += `License: ${typeof license === 'string' ? license : JSON.stringify(license)}\n`;
    outputText += `Author: ${author}\n`;
    outputText += '------------------------------------------------------------------------\n';

    // Find LICENSE or COPYING file
    try {
      const files = fs.readdirSync(depDir);
      const licenseFile = files.find(f => {
        const upper = f.toUpperCase();
        return upper.startsWith('LICENSE') || upper.startsWith('LICENCE') || upper.startsWith('COPYING');
      });

      if (licenseFile) {
        const licContent = fs.readFileSync(path.join(depDir, licenseFile), 'utf8');
        outputText += licContent.trim() + '\n\n';
      } else {
        outputText += 'Refer to package documentation or public registry for license text.\n\n';
      }
    } catch (err) {
      outputText += 'Refer to package documentation or public registry for license text.\n\n';
    }
  }
}

fs.writeFileSync(path.join(rootDir, 'THIRD_PARTY_LICENSES.txt'), outputText);
console.log('Successfully generated THIRD_PARTY_LICENSES.txt!');
