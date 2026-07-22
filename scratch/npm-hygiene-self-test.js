const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');

const repositoryRoot = path.resolve(__dirname, '..');
const scannerSource = path.join(__dirname, 'npm-hygiene.js');

function writeFile(root, relativePath, content) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
}

function writeJson(root, relativePath, value) {
  writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function createFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crm-npm-hygiene-'));

  writeFile(root, 'scratch/npm-hygiene.js', fs.readFileSync(scannerSource, 'utf8'));
  writeJson(root, 'package.json', {
    name: 'hygiene-fixture',
    version: '1.0.0',
    private: true,
    workspaces: ['shared'],
  });
  writeJson(root, 'package-lock.json', {
    name: 'hygiene-fixture',
    version: '1.0.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'hygiene-fixture',
        version: '1.0.0',
        workspaces: ['shared'],
      },
      shared: {
        name: 'shared',
        version: '1.0.0',
      },
      'node_modules/shared': {
        resolved: 'shared',
        link: true,
      },
    },
  });
  writeJson(root, 'shared/package.json', {
    name: 'shared',
    version: '1.0.0',
    private: true,
    type: 'module',
    main: './dist/cjs/types.js',
    module: './dist/types.js',
    types: './dist/types.d.ts',
    exports: {
      '.': {
        types: './dist/types.d.ts',
        import: './dist/types.js',
        require: './dist/cjs/types.js',
        default: './dist/types.js',
      },
    },
  });
  writeFile(root, 'shared/dist/types.js', 'export const fixture = true;\n');
  writeFile(root, 'shared/dist/types.d.ts', 'export declare const fixture: boolean;\n');
  writeFile(root, 'shared/dist/cjs/types.js', 'exports.fixture = true;\n');
  writeJson(root, 'shared/dist/cjs/package.json', { type: 'commonjs' });
  writeFile(root, 'src/good.ts', 'export const valid = true;\n');

  execFileSync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

function runScanner(root) {
  const nodePath = [path.join(repositoryRoot, 'node_modules'), process.env.NODE_PATH]
    .filter(Boolean)
    .join(path.delimiter);

  return spawnSync(process.execPath, ['scratch/npm-hygiene.js'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_PATH: nodePath },
  });
}

function expectPass(root) {
  const result = runScanner(root);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /NPM declarations, workspace links, syntax and common typo checks passed/);
}

function expectFailure(root, expectedText) {
  const result = runScanner(root);
  const output = `${result.stdout}\n${result.stderr}`;
  assert.notEqual(result.status, 0, output);
  assert.match(output, expectedText);
}

const fixtureRoot = createFixture();

try {
  expectPass(fixtureRoot);

  writeFile(fixtureRoot, 'src/broken.ts', 'const broken = (;\n');
  expectFailure(fixtureRoot, /src\/broken\.ts/);
  fs.rmSync(path.join(fixtureRoot, 'src/broken.ts'));

  writeFile(fixtureRoot, 'duplicate.json', '{"key":1,"key":2}\n');
  expectFailure(fixtureRoot, /duplicate JSON key "key"/);
  fs.rmSync(path.join(fixtureRoot, 'duplicate.json'));

  const intentionalMisspelling = ['defin', 'ately'].join('');
  writeFile(fixtureRoot, 'README.md', `This is ${intentionalMisspelling} incorrect.\n`);
  expectFailure(fixtureRoot, new RegExp(`common misspelling detected: ${intentionalMisspelling}`));
  fs.rmSync(path.join(fixtureRoot, 'README.md'));

  writeFile(fixtureRoot, 'desktop/stage/generated.txt', 'generated\n');
  execFileSync('git', ['add', 'desktop/stage/generated.txt'], { cwd: fixtureRoot });
  expectFailure(fixtureRoot, /Generated Electron stage files are tracked/);
  execFileSync('git', ['rm', '--cached', '--quiet', 'desktop/stage/generated.txt'], { cwd: fixtureRoot });
  fs.rmSync(path.join(fixtureRoot, 'desktop'), { recursive: true, force: true });

  const sharedPackagePath = path.join(fixtureRoot, 'shared/package.json');
  const sharedPackage = JSON.parse(fs.readFileSync(sharedPackagePath, 'utf8'));
  sharedPackage.type = 'commonjs';
  fs.writeFileSync(sharedPackagePath, `${JSON.stringify(sharedPackage, null, 2)}\n`, 'utf8');
  expectFailure(fixtureRoot, /import target is not inside a module package boundary/);

  console.log('NPM hygiene negative-fixture regression tests passed.');
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
