const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
const readJson=(relative)=>JSON.parse(fs.readFileSync(path.join(root,relative),'utf8'));
const rootPackage=readJson('package.json');const config=readJson('release.config.json');
const semver=/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
if(!semver.test(rootPackage.version))throw new Error(`Root version is not semantic: ${rootPackage.version}`);
for(const workspace of rootPackage.workspaces){const pkg=readJson(`${workspace}/package.json`);if(pkg.version!==rootPackage.version)throw new Error(`${workspace}/package.json version ${pkg.version} differs from authoritative root version ${rootPackage.version}`);}
for(const [key,value] of Object.entries({minimumProfileVersion:config.minimumProfileVersion,minimumDatabaseVersion:config.minimumDatabaseVersion,extensionApiVersion:config.extensionApiVersion}))if(!Number.isInteger(value)||value<1)throw new Error(`${key} must be a positive integer`);
if(!/^>=\d+\.\d+\.\d+ <\d+\.\d+\.\d+$/.test(config.supportedClientRange))throw new Error('supportedClientRange must be an explicit bounded range');
const tag=process.env.GITHUB_REF_TYPE==='tag'?process.env.GITHUB_REF_NAME:'';
if(tag){const version=tag.replace(/^v/,'');if(version!==rootPackage.version)throw new Error(`Tag ${tag} does not match package version ${rootPackage.version}`);const channel=process.env.CRM_RELEASE_CHANNEL;if(channel==='candidate'&&!/-rc\.\d+$/.test(version))throw new Error('Candidate tags require -rc.N');if(channel==='stable'&&version.includes('-'))throw new Error('Stable tags cannot be prereleases');}
console.log(`Release contract verified for ${config.productName} ${rootPackage.version}`);
