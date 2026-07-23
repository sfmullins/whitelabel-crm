const assert=require('node:assert/strict');
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
