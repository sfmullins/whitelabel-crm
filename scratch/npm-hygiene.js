const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const failures = [];
const sourceExtensions = new Map([
  ['.ts', ts.ScriptKind.TS],
  ['.tsx', ts.ScriptKind.TSX],
  ['.js', ts.ScriptKind.JS],
  ['.jsx', ts.ScriptKind.JSX],
  ['.mjs', ts.ScriptKind.JS],
  ['.cjs', ts.ScriptKind.JS],
]);
const scannedTextExtensions = new Set([
  ...sourceExtensions.keys(),
  '.json',
  '.md',
  '.yml',
  '.yaml',
]);
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
  const rel = relative(directoryPath);
  const name = path.basename(directoryPath);
  return (
    name === '.git' ||
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'out' ||
    name === 'build' ||
    rel === 'desktop/stage'
  );
}

function walk(directoryPath, visitor) {
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const absolute = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDirectory(absolute)) walk(absolute, visitor);
      continue;
    }
    if (entry.isFile()) visitor(absolute);
  }
}

function formatDiagnostic(diagnostic, filePath) {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (diagnostic.start === undefined) return `${relative(filePath)}: ${message}`;
  const source = diagnostic.file || ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
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
      const seen = new Map();
      for (const property of node.properties) {
        if (!property.name) continue;
        const key = propertyNameText(property.name);
        if (key === null) continue;
        const previous = seen.get(key);
        if (previous !== undefined) {
          const position = sourceFile.getLineAndCharacterOfPosition(property.name.getStart(sourceFile));
          record(`${relative(filePath)}:${position.line + 1}:${position.character + 1}: duplicate JSON key "${key}"`);
        } else {
          seen.set(key, property.name.getStart(sourceFile));
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
}

function checkFileSyntax(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const text = fs.readFileSync(filePath, 'utf8');

  if (sourceExtensions.has(extension)) {
    const source = ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, sourceExtensions.get(extension));
    for (const diagnostic of source.parseDiagnostics || []) record(formatDiagnostic(diagnostic, filePath));
  } else if (extension === '.json') {
    const source = ts.parseJsonText(filePath, text);
    for (const diagnostic of source.parseDiagnostics || []) record(formatDiagnostic(diagnostic, filePath));
    checkDuplicateJsonKeys(source, filePath);
  }

  if (scannedTextExtensions.has(extension) && path.basename(filePath) !== 'package-lock.json') {
    for (const typo of commonMisspellings) {
      const expression = new RegExp(`\\b${typo}\\b`, 'i');
      if (expression.test(text)) record(`${relative(filePath)}: common misspelling detected: ${typo}`);
    }
  }
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function collectExportTargets(value, targets = []) {
  if (typeof value === 'string') {
    if (value.startsWith('./')) targets.push(value);
    return targets;
  }
  if (value && typeof value === 'object') {
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
    const candidate = path.join(directory, 'package.json');
    if (fs.existsSync(candidate)) return JSON.parse(fs.readFileSync(candidate, 'utf8')).type || 'commonjs';
    if (directory === boundary) break;
    directory = path.dirname(directory);
  }
  return 'commonjs';
}

function checkWorkspaceDeclarations(workspacePath, packageJson) {
  const declaredTargets = [packageJson.main, packageJson.module, packageJson.types]
    .filter((value) => typeof value === 'string')
    .concat(collectExportTargets(packageJson.exports));

  for (const target of new Set(declaredTargets)) {
    const absolute = path.resolve(workspacePath, target);
    if (!fs.existsSync(absolute)) record(`${relative(path.join(workspacePath, 'package.json'))}: declared output does not exist: ${target}`);
  }

  if (packageJson.types) {
    const typeConditions = collectConditions(packageJson.exports, 'types');
    if (!typeConditions.includes(packageJson.types)) {
      record(`${relative(path.join(workspacePath, 'package.json'))}: exports must declare the package types target`);
    }
  }

  for (const target of collectConditions(packageJson.exports, 'import')) {
    if (target.endsWith('.js')) {
      const resolved = path.resolve(workspacePath, target);
      if (nearestPackageType(resolved, workspacePath) !== 'module') {
        record(`${relative(path.join(workspacePath, 'package.json'))}: import target is not inside a module package boundary: ${target}`);
      }
    }
  }

  for (const target of collectConditions(packageJson.exports, 'require')) {
    if (target.endsWith('.js')) {
      const resolved = path.resolve(workspacePath, target);
      if (nearestPackageType(resolved, workspacePath) !== 'commonjs') {
        record(`${relative(path.join(workspacePath, 'package.json'))}: require target is not inside a CommonJS package boundary: ${target}`);
      }
    }
  }
}

async function main() {
  walk(root, checkFileSyntax);

  const rootPackage = readJson('package.json');
  const lock = readJson('package-lock.json');
  const workspacePaths = rootPackage.workspaces || [];
  const names = new Map();

  for (const workspaceRelativePath of workspacePaths) {
    const workspacePath = path.join(root, workspaceRelativePath);
    const packageJsonPath = path.join(workspacePath, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      record(`Missing workspace package.json: ${workspaceRelativePath}`);
      continue;
    }
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    if (names.has(packageJson.name)) record(`Duplicate workspace package name "${packageJson.name}" in ${workspaceRelativePath} and ${names.get(packageJson.name)}`);
    names.set(packageJson.name, workspaceRelativePath);

    if (!lock.packages || !lock.packages[workspaceRelativePath]) record(`package-lock.json is missing workspace metadata for ${workspaceRelativePath}`);
    const link = lock.packages && lock.packages[`node_modules/${packageJson.name}`];
    if (!link || link.link !== true || link.resolved !== workspaceRelativePath) record(`package-lock.json is missing the workspace link for ${packageJson.name}`);

    checkWorkspaceDeclarations(workspacePath, packageJson);
  }

  for (const workspaceRelativePath of workspacePaths) {
    const packageJson = readJson(`${workspaceRelativePath}/package.json`);
    for (const dependencySection of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const dependencyName of Object.keys(packageJson[dependencySection] || {})) {
        if (names.has(dependencyName) && packageJson[dependencySection][dependencyName] !== '*') {
          record(`${workspaceRelativePath}/package.json: internal workspace dependency ${dependencyName} must use "*"`);
        }
      }
    }
  }

  const trackedStageFiles = execFileSync('git', ['ls-files', '--', 'desktop/stage'], { cwd: root, encoding: 'utf8' }).trim();
  if (trackedStageFiles) record(`Generated Electron stage files are tracked:\n${trackedStageFiles}`);

  const trackedTarballs = execFileSync('git', ['ls-files', '--', '*.tgz'], { cwd: root, encoding: 'utf8' }).trim();
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
