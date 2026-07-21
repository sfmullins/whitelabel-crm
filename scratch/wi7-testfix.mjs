import fs from 'node:fs';
const path='backend/src/test/wi7-communications-hub.spec.ts';
let text=fs.readFileSync(path,'utf8');
const search="    const dry=service.dryRunWorkflow(String(definition.id),{organisationId:ACME,accountId:EMAIL_ACCOUNT});\n    expect(dry.dryRun).toBe(true);";
const replacement="    const dry=service.dryRunWorkflow(String(definition.id),{organisationId:ACME,accountId:EMAIL_ACCOUNT}) as {dryRun?:boolean};\n    expect(dry.dryRun).toBe(true);";
if(!text.includes(search))throw new Error('Missing WI7 test type target');
fs.writeFileSync(path,text.replace(search,replacement));
console.log('Applied WI7 dry-run test typing.');
