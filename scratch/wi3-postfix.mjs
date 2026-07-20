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

replaceRequired(
  'shared/src/types.ts',
  `export const IsoTimestampSchema = z.string().trim().superRefine((value, ctx) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Timestamp must be a valid ISO-8601 value' });
  }
}).transform((value) => new Date(value).toISOString());`,
  `export const IsoTimestampSchema = z.string()
  .trim()
  .datetime({ offset: true, message: 'Timestamp must be a valid ISO-8601 value' })
  .transform((value) => new Date(value).toISOString());`,
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  `              {areActivitiesLoading ? (
                <div className="border border-dashed rounded-xl p-8 text-center text-muted-foreground text-sm">
                  Loading activity history...
                </div>
              ) : activitiesFailed ? (
                <div className="border border-destructive/30 bg-destructive/5 rounded-xl p-8 text-center text-destructive text-sm">
                  Activity history could not be loaded.
                </div>
              ) : timelineFeed.length === 0 ? (`,
  `              {areActivitiesLoading && (
                <div className="border border-dashed rounded-xl p-4 text-center text-muted-foreground text-sm">
                  Loading activity history...
                </div>
              )}
              {activitiesFailed && (
                <div className="border border-destructive/30 bg-destructive/5 rounded-xl p-4 text-center text-destructive text-sm">
                  Activity history could not be loaded. Existing appointment and invoice history remains available below.
                </div>
              )}
              {timelineFeed.length === 0 ? (
                !areActivitiesLoading && !activitiesFailed ? (`,
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  `                </div>
              ) : (
                <div className="relative border-l border-border/80 pl-6 ml-4 space-y-8 py-2">`,
  `                </div>
                ) : null
              ) : (
                <div className="relative border-l border-border/80 pl-6 ml-4 space-y-8 py-2">`,
);

replaceRequired(
  'backend/src/infrastructure/database/LegacyCustomerMappingRepository.ts',
  `export function normaliseLegacyCompany(value: string): { displayName: string; sourceKey: string } {
  const displayName = value.trim().normalize('NFKC').replace(/\\s+/g, ' ');
  return {
    displayName,
    sourceKey: \`company:\${displayName.toLocaleLowerCase('en')}\`,
  };
}`,
  `export function normaliseLegacyCompany(value: string): { displayName: string; sourceKey: string } {
  const displayName = value.trim();
  const comparisonName = displayName.normalize('NFKC').replace(/\\s+/g, ' ');
  return {
    displayName,
    sourceKey: \`company:\${comparisonName.toLocaleLowerCase('en')}\`,
  };
}`,
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  `  Layers, PlusCircle, Edit2, X
} from 'lucide-react';`,
  `  Layers, PlusCircle, Edit2, X, type LucideIcon
} from 'lucide-react';`,
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  `import { Customer, Booking, Service, Invoice, CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord, Activity, ActivityType } from 'shared';

export default function CustomerWorkspace() {`,
  `import { Customer, Booking, Service, Invoice, CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord, Activity, ActivityType } from 'shared';

type TimelineItem = {
  id?: string;
  type: 'booking' | 'invoice' | 'activity';
  title: string;
  description: string;
  date: string;
  icon: LucideIcon;
  color: string;
  author?: string;
  followUpDate?: string | null;
};

export default function CustomerWorkspace() {`,
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  `    onError: (err: any) => {
      setActivityError(err.message || 'Failed to log activity');
    },`,
  `    onError: (error: unknown) => {
      setActivityError(error instanceof Error ? error.message : 'Failed to log activity');
    },`,
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  '    const feed: any[] = [];',
  '    const feed: TimelineItem[] = [];',
);

replaceRequired(
  'frontend/src/pages/CustomerWorkspace.tsx',
  `{item.date.includes('T') ? item.date.split('T')[0] : item.date}`,
  `{item.type === 'activity'
    ? new Date(item.date).toLocaleString()
    : (item.date.includes('T') ? item.date.split('T')[0] : item.date)}`,
);
