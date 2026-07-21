import fs from 'node:fs';
const path='scratch/wi5-patch.mjs';
let value=fs.readFileSync(path,'utf8');
const original="function replace(path,search,replacement){const value=read(path);if(!value.includes(search))throw new Error(`Missing WI5 patch target in ${path}: ${search.slice(0,120)}`);write(path,value.replace(search,replacement));}";
const replacement="function replace(path,search,replacement){const value=read(path);if(value.includes(replacement))return;if(!value.includes(search))throw new Error(`Missing WI5 patch target in ${path}: ${search.slice(0,120)}`);write(path,value.replace(search,replacement));}";
if(value.includes(original)){value=value.replace(original,replacement);fs.writeFileSync(path,value);}
else if(!value.includes(replacement)){throw new Error('Could not make WI5 patcher idempotent');}
console.log('WI5 patcher is idempotent.');
