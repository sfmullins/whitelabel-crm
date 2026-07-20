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
