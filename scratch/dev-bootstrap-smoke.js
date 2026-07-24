'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const rootPackage=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(rootPackage.scripts.predev,'npm run dev:prepare','The root dev command must prepare runtime workspace artifacts first');
assert.match(rootPackage.scripts['dev:prepare']||'',/build -w shared/,'dev:prepare must build the shared runtime package');

const onboarding=require(path.join(root,'shared','dist','cjs','onboarding.js'));
assert.ok(onboarding.OnboardingStatusSchema,'OnboardingStatusSchema must exist in the built CommonJS runtime');
assert.equal(typeof onboarding.OnboardingStatusSchema.parse,'function','OnboardingStatusSchema must expose parse at runtime');
console.log('Clean-install development bootstrap smoke passed.');
