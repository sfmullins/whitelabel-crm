const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { isAllowedExternalUrl, isAllowedNavigation, isPathWithinRoot } = require('../desktop/dist/securityPolicy.js');

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'whitelabel-crm-security-'));
const root = path.join(fixture, 'user-data');
const outside = path.join(fixture, 'outside');
fs.mkdirSync(path.join(root, 'backups'), { recursive: true });
fs.mkdirSync(outside, { recursive: true });
fs.symlinkSync(outside, path.join(root, 'outside-link'), 'dir');

try {
  assert.equal(isPathWithinRoot(root, root), true);
  assert.equal(isPathWithinRoot(root, path.join(root, 'backups', 'snapshot.db')), true);
  assert.equal(isPathWithinRoot(root, path.resolve(root, '..', 'outside.db')), false);
  assert.equal(isPathWithinRoot(root, `${root}-prefix-collision/file`), false);
  assert.equal(isPathWithinRoot(root, path.join(root, 'outside-link')), false);

  const appUrl = 'http://127.0.0.1:43123';
  assert.equal(isAllowedNavigation(`${appUrl}/settings`, appUrl), true);
  assert.equal(isAllowedNavigation('http://127.0.0.1:43124', appUrl), false);
  assert.equal(isAllowedNavigation('http://localhost:43123', appUrl), false);
  assert.equal(isAllowedNavigation('file:///tmp/attack.html', appUrl), false);
  assert.equal(isAllowedExternalUrl('https://example.com/help'), true);
  assert.equal(isAllowedExternalUrl('mailto:support@example.com'), true);
  assert.equal(isAllowedExternalUrl('file:///tmp/attack.html'), false);
  assert.equal(isAllowedExternalUrl('javascript:alert(1)'), false);
} finally {
  fs.rmSync(fixture, { recursive: true, force: true });
}

console.log('Desktop security policy smoke passed.');
