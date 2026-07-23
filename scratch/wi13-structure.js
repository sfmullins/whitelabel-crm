const fs=require('node:fs');const path=require('node:path');const root=path.resolve(__dirname,'..');
const required=[
'release.config.json','shared/src/release.ts','backend/src/application/release/ReleaseMetadata.ts','backend/src/presentation/routes/release.ts','frontend/src/pages/About.tsx',
'docs/work-items/WI13.md','docs/releases/VERSIONING.md','docs/releases/RELEASE-PROCESS.md','docs/releases/RELEASE-CERTIFICATION.md','docs/releases/SUPPORTED-PLATFORMS.md',
'scratch/release-contract.js','scratch/wi13-structure.js'
];
for(const relative of required)if(!fs.existsSync(path.join(root,relative)))throw new Error(`WI13 required file is missing: ${relative}`);
const packageJson=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));for(const script of ['wi13:structure','release:contract'])if(!packageJson.scripts?.[script])throw new Error(`Missing root script: ${script}`);
const shared=JSON.parse(fs.readFileSync(path.join(root,'shared/package.json'),'utf8'));if(!shared.exports?.['./release'])throw new Error('Shared release contract is not exported');
console.log('WI13 release-foundation structure gate passed');
