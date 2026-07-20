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
              {timelineFeed.length === 0 && !areActivitiesLoading && !activitiesFailed ? (`,
);
