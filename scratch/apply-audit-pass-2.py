from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one occurrence in {path}, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


def delete(path: str) -> None:
    target = ROOT / path
    if target.exists():
        target.unlink()


write(
    "backend/src/infrastructure/backup/BackupPathPolicy.ts",
    """import path from 'node:path';

const ALLOWED_BACKUP_EXTENSIONS=new Set(['.db','.crmbackup']);
const SAFE_BACKUP_FILENAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function resolveBackupPath(rootDirectory:string,filename:string):string {
  if(typeof filename!=='string'||!SAFE_BACKUP_FILENAME.test(filename)||filename.includes('/')||filename.includes('\\\\'))throw new Error('Invalid backup filename');
  if(!ALLOWED_BACKUP_EXTENSIONS.has(path.extname(filename).toLowerCase()))throw new Error('Unsupported backup file type');
  const root=path.resolve(rootDirectory);const target=path.resolve(root,filename);const relative=path.relative(root,target);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Backup path escapes the configured backup directory');
  return target;
}

export function resolveBackupManifestPath(rootDirectory:string,filename:string):string {
  const backupPath=resolveBackupPath(rootDirectory,filename);const extension=path.extname(backupPath);return backupPath.slice(0,-extension.length)+'.manifest.json';
}
""",
)

replace_once(
    "backend/src/infrastructure/backup/BackupManager.ts",
    "import { uploadToS3, S3BackupConfiguration } from './S3Client';\n",
    "import { uploadToS3, S3BackupConfiguration } from './S3Client';\nimport { resolveBackupManifestPath, resolveBackupPath } from './BackupPathPolicy';\n",
)
replace_once(
    "backend/src/infrastructure/backup/BackupManager.ts",
    "    const sourcePath = path.join(paths.internalBackupDirectory, filename);\n",
    "    const sourcePath = resolveBackupPath(paths.internalBackupDirectory, filename);\n",
)
replace_once(
    "backend/src/infrastructure/backup/BackupManager.ts",
    "    const targetPath = path.join(paths.internalBackupDirectory, filename);\n    if (fs.existsSync(targetPath)) {\n      fs.unlinkSync(targetPath);\n    }\n    const baseName = filename.substring(0, filename.lastIndexOf('.'));\n    const manifestPath = path.join(paths.internalBackupDirectory, `${baseName}.manifest.json`);\n",
    "    const targetPath = resolveBackupPath(paths.internalBackupDirectory, filename);\n    if (fs.existsSync(targetPath)) {\n      fs.unlinkSync(targetPath);\n    }\n    const manifestPath = resolveBackupManifestPath(paths.internalBackupDirectory, filename);\n",
)
replace_once(
    "backend/src/test/backup.spec.ts",
    "  it('should prune old backups correctly according to GFS schedule', () => {\n",
    "  it('should reject restore and deletion paths outside the backup directory', async () => {\n    const outsidePath = path.resolve(testDataDir, '..', `outside-${crypto.randomUUID()}.db`);\n    fs.writeFileSync(outsidePath, 'do-not-delete');\n\n    expect(() => BackupManager.deleteBackup(`../${path.basename(outsidePath)}`)).toThrow(/Invalid backup filename/);\n    expect(fs.existsSync(outsidePath)).toBe(true);\n    await expect(BackupManager.restoreBackup(`../${path.basename(outsidePath)}`)).rejects.toThrow(/Invalid backup filename/);\n    expect(fs.existsSync(outsidePath)).toBe(true);\n\n    fs.unlinkSync(outsidePath);\n  });\n\n  it('should prune old backups correctly according to GFS schedule', () => {\n",
)

