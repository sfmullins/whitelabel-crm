'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const required=[
  'shared/src/onboarding.ts',
  'backend/src/infrastructure/database/wi12OnboardingSchema.ts',
  'backend/src/infrastructure/database/OnboardingRepository.ts',
  'backend/src/presentation/routes/onboarding.ts',
  'backend/src/test/wi12-onboarding.spec.ts',
  'frontend/src/pages/Onboarding.tsx',
  'desktop/src/deploymentProfile.ts',
  'scratch/managed-client-smoke.js',
  'docs/work-items/WI12.md',
  'docs/onboarding/INSTANCE-ONBOARDING.md',
  'docs/onboarding/DEPLOYMENT-PROFILES.md',
  'docs/onboarding/MANAGED-CLIENTS.md',
];
for(const relative of required){const target=path.join(root,relative);if(!fs.existsSync(target))throw new Error(`WI12 required file is missing: ${relative}`);}
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const packageJson=JSON.parse(read('package.json'));
for(const script of ['onboarding:verify','deployment:verify','managed-client:smoke','wi12:smoke'])if(!packageJson.scripts?.[script])throw new Error(`WI12 script is missing: ${script}`);
const security=read('backend/src/presentation/middleware/security.ts');
for(const permission of ['onboarding.read','onboarding.manage','deployment.publish','devices.manage'])if(!security.includes(permission))throw new Error(`WI12 permission boundary is not wired: ${permission}`);
const repository=read('backend/src/infrastructure/database/OnboardingRepository.ts');
for(const control of ['createPrePublicationBackup','Ed25519','verifySignedProfile','code_hash','instance_publications'])if(!repository.includes(control))throw new Error(`WI12 lifecycle control is missing: ${control}`);
const desktop=read('desktop/src/main.ts');
if(!desktop.includes("deploymentRuntime.mode==='managed'"))throw new Error('Desktop managed-client runtime is not wired');
if(!desktop.includes('resolveDeploymentRuntime'))throw new Error('Desktop does not verify the deployment bootstrap profile');
const onboarding=read('frontend/src/pages/Onboarding.tsx');
for(const feature of ['Instance readiness','Managed business instance','Live employee preview','Publish signed profile','Create token'])if(!onboarding.includes(feature))throw new Error(`Onboarding experience is missing: ${feature}`);
const prohibited=[/CRM_DEPLOYMENT_PROFILE\s*=\s*['"][^'"]*(password|secret|token)/i,/privateKey\s*:/i];
for(const relative of ['frontend/src/pages/Onboarding.tsx','desktop/src/main.ts'])for(const pattern of prohibited)if(pattern.test(read(relative)))throw new Error(`Secret-bearing deployment content detected in ${relative}`);
console.log('WI12 repository structure gate passed');
