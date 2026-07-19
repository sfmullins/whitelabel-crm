import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const workspaces = [
  { name: 'shared', packagePath: 'shared/package.json' },
  { name: 'backend', packagePath: 'backend/package.json' },
  { name: 'frontend', packagePath: 'frontend/package.json' },
  { name: 'desktop', packagePath: 'desktop/package.json' }
];
const internalPackages = new Set(workspaces.map(workspace => workspace.name));

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getDirectDependencies(pkgPath: string): string[] {
  const content = readJson(pkgPath);
  return [
    ...Object.keys(content.dependencies || {}),
    ...Object.keys(content.devDependencies || {})
  ];
}

function findPackageRoot(resolvedPath: string): string {
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

function resolveDependencyFromWorkspace(dep: string, workspacePackagePath: string): string {
  const workspaceRequire = createRequire(workspacePackagePath);
  try {
    return findPackageRoot(workspaceRequire.resolve(`${dep}/package.json`));
  } catch (pkgJsonError) {
    return findPackageRoot(workspaceRequire.resolve(dep));
  }
}

describe('FOSS License Compliance Check', () => {
  it('should ensure no copyleft licenses are declared by direct third-party workspace dependencies', () => {
    const rootDir = path.resolve(__dirname, '../../../../');
    const dependencies = new Map<string, string>();

    for (const workspace of workspaces) {
      const workspacePackagePath = path.join(rootDir, workspace.packagePath);
      if (!fs.existsSync(workspacePackagePath)) {
        continue;
      }

      for (const dep of getDirectDependencies(workspacePackagePath)) {
        if (!internalPackages.has(dep)) {
          const depDir = resolveDependencyFromWorkspace(dep, workspacePackagePath);
          const pkgInfo = readJson(path.join(depDir, 'package.json'));
          dependencies.set(`${pkgInfo.name || dep}@${pkgInfo.version || '0.0.0'}`, path.join(depDir, 'package.json'));
        }
      }
    }

    const copyleftBlacklist = [
      'GPL',
      'AGPL',
      'LGPL',
      'GENERAL PUBLIC LICENSE',
      'AFFERO',
      'COPYLEFT'
    ];

    const violations: string[] = [];
    const missing: string[] = [];

    for (const [dep, depPkgPath] of Array.from(dependencies.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      if (!fs.existsSync(depPkgPath)) {
        missing.push(dep);
        continue;
      }

      const pkgInfo = readJson(depPkgPath);
      const rawLicense = pkgInfo.license || pkgInfo.licenses || '';

      let licenseStr = '';
      if (typeof rawLicense === 'string') {
        licenseStr = rawLicense;
      } else if (Array.isArray(rawLicense)) {
        licenseStr = rawLicense.map((license: any) => license.type || license).join(', ');
      } else if (rawLicense && typeof rawLicense === 'object') {
        licenseStr = (rawLicense as any).type || JSON.stringify(rawLicense);
      }

      const upperLicense = licenseStr.toUpperCase();
      const isCopyleft = copyleftBlacklist.some(term => upperLicense.includes(term));

      if (isCopyleft) {
        violations.push(`${dep} (License: ${licenseStr})`);
      }
    }

    expect(missing, `Direct dependencies missing from installed package tree: ${missing.join(', ')}`).toEqual([]);
    expect(violations, `Copyleft licenses detected: ${violations.join(', ')}`).toEqual([]);
  });
});
