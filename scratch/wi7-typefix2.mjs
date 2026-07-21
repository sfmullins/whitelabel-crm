import fs from 'node:fs';
const path='backend/src/application/services/CommunicationsHubService.ts';
let text=fs.readFileSync(path,'utf8');
const replacements=[
  ["draft.documents.map((document)=>","draft.documents.map((document:{documentId:string})=>"],
  ["inReplyTo:original?.rfcMessageId??null","inReplyTo:original?.rfcMessageId?String(original.rfcMessageId):null"],
  ["sourceId:stored.id,eventId:stored.id","sourceId:String(stored.id),eventId:String(stored.id)"],
];
for(const [search,replacement] of replacements){if(!text.includes(search))throw new Error(`Missing WI7 final type target: ${search}`);text=text.replace(search,replacement);}
fs.writeFileSync(path,text);
console.log('Applied WI7 final service type conversions.');
