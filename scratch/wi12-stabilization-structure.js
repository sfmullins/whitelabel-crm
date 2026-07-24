'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=(relative)=>fs.readFileSync(path.join(root,relative),'utf8');
const required=[
  'backend/src/presentation/middleware/instanceLifecycle.ts',
  'backend/src/infrastructure/storage/BrandAssetStore.ts',
  'backend/src/test/wi12-stabilization.spec.ts',
  'frontend/src/features/onboarding/useProvisioningWorkspace.ts',
  'scratch/wi12-proxy-smoke.mjs',
  'docs/work-items/WI12-STABILIZATION.md',
];
for(const relative of required)if(!fs.existsSync(path.join(root,relative)))throw new Error(`WI12 stabilization file is missing: ${relative}`);
const vite=read('frontend/vite.config.ts');
for(const token of ['strictPort: true','changeOrigin: false',"'/branding-assets'"])if(!vite.includes(token))throw new Error(`Development proxy hardening is missing: ${token}`);
const layout=read('frontend/src/components/layouts/MainLayout.tsx');
for(const token of ["queryKey:['onboarding-status']",'canAccessWorkspace','Instance setup in progress'])if(!layout.includes(token))throw new Error(`Authoritative lifecycle gate is missing: ${token}`);
if(layout.includes('needsOnboarding'))throw new Error('Legacy settings-based onboarding gate remains in MainLayout');
const branding=read('frontend/src/hooks/useBranding.ts');
if(branding.includes('ONBOARDING_REQUIRED')||branding.includes('needsOnboarding'))throw new Error('Branding still controls onboarding lifecycle');
const onboardingPage=read('frontend/src/pages/Onboarding.tsx').trim();
if(onboardingPage!=="export { default } from '../features/onboarding/ProvisioningWorkspace';")throw new Error('A duplicate onboarding implementation remains');
const hook=read('frontend/src/features/onboarding/useProvisioningWorkspace.ts');
for(const token of ['expectedChecksum','uploadBrandAsset','savePromise',"setSaveState('conflict')"])if(!hook.includes(token))throw new Error(`Onboarding persistence hardening is missing: ${token}`);
if(/logoUrl\s*:\s*encoded|readAsDataURL/.test(hook))throw new Error('Base64 logo data is still persisted in the onboarding draft');
const seed=read('backend/src/infrastructure/database/seed.ts');
for(const token of ["SeedMode='fresh'|'demo'|'published'",'resetWi12OnboardingState','runSeed(rawMode as SeedMode)'])if(!seed.includes(token))throw new Error(`Seed-mode control is missing: ${token}`);
const app=read('backend/src/presentation/app.ts');
for(const token of ['logCompletedRequest','assessApiOrigin','enforceInstanceLifecycle','requestId'])if(!app.includes(token))throw new Error(`Request boundary hardening is missing: ${token}`);
const pkg=JSON.parse(read('package.json'));
for(const script of ['db:seed:fresh','db:seed:demo','db:seed:published-fixture','wi12:stabilization'])if(!pkg.scripts?.[script])throw new Error(`Root script is missing: ${script}`);
for(const temporary of ['.github/workflows/wi12-stabilization-export.yml','.github/workflows/wi12-stabilization-apply.yml','.github/wi12-stabilization-patch'])if(fs.existsSync(path.join(root,temporary)))throw new Error(`Temporary stabilization transport remains: ${temporary}`);
console.log('WI12 stabilization structure gate passed');