write(
    "desktop/src/securityPolicy.ts",
    """import path from 'node:path';

export function isPathWithinRoot(rootDirectory:string,candidatePath:string):boolean {
  if(typeof candidatePath!=='string'||candidatePath.length===0)return false;
  const root=path.resolve(rootDirectory);const candidate=path.resolve(candidatePath);const relative=path.relative(root,candidate);
  return relative===''||(!relative.startsWith('..')&&!path.isAbsolute(relative));
}

export function isAllowedNavigation(targetUrl:string,applicationUrl:string):boolean {
  try{const target=new URL(targetUrl);const application=new URL(applicationUrl);return (target.protocol==='http:'||target.protocol==='https:')&&target.origin===application.origin;}catch{return false;}
}

export function isAllowedExternalUrl(targetUrl:string):boolean {
  try{return ['http:','https:','mailto:'].includes(new URL(targetUrl).protocol);}catch{return false;}
}
""",
)
replace_once(
    "desktop/src/main.ts",
    "import type { RunningServer } from 'backend';\n",
    "import type { RunningServer } from 'backend';\nimport { isAllowedExternalUrl, isAllowedNavigation, isPathWithinRoot } from './securityPolicy';\n",
)
replace_once(
    "desktop/src/main.ts",
    "  // Prevent unexpected navigations outside the target loopback host\n  mainWindow.webContents.on('will-navigate', (event, url) => {\n    const parsed = new URL(url);\n    if (parsed.hostname !== '127.0.0.1') {\n      event.preventDefault();\n      shell.openExternal(url);\n    }\n  });\n\n  // Deny unexpected window popups\n  mainWindow.webContents.setWindowOpenHandler(({ url }) => {\n    shell.openExternal(url);\n    return { action: 'deny' };\n  });\n",
    "  // Keep the privileged renderer on the exact embedded-server origin.\n  mainWindow.webContents.on('will-navigate', (event, url) => {\n    if (!isAllowedNavigation(url, serverUrl)) {\n      event.preventDefault();\n      if (isAllowedExternalUrl(url)) void shell.openExternal(url);\n    }\n  });\n\n  // Deny popups and open only allow-listed external URL schemes in the system handler.\n  mainWindow.webContents.setWindowOpenHandler(({ url }) => {\n    if (isAllowedExternalUrl(url)) void shell.openExternal(url);\n    return { action: 'deny' };\n  });\n",
)
replace_once(
    "desktop/src/main.ts",
    "ipcMain.handle('open-path', async (event, targetPath) => {\n  const resolved = path.resolve(targetPath);\n  if (resolved.startsWith(userDataPath) || resolved.startsWith('/')) {\n    await shell.openPath(targetPath);\n  }\n});\n",
    "ipcMain.handle('open-path', async (_event, targetPath: unknown) => {\n  if (typeof targetPath !== 'string' || !isPathWithinRoot(userDataPath, targetPath)) {\n    throw new Error('The requested path is outside the application data directory.');\n  }\n  const errorMessage = await shell.openPath(path.resolve(targetPath));\n  if (errorMessage) throw new Error(errorMessage);\n});\n",
)

write(
    "scratch/desktop-security-smoke.js",
    """const assert=require('node:assert/strict');
const path=require('node:path');
const {isAllowedExternalUrl,isAllowedNavigation,isPathWithinRoot}=require('../desktop/dist/securityPolicy.js');

const root=path.resolve('/tmp/whitelabel-crm-user-data');
assert.equal(isPathWithinRoot(root,root),true);
assert.equal(isPathWithinRoot(root,path.join(root,'backups','snapshot.db')),true);
assert.equal(isPathWithinRoot(root,path.resolve(root,'..','outside.db')),false);
assert.equal(isPathWithinRoot(root,`${root}-prefix-collision/file`),false);

const appUrl='http://127.0.0.1:43123';
assert.equal(isAllowedNavigation(`${appUrl}/settings`,appUrl),true);
assert.equal(isAllowedNavigation('http://127.0.0.1:43124',appUrl),false);
assert.equal(isAllowedNavigation('http://localhost:43123',appUrl),false);
assert.equal(isAllowedNavigation('file:///tmp/attack.html',appUrl),false);
assert.equal(isAllowedExternalUrl('https://example.com/help'),true);
assert.equal(isAllowedExternalUrl('mailto:support@example.com'),true);
assert.equal(isAllowedExternalUrl('file:///tmp/attack.html'),false);
assert.equal(isAllowedExternalUrl('javascript:alert(1)'),false);
console.log('Desktop security policy smoke passed.');
""",
)

