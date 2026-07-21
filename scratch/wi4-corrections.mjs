import fs from 'node:fs';

function replaceIfPresent(filePath, search, replacement) {
  const source = fs.readFileSync(filePath, 'utf8');
  if (!source.includes(search)) return;
  fs.writeFileSync(filePath, source.replace(search, replacement));
}

replaceIfPresent(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  "row.follow_up_date < today",
  "String(row.follow_up_date) < today",
);
replaceIfPresent(
  'backend/src/infrastructure/database/WorkspaceRepository.ts',
  "row.follow_up_date === today",
  "String(row.follow_up_date) === today",
);
replaceIfPresent(
  'backend/src/presentation/routes/workspace.ts',
  "  includeArchived: includeArchivedQueryField,\n  sort: z.enum(['name_asc', 'updated_desc', 'recent_activity', 'next_follow_up']).default('name_asc'),\n  ...paginationQueryFields,",
  "  sort: z.enum(['name_asc', 'updated_desc', 'recent_activity', 'next_follow_up']).default('name_asc'),\n  ...paginationQueryFields,",
);
replaceIfPresent(
  'backend/src/presentation/routes/workspace.ts',
  "  search: optionalString,\n  includeArchived: includeArchivedQueryField,\n  ...paginationQueryFields,",
  "  search: optionalString,\n  ...paginationQueryFields,",
);

console.log('Applied WI4 compile corrections.');
