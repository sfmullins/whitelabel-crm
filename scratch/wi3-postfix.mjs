import fs from 'node:fs';

function replaceRequired(filePath, search, replacement) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(search)) return;
  fs.writeFileSync(filePath, content.replace(search, replacement));
}

replaceRequired(
  'shared/src/types.ts',
  'followUpDate: nullableIsoDateOnlyScheme,',
  'followUpDate: nullableIsoDateOnlySchema,',
);