write(
    "desktop/stage-policy.js",
    """const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');

function packageNameFromLockPath(lockPath,entry){
  if(entry&&typeof entry.name==='string')return entry.name;
  const marker='node_modules/';const index=lockPath.lastIndexOf(marker);if(index<0)return null;const remainder=lockPath.slice(index+marker.length);const parts=remainder.split('/');return remainder.startsWith('@')?parts.slice(0,2).join('/'):parts[0];
}
function collectAllowedPackageVersions(lock){const allowed=new Set();for(const [lockPath,entry] of Object.entries(lock.packages||{})){if(!entry||typeof entry!=='object'||typeof entry.version!=='string')continue;const name=packageNameFromLockPath(lockPath,entry);if(name)allowed.add(`${name}@${entry.version}`);}return allowed;}
function findUnexpectedPackages(lock,tree){const allowed=collectAllowedPackageVersions(lock);const unexpected=new Set();const walk=(dependencies)=>{for(const [name,node] of Object.entries(dependencies||{})){if(!node||typeof node!=='object')continue;if(typeof node.version==='string'&&!allowed.has(`${name}@${node.version}`))unexpected.add(`${name}@${node.version}`);walk(node.dependencies);}};walk(tree.dependencies);return [...unexpected].sort();}
function verifyInstalledDependencyGraph(stageDirectory,rootLockPath){const lock=JSON.parse(fs.readFileSync(rootLockPath,'utf8'));const tree=JSON.parse(execFileSync('npm',['ls','--all','--json'],{cwd:stageDirectory,encoding:'utf8',stdio:['ignore','pipe','inherit']}));const unexpected=findUnexpectedPackages(lock,tree);if(unexpected.length)throw new Error(`Staged package resolved versions outside the reviewed root lockfile:\n${unexpected.map((item)=>`- ${item}`).join('\n')}`);}
module.exports={collectAllowedPackageVersions,findUnexpectedPackages,verifyInstalledDependencyGraph};
""",
)
replace_once(
    "desktop/stage.js",
    "const { execFileSync, execSync } = require('node:child_process');\n",
    "const { execFileSync, execSync } = require('node:child_process');\nconst { verifyInstalledDependencyGraph } = require('./stage-policy');\n",
)
replace_once(
    "desktop/stage.js",
    "execSync('npm install --no-audit --no-fund --package-lock=false', {\n  cwd: stageDir,\n  stdio: 'inherit',\n});\n\n// 8. Run Electron Forge inside the isolated staging directory.\n",
    "execSync('npm install --no-audit --no-fund --package-lock=false', {\n  cwd: stageDir,\n  stdio: 'inherit',\n});\nconsole.log('Verifying staged dependency versions against the reviewed root lockfile...');\nverifyInstalledDependencyGraph(stageDir, path.join(rootDir, 'package-lock.json'));\n\n// 8. Run Electron Forge inside the isolated staging directory.\n",
)
write(
    "scratch/stage-policy-self-test.js",
    """const assert=require('node:assert/strict');
const {findUnexpectedPackages}=require('../desktop/stage-policy');
const lock={packages:{'node_modules/alpha':{version:'1.2.3'},'node_modules/alpha/node_modules/beta':{version:'4.5.6'}}};
const matching={dependencies:{alpha:{version:'1.2.3',dependencies:{beta:{version:'4.5.6'}}}}};
const drifted={dependencies:{alpha:{version:'1.2.4',dependencies:{beta:{version:'4.5.6'},gamma:{version:'9.0.0'}}}}};
assert.deepEqual(findUnexpectedPackages(lock,matching),[]);
assert.deepEqual(findUnexpectedPackages(lock,drifted),['alpha@1.2.4','gamma@9.0.0']);
console.log('Desktop staged dependency policy self-test passed.');
""",
)

