const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const failures = [];
const sourceKinds = new Map([
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JS],
  ['.cjs', ts.ScriptKind.JS],
]);
const typoScanExtensions = new Set([...sourceKinds.keys(), '.json', '.md', '.yml', '.yaml']);
const intentionalTypoDictionaryPath = 'scratch/npm-hygiene.js';
const commonMisspellings = [
  'compatability',
  'decleration',
  'definately',
  'dependancy',
  'enviroment',
  'inital',
  'lenght',
  'occured',
  'occurrance',
  'parenthacies',
  'recieve',
  'recieved',
  'responce',
  'seperate',
  'succesful',
];

function relative(filePath) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function record(message) {
  failures.push(message);
}

function shouldSkipDirectory(directoryPath) {
  const name = path.basename(directoryPath);
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'out' ||
    name === 'build' ||
    relative(directoryPath) === 'desktop/stage'
  );
}

function walk(directoryPath, visitor) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(absolutePath)) walk(absolutePath, visitor);
    } else if (entry.isFile()) {
      visitor(absolutePath);
    }
  }
}

function formatDiagnostic(diagnostic, filePath) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.start === undefined) return `${relative(filePath)}: ${message}`;
  const source = diagnostic.file || ts.createSourceFile(
    filePath,
    fs.readFileSync(filePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const position = source.getLineAndCharacterOfPosition(diagnostic.start);
  return `${relative(filePath)}:${position.line + 1}:${position.character + 1}: ${message}`;
}

function propertyNameText(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function checkDuplicateJsonKeys(sourceFile, filePath) {
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const seen = new Set();
      for (const property of node.properties) {
        if (!property.name) continue;
        const key = propertyNameText(property.name);
        if (key === null) continue;
        if (seen.has(key)) {
          const position = sourceFile.getLineAndCharacterOfPosition(property.name.getStart(sourceFile));
          record(`${relative(filePath)}:${position.line + 1}:${position.character + 1}: duplicate JSON key "${key}"`);
        }
        seen.add(key);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function checkFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const fileRelativePath = relative(filePath);
  const text = fs.readFileSync(filePath, 'utf8');

  if (sourceKinds.has(extension)) {
    const source = ts.createSourceFile(
      filePath,
      text,
      ts.ScriptTarget.Latest,
      true,
      sourceKinds.get(extension),
    );
    for (const diagnostic of source.parseDiagnostics || []) {
      record(formatDiagnostic(diagnostic, filePath));
    }
  } else if (extension === '.json') {
    const source = ts.parseJsonText(filePath, text);
    for (const diagnostic of source.parseDiagnostics || []) {
      record(formatDiagnostic(diagnostic, filePath));
    }
    checkDuplicateJsonKeys(source, filePath);
  }

  if (
    typoScanExtensions.has(extension) &&
    path.basename(filePath) !== 'package-lock.json' &&
    fileRelativePath !== intentionalTypoDictionaryPath
  ) {
    for (const misspelling of commonMisspellings) {
      if (new RegExp(`\\b${misspelling}\\b`, 'i').test(text)) {
        record(`${fileRelativePath}: common misspelling detected: ${misspelling}`);
      }
    }
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function collectExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) targets.push(value);
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) collectExportTargets(child, targets);
  }
  return targets;
}

function collectConditions(value, condition, targets = []) {
  if (!value || typeof value !== 'object') return targets;
  for (const [key, child] of Object.entries(value)) {
    if (key === condition && typeof child === 'string') targets.push(child);
    if (child && typeof child === 'object') collectConditions(child, condition, targets);
  }
  return targets;
}

function nearestPackageType(targetPath, workspacePath) {
  let directory = path.dirname(targetPath);
  const boundary = path.resolve(workspacePath);
  while (directory.startsWith(boundary)) {
    const packagePath = path.join(directory, 'package.json');
    if (fs.existsSync(packagePath)) return readJson(relative(packagePath)).type || 'commonjs';
    if (directory === boundary) break;
    directory = path.dirname(directory);
  }
  return 'commonjs';
}

function checkWorkspaceDeclarations(workspacePath, packageJson) {
  const packagePath = path.join(workspacePath, 'package.json');
  const declaredTargets = [packageJson.main, packageJson.module, packageJson.types]
    .filter((value) => typeof value === 'string')
    .concat(collectExportTargets(packageJson.exports));

  for (const target of new Set(declaredTargets)) {
    if (!fs.existsSync(path.resolve(workspacePath, target))) {
      record(`${relative(packagePath)}: declared output does not exist: ${target}`);
    }
  }

  if (packageJson.types) {
    const typeConditions = collectConditions(packageJson.exports, 'types');
    if (!typeConditions.includes(packageJson.types)) {
      record(`${relative(packagePath)}: exports must declare the package types target`);
    }
  }

  for (const target of collectConditions(packageJson.exports, 'import')) {
    if (target.endsWith('.js') && nearestPackageType(path.resolve(workspacePath, target), workspacePath) !== 'module') {
      record(`${relative(packagePath)}: import target is not inside a module package boundary: ${target}`);
    }
  }

  for (const target of collectConditions(packageJson.exports, 'require')) {
    if (target.endsWith('.js') && nearestPackageType(path.resolve(workspacePath, target), workspacePath) !== 'commonjs') {
      record(`${relative(packagePath)}: require target is not inside a CommonJS package boundary: ${target}`);
    }
  }
}

async function main() {
  walk(root, checkFile);

  const rootPackage = readJson('package.json');
  const lock = readJson('package-lock.json');
  const workspacePaths = rootPackage.workspaces || [];
  const workspaceNames = new Map();

  for (const workspaceRelativePath of workspacePaths) {
    const workspacePath = path.join(root, workspaceRelativePath);
    const packagePath = path.join(workspacePath, 'package.json');
    if (!fs.existsSync(packagePath)) {
      record(`Missing workspace package.json: ${workspaceRelativePath}`);
      continue;
    }

    const packageJson = readJson(`${workspaceRelativePath}/package.json`);
    if (workspaceNames.has(packageJson.name)) {
      record(`Duplicate workspace package name "${packageJson.name}" in ${workspaceRelativePath} and ${workspaceNames.get(packageJson.name)}`);
    }
    workspaceNames.set(packageJson.name, workspaceRelativePath);

    if (!lock.packages || !lock.packages[workspaceRelativePath]) {
      record(`package-lock.json is missing workspace metadata for ${workspaceRelativePath}`);
    }
    const workspaceLink = lock.packages && lock.packages[`node_modules/${packageJson.name}`];
    if (!workspaceLink || workspaceLink.link !== true || workspaceLink.resolved !== workspaceRelativePath) {
      record(`package-lock.json is missing the workspace link for ${packageJson.name}`);
    }

    checkWorkspaceDeclarations(workspacePath, packageJson);
  }

  for (const workspaceRelativePath of workspacePaths) {
    const packageJson = readJson(`${workspaceRelativePath}/package.json`);
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [dependencyName, declaredVersion] of Object.entries(packageJson[section] || {})) {
        if (workspaceNames.has(dependencyName) && declaredVersion !== '*') {
          record(`${workspaceRelativePath}/package.json: internal workspace dependency ${dependencyName} must use "*"`);
        }
      }
    }
  }

  const trackedStageFiles = execFileSync('git', ['ls-files', '--', 'desktop/stage'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (trackedStageFiles) record(`Generated Electron stage files are tracked:\n${trackedStageFiles}`);

  const trackedTarballs = execFileSync('git', ['ls-files', '--', '*.tgz'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  if (trackedTarballs) record(`Generated npm tarballs are tracked:\n${trackedTarballs}`);

  if (failures.length === 0) {
    const sharedDirectory = path.join(root, 'shared');
    require(sharedDirectory);
    await import(pathToFileURL(path.join(sharedDirectory, 'dist', 'types.js')).href);
  }

  if (failures.length > 0) {
    console.error('NPM and syntax hygiene verification failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log('NPM declarations, workspace links, syntax and common typo checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
