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

replaceIfPresent(
  'frontend/src/lib/wi4.test.ts',
  "import { buildQueryString, groupSearchResults } from './wi4';",
  "import type { SearchResult } from 'shared';\nimport { buildQueryString, groupSearchResults } from './wi4';",
);
replaceIfPresent(
  'frontend/src/lib/wi4.test.ts',
  "matchedFields: ['title'] as const",
  "matchedFields: ['title'] as SearchResult['matchedFields']",
);
replaceIfPresent(
  'frontend/src/lib/wi4.test.ts',
  "matchedFields: ['title'],",
  "matchedFields: ['title'] as SearchResult['matchedFields'],",
);
replaceIfPresent(
  'frontend/src/pages/OrganisationWorkspace.tsx',
  "import { FormEvent, useMemo, useState } from 'react';",
  "import { useMemo, useState } from 'react';",
);
replaceIfPresent(
  'frontend/src/pages/OrganisationWorkspace.tsx',
  "import { Archive, BriefcaseBusiness, Building2, CalendarClock, ExternalLink, Mail, MessageSquare, Pencil, Plus, Star, UserRound } from 'lucide-react';",
  "import { Archive, BriefcaseBusiness, Building2, ExternalLink, Mail, MessageSquare, Pencil, Star, UserRound } from 'lucide-react';",
);
replaceIfPresent(
  'frontend/src/pages/OrganisationWorkspace.tsx',
  "const primaryName = data.primaryContact ? `${data.primaryContact.firstName ?? ''} ${data.primaryContact.lastName ?? ''}`.trim() || data.primaryContact.email : 'Not assigned';",
  "const primaryName = data.primaryContact ? `${data.primaryContact.firstName ?? ''} ${data.primaryContact.lastName ?? ''}`.trim() || data.primaryContact.email || 'Unnamed contact' : 'Not assigned';",
);
replaceIfPresent(
  'frontend/src/pages/Organisations.tsx',
  "import { Archive, Building2, Filter, Plus, Save, Search } from 'lucide-react';",
  "import { Building2, Filter, Plus, Save, Search } from 'lucide-react';",
);

const smokePath = 'scratch/wi4-smoke.ts';
let smokeSource = fs.readFileSync(smokePath, 'utf8');
if (!smokeSource.includes('async function main()')) {
  smokeSource = smokeSource
    .replace("const temp = fs.mkdtempSync", "async function main() {\n  const temp = fs.mkdtempSync")
    .replace(/\n}\s*$/, `\n  }\n}\n\nmain().catch((error: unknown) => {\n  console.error(error);\n  process.exitCode = 1;\n});\n`);
}
smokeSource = smokeSource.replace("path.resolve('backend/drizzle')", "path.resolve('drizzle')");
fs.writeFileSync(smokePath, smokeSource);

console.log('Applied WI4 compile and smoke corrections.');
