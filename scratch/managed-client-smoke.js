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
const envelope={profile,checksum,signature:crypto.sign(null,Buffer.from(serialized),pair.privateKey).toString('base64'),publicKey:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),algorithm:'Ed25519'};
const verified=verifyDeploymentProfile(envelope,{currentClientVersion:'1.0.0'});
assert.equal(verified.profile.instanceId,profile.instanceId);
assert.throws(()=>verifyDeploymentProfile({...envelope,checksum:'0'.repeat(64)}),/checksum/);
assert.throws(()=>verifyDeploymentProfile({...envelope,profile:{...profile,instanceUrl:'http://crm.example.test'}}),/checksum|HTTPS/);
assert.throws(()=>verifyDeploymentProfile(envelope,{currentClientVersion:'0.9.9'}),/older than required/);
const resignedProfile={...profile,instanceUrl:'http://127.0.0.1:5000'};const resignedJson=JSON.stringify(canonicalize(resignedProfile));const resigned={profile:resignedProfile,checksum:crypto.createHash('sha256').update(resignedJson).digest('hex'),signature:crypto.sign(null,Buffer.from(resignedJson),pair.privateKey).toString('base64'),publicKey:envelope.publicKey,algorithm:'Ed25519'};
assert.throws(()=>verifyDeploymentProfile(resigned),/HTTPS/);
assert.equal(verifyDeploymentProfile(resigned,{allowInsecureManaged:true}).profile.instanceUrl,'http://127.0.0.1:5000');
console.log('WI12 managed-client profile smoke passed');
