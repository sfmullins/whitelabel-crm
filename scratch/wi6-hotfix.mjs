import fs from 'node:fs';
function replace(path,search,replacement){const value=fs.readFileSync(path,'utf8');if(value.includes(replacement))return;if(!value.includes(search))throw new Error(`Missing WI6 hotfix target in ${path}: ${search}`);fs.writeFileSync(path,value.replace(search,replacement));}
replace('backend/src/infrastructure/integrations/ImapSyncAdapter.ts',`      const socket=tls.connect({...options,minVersion:'TLSv1.2',rejectUnauthorized:true},()=>resolve(socket));`,`      const socket:tls.TLSSocket=tls.connect({...options,minVersion:'TLSv1.2',rejectUnauthorized:true},()=>resolve(socket));`);
replace('backend/src/test/wi6-connected-communications.spec.ts',`path.join(path.dirname(getTempDatabasePath()),'vault-calendar')`,`path.join(getRuntimePaths().dataDirectory,'vault-calendar')`);
console.log('Applied WI6 compile hotfixes.');