write(
    "scratch/workflow-hygiene.js",
    """const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const workflowDirectory=path.join(root,'.github','workflows');
const obsolete=new Set(['wi4-bootstrap.yml','wi5-validation.yml','wi6-validation.yml','wi7-validation.yml']);
const failures=[];
for(const filename of fs.readdirSync(workflowDirectory).filter((value)=>/\.ya?ml$/i.test(value)).sort()){
  if(obsolete.has(filename))failures.push(`${filename}: obsolete work-item workflow remains after merge`);
  const content=fs.readFileSync(path.join(workflowDirectory,filename),'utf8');
  if(/^\s*pull_request_target\s*:/m.test(content))failures.push(`${filename}: pull_request_target is not permitted`);
  for(const match of content.matchAll(/^\s*uses:\s*([^\s#]+).*$/gm)){
    const reference=match[1];if(reference.startsWith('./'))continue;const at=reference.lastIndexOf('@');const version=at>=0?reference.slice(at+1):'';if(!/^[0-9a-f]{40}$/i.test(version))failures.push(`${filename}: action is not pinned to a full commit SHA: ${reference}`);
  }
}
if(failures.length){console.error('Workflow hygiene failed:\n'+failures.map((failure)=>`- ${failure}`).join('\n'));process.exit(1);}console.log('Workflow hygiene passed.');
""",
)

package_path = ROOT / "package.json"
package_data = json.loads(package_path.read_text(encoding="utf-8"))
scripts = package_data["scripts"]
scripts["check:npm-hygiene"] = "node scratch/npm-hygiene.js && node scratch/npm-hygiene-self-test.js && node scratch/workflow-hygiene.js && npm ls --all"
scripts["desktop:security"] = "node scratch/desktop-security-smoke.js"
scripts["desktop:dependency-policy"] = "node scratch/stage-policy-self-test.js"
scripts["ci:verify"] = "npm run build && npm run check:npm-hygiene && npm run audit:production && npm test && npm run db:smoke && npm run wi4:smoke && npm run wi5:smoke && npm run wi6:smoke && npm run wi7:smoke && npm run wi8-wi9:smoke && npm run wi10:smoke && npm run wi11:smoke && npm run desktop:preflight && npm run desktop:security && npm run desktop:dependency-policy"
package_path.write_text(json.dumps(package_data, indent=2) + "\n", encoding="utf-8")

for workflow in [".github/workflows/ci.yml", ".github/workflows/linux-package.yml"]:
    content = read(workflow)
    content = content.replace("actions/checkout@v4", "actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4")
    content = content.replace("actions/setup-node@v4", "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4")
    content = content.replace("actions/upload-artifact@v4", "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4")
    write(workflow, content)
replace_once(
    ".github/workflows/ci.yml",
    "      - name: Desktop packaging preflight\n        run: npm run desktop:preflight\n",
    "      - name: Desktop packaging and security preflight\n        run: |\n          npm run desktop:preflight\n          npm run desktop:security\n          npm run desktop:dependency-policy\n",
)
for obsolete_workflow in [
    ".github/workflows/wi4-bootstrap.yml",
    ".github/workflows/wi5-validation.yml",
    ".github/workflows/wi6-validation.yml",
    ".github/workflows/wi7-validation.yml",
]:
    delete(obsolete_workflow)

replace_once(
    "frontend/src/pages/Settings.tsx",
    "  const [backupPassword, setBackupPassword] = useState(localStorage.getItem('backup_password') || '');\n",
    "  const [backupPassword, setBackupPassword] = useState('');\n",
)
replace_once(
    "frontend/src/pages/Settings.tsx",
    "  const [s3AccessKey, setS3AccessKey] = useState(localStorage.getItem('backup_s3_access_key') || '');\n  const [s3SecretKey, setS3SecretKey] = useState(localStorage.getItem('backup_s3_secret_key') || '');\n",
    "  const [s3AccessKey, setS3AccessKey] = useState('');\n  const [s3SecretKey, setS3SecretKey] = useState('');\n",
)
replace_once(
    "frontend/src/pages/Settings.tsx",
    "  useEffect(() => {\n    localStorage.setItem('backup_external_dir', externalDir);\n",
    "  useEffect(() => {\n    localStorage.removeItem('backup_password');\n    localStorage.removeItem('backup_s3_access_key');\n    localStorage.removeItem('backup_s3_secret_key');\n  }, []);\n\n  useEffect(() => {\n    localStorage.setItem('backup_external_dir', externalDir);\n",
)
for sensitive_line in [
    "    localStorage.setItem('backup_password', backupPassword);\n",
    "    localStorage.setItem('backup_s3_access_key', s3AccessKey);\n",
    "    localStorage.setItem('backup_s3_secret_key', s3SecretKey);\n",
]:
    replace_once("frontend/src/pages/Settings.tsx", sensitive_line, "")
