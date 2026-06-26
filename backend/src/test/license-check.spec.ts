import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

function getDependencies(pkgPath: string): string[] {
  const content = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return Object.keys(content.dependencies || {});
}

describe('FOSS License Compliance Check', () => {
  it('should ensure no copyleft dependencies are installed in production package trees', () => {
    const rootDir = path.resolve(__dirname, '../../../../');
    const packages = [
      path.join(rootDir, 'shared/package.json'),
      path.join(rootDir, 'backend/package.json'),
      path.join(rootDir, 'frontend/package.json')
    ];

    const dependencies = new Set<string>();
    for (const pkg of packages) {
      if (fs.existsSync(pkg)) {
        getDependencies(pkg).forEach(dep => {
          if (dep !== 'shared') {
            dependencies.add(dep);
          }
        });
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

    for (const dep of dependencies) {
      // Find package.json of the dependency in node_modules
      let depPkgPath = path.join(rootDir, 'node_modules', dep, 'package.json');
      
      // Support monorepo nested hoisting search
      if (!fs.existsSync(depPkgPath)) {
        depPkgPath = path.join(rootDir, 'backend', 'node_modules', dep, 'package.json');
      }
      if (!fs.existsSync(depPkgPath)) {
        depPkgPath = path.join(rootDir, 'frontend', 'node_modules', dep, 'package.json');
      }

      if (fs.existsSync(depPkgPath)) {
        const pkgInfo = JSON.parse(fs.readFileSync(depPkgPath, 'utf8'));
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
        
        // Check for blacklist matches
        const isCopyleft = copyleftBlacklist.some(term => upperLicense.includes(term));
        
        if (isCopyleft) {
          violations.push(`${dep} (License: ${licenseStr})`);
        }
      }
    }

    expect(violations, `Copyleft licenses detected: ${violations.join(', ')}`).toEqual([]);
  });
});
