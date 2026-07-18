import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const internalPackages = new Set(['shared', 'backend', 'frontend', 'desktop']);

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

function findDependencyPackage(rootDir: string, dep: string): string | undefined {
  const candidates = [
    path.join(rootDir, 'node_modules', dep, 'package.json'),
    path.join(rootDir, 'shared', 'node_modules', dep, 'package.json'),
    path.join(rootDir, 'backend', 'node_modules', dep, 'package.json'),
    path.join(rootDir, 'frontend', 'node_modules', dep, 'package.json'),
    path.join(rootDir, 'desktop', 'node_modules', dep, 'package.json')
  ];
  return candidates.find(candidate => fs.existsSync(candidate));
}

describe('FOSS License Compliance Check', () => {
  it('should ensure no copyleft licenses are declared by direct third-party workspace dependencies', () => {
    const rootDir = path.resolve(__dirname, '../../../../');
    const packages = [
      path.join(rootDir, 'shared/package.json'),
      path.join(rootDir, 'backend/package.json'),
      path.join(rootDir, 'frontend/package.json'),
      path.join(rootDir, 'desktop/package.json')
    ];

    const dependencies = new Set<string>();
    for (const pkg of packages) {
      if (fs.existsSync(pkg)) {
        for (const dep of getDirectDependencies(pkg)) {
          if (!internalPackages.has(dep)) {
            dependencies.add(dep);
          }
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

    for (const dep of Array.from(dependencies).sort()) {
      const depPkgPath = findDependencyPackage(rootDir, dep);
      if (!depPkgPath) {
        missing.push(dep);
        continue;
      }

      const pkgInfo = readJson(depPkgPath);
      const rawLicense = pkgInfo.license || pkgInfo.licenses || '';

      let licenseStr = '';
      if (typeof rawLicense === 'string') {
        licenseStr = rawLicense;
      } else if (Array.isArray(rawLicense)) {
        licenseStr = rawLicense.map((l: any) => l.type || l).join(', ');
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
