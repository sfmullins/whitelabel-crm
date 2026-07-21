import fs from 'node:fs';

function replaceRequired(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (source.includes(replacement)) return;
  if (!source.includes(search)) {
    throw new Error(`WI4 correction target missing in ${filePath}: ${search}`);
  }
  fs.writeFileSync(filePath, source.replace(search, replacement));
}

replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  "row.follow_up_date < today",
  "String(row.follow_up_date) < today",
);
replaceRequired(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  "row.follow_up_date === today",
  "String(row.follow_up_date) === today",
);
replaceRequired(
  'backend/src/presentation/routes/workspace.ts',
  "  includeArchived: includeArchivedQueryField,\n  sort: z.enum(['name_asc', 'updated_desc', 'recent_activity', 'next_follow_up']).default('name_asc'),\n  ...paginationQueryFields,",
  "  sort: z.enum(['name_asc', 'updated_desc', 'recent_activity', 'next_follow_up']).default('name_asc'),\n  ...paginationQueryFields,",
);
replaceRequired(
  'backend/src/presentation/routes/workspace.ts',
  "  search: optionalString,\n  includeArchived: includeArchivedQueryField,\n  ...paginationQueryFields,",
  "  search: optionalString,\n  ...paginationQueryFields,",
);

console.log('Applied WI4 compile corrections.');
