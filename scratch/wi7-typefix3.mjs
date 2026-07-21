import fs from 'node:fs';
const path='frontend/src/pages/Automation.tsx';
let text=fs.readFileSync(path,'utf8');
for(const [search,replacement] of [
  ["import { Archive, Copy, FlaskConical, Play, Plus, Power, RotateCcw, Workflow } from 'lucide-react';","import { Archive, Copy, FlaskConical, Plus, Power, RotateCcw, Workflow } from 'lucide-react';"],
  ["interface OrganisationDirectory { items:Array<{id:string;name:string}>; }\n",''],
]){if(!text.includes(search))throw new Error(`Missing WI7 frontend type target: ${search}`);text=text.replace(search,replacement);}
fs.writeFileSync(path,text);
console.log('Removed unused WI7 workflow-studio declarations.');
