import fs from 'node:fs';
function replace(path,search,replacement){const value=fs.readFileSync(path,'utf8');if(value.includes(replacement))return;if(!value.includes(search))throw new Error(`Missing WI5 hotfix2 target: ${search}`);fs.writeFileSync(path,value.replace(search,replacement));}
const path='backend/src/presentation/routes/operational.ts';
replace(path,`    res.json(work.listTasks(query));`,`    res.json(work.listTasks({ organisationId: query.organisationId,includeArchived: query.includeArchived === true }));`);
replace(path,`    res.json(work.listReminders(query));`,`    res.json(work.listReminders({ status: query.status,dueOnly: query.dueOnly === true }));`);
replace(path,`    res.json(documents.list(query));`,`    res.json(documents.list({ organisationId: query.organisationId,includeArchived: query.includeArchived === true }));`);
replace(path,`    res.json(communications.list(query));`,`    res.json(communications.list({ organisationId: query.organisationId,channel: query.channel,status: query.status,includeArchived: query.includeArchived === true,limit: query.limit }));`);
console.log('Applied WI5 boolean query hotfixes.');