replace_once(
    "frontend/src/pages/Settings.tsx",
    "  }, [externalDir, externalEnabled, encryptionEnabled, backupPassword, s3Enabled, s3Endpoint, s3Region, s3Bucket, s3Prefix, s3AccessKey, s3SecretKey, dailyCount, weeklyCount, monthlyCount]);\n",
    "  }, [externalDir, externalEnabled, encryptionEnabled, s3Enabled, s3Endpoint, s3Region, s3Bucket, s3Prefix, dailyCount, weeklyCount, monthlyCount]);\n",
)
replace_once(
    "frontend/src/pages/Settings.tsx",
    "    onSuccess: () => {\n      refetchBackups();\n      alert('Database backup created successfully!');\n",
    "    onSuccess: () => {\n      refetchBackups();\n      setBackupPassword('');\n      setS3AccessKey('');\n      setS3SecretKey('');\n      alert('Database backup created successfully!');\n",
)
write(
    "frontend/src/pages/Settings.security.test.ts",
    """import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

describe('backup settings secret persistence',()=>{
  it('does not read or write backup credentials through localStorage',()=>{
    const source=fs.readFileSync(new URL('./Settings.tsx',import.meta.url),'utf8');
    for(const key of ['backup_password','backup_s3_access_key','backup_s3_secret_key']){
      expect(source).not.toContain(`localStorage.getItem('${key}')`);
      expect(source).not.toContain(`localStorage.setItem('${key}'`);
      expect(source).toContain(`localStorage.removeItem('${key}')`);
    }
  });
});
""",
)

replace_once(
    "README.md",
    "- post-WI11 npm, package-boundary and staging hardening, PR #15.\n",
    "- post-WI11 npm, package-boundary and staging hardening, PR #15;\n- first full post-WI11 repository audit and release-baseline hardening, PR #16.\n",
)
replace_once(
    "docs/WI10-WI12-IMPLEMENTATION-PLAN.md",
    "- post-WI11 npm/package-boundary and Electron staging hardening was merged through PR #15 at `e3175e8f8dd56372bc8af4eb4b2ed5e89620d28b`.\n",
    "- post-WI11 npm/package-boundary and Electron staging hardening was merged through PR #15 at `e3175e8f8dd56372bc8af4eb4b2ed5e89620d28b`;\n- the first full post-WI11 repository audit and release-baseline hardening was merged through PR #16 at `f6e66f3a1cde010aa8c360a682301b2ae970b173`.\n",
)
replace_once(
    "docs/WI10-WI12-IMPLEMENTATION-PLAN.md",
    "2. **PR #15 is baseline hardening.** It does not alter the WI10–WI12 work-item numbering.\n",
    "2. **PRs #15 and #16 are baseline hardening and audit work.** They do not alter the WI10–WI12 work-item numbering.\n",
)
replace_once(
    "docs/WI10-WI12-IMPLEMENTATION-PLAN.md",
    "| Post-WI11 audit/hardening | audit branch | merged WI11 + PR #15 `main` | dependency, documentation, test and packaging reconciliation |\n",
    "| Post-WI11 audit/hardening | audit branches | merged WI11 + PR #15 `main` | first full audit merged via PR #16; second independent pass in progress |\n",
)

print('Second-pass audit patch applied.')
