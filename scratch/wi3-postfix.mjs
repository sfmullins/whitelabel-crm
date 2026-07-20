import fs from 'node:fs';

function replaceRequired(filePath, search, replacement) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes(replacement)) return;
  if (!content.includes(search)) {
    throw new Error(`Expected text not found in ${filePath}: ${search}`);
  }
  fs.writeFileSync(filePath, content.replace(search, replacement));
}

replaceRequired(
  'shared/src/types.ts',
  'followUpDate: nullableIsoDateOnlyScheme,',
  'followUpDate: nullableIsoDateOnlySchema,',
);
