'use strict';
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {verifyDeploymentProfile}=require('../desktop/dist/deploymentProfile.js');

function canonicalize(value){if(Array.isArray(value))return value.map(canonicalize);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map((key)=>[key,canonicalize(value[key])]));return value;}
const profile={
  schemaVersion:1,
  instanceId:'00000000-0000-4000-8000-000000001200',
  configurationRevision:7,
  deploymentMode:'managed',
  instanceUrl:'https://crm.example.test',
  businessIdentity:{displayName:'Example Operations',legalName:'Example Operations Limited',supportEmail:'support@example.test'},
  branding:{logoUrl:'',compactLogoUrl:'',monochromeLogoUrl:'',primaryColor:'#0f172a',secondaryColor:'#3b82f6',accentColor:'#10b981',surfaceColor:'#ffffff',backgroundColor:'#f8fafc',darkModeEnabled:true,density:'comfortable',radius:'subtle'},
  locale:{language:'en-IE',secondaryLanguages:[],timezone:'Europe/Dublin',currency:'EUR',dateFormat:'DD/MM/YYYY',timeFormat:'24h',weekStartsOn:'monday',financialYearStartMonth:1},
  terminology:{organisation:{singular:'Organisation',plural:'Organisations'},contact:{singular:'Contact',plural:'Contacts'},engagement:{singular:'Engagement',plural:'Engagements'},task:{singular:'Task',plural:'Tasks'}},
  capabilities:['onboarding-v1','signed-deployment-profile'],
  minimumClientVersion:'1.0.0',
  publishedAt:'2026-07-23T12:00:00.000Z',
};
const serialized=JSON.stringify(canonicalize(profile));
const checksum=crypto.createHash('sha256').update(serialized).digest('hex');
const pair=crypto.generateKeyPairSync('ed25519');
const trustedPublicKey=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
const options={currentClientVersion:'1.0.0',trustedPublicKey};
const envelope={profile,checksum,signature:crypto.sign(null,Buffer.from(serialized),pair.privateKey).toString('base64'),publicKey:trustedPublicKey,algorithm:'Ed25519'};
const verified=verifyDeploymentProfile(envelope,options);
assert.equal(verified.profile.instanceId,profile.instanceId);
assert.throws(()=>verifyDeploymentProfile({...envelope,checksum:'0'.repeat(64)},options),/checksum/);
assert.throws(()=>verifyDeploymentProfile({...envelope,profile:{...profile,instanceUrl:'http://crm.example.test'}},options),/checksum|HTTPS/);
assert.throws(()=>verifyDeploymentProfile(envelope,{...options,currentClientVersion:'0.9.9'}),/older than required/);
const attacker=crypto.generateKeyPairSync('ed25519');const attackerPublicKey=attacker.publicKey.export({format:'der',type:'spki'}).toString('base64');const attackerProfile={...profile,businessIdentity:{...profile.businessIdentity,displayName:'Attacker CRM'}};const attackerJson=JSON.stringify(canonicalize(attackerProfile));const resigned={profile:attackerProfile,checksum:crypto.createHash('sha256').update(attackerJson).digest('hex'),signature:crypto.sign(null,Buffer.from(attackerJson),attacker.privateKey).toString('base64'),publicKey:attackerPublicKey,algorithm:'Ed25519'};
assert.throws(()=>verifyDeploymentProfile(resigned,options),/detached trust anchor/);
const loopbackProfile={...profile,instanceUrl:'http://127.0.0.1:5000'};const loopbackJson=JSON.stringify(canonicalize(loopbackProfile));const loopback={profile:loopbackProfile,checksum:crypto.createHash('sha256').update(loopbackJson).digest('hex'),signature:crypto.sign(null,Buffer.from(loopbackJson),pair.privateKey).toString('base64'),publicKey:trustedPublicKey,algorithm:'Ed25519'};
assert.throws(()=>verifyDeploymentProfile(loopback,options),/HTTPS/);
assert.equal(verifyDeploymentProfile(loopback,{...options,allowInsecureManaged:true}).profile.instanceUrl,'http://127.0.0.1:5000');
console.log('WI12 managed-client detached trust-anchor smoke passed');
