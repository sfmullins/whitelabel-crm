import fs from 'node:fs';

// One-time branch finaliser. Removed after the validated workspace commit.
const workspace = 'frontend/src/pages/CustomerWorkspace.tsx';
let content = fs.readFileSync(workspace, 'utf8');

content = content.replace(
  /  Layers, PlusCircle, Edit2, X\r?\n} from 'lucide-react';/,
  `  Layers, PlusCircle, Edit2, X, type LucideIcon
} from 'lucide-react';`,
);

if (!content.includes('type TimelineItem = {')) {
  content = content.replace(
    /(import \{ Customer, Booking, Service, Invoice, CustomFieldDefinition, CustomObjectDefinition, CustomObjectRecord, Activity, ActivityType \} from 'shared';\r?\n)/,
    `$1
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
`,
  );
}

content = content
  .replace(/  const \[notes, setNotes\] = useState\(''\);\r?\n/, '')
  .replace(/      setNotes\(customer\.notes \|\| ''\);\r?\n/, '')
  .replace(/      notes: notes \|\| undefined,\r?\n/, '')
  .replace(
    /\r?\n\s*\{\/\* Profile Clean Notes \*\/\}\r?\n\s*\{customer\.notes && \(\r?\n[\s\S]*?\r?\n\s*\)\}\r?\n/,
    '\n',
  )
  .replace(
    /\r?\n\s*<div className="space-y-1">\r?\n\s*<label className="text-xs font-semibold">Internal Notes<\/label>\r?\n[\s\S]*?\r?\n\s*<\/div>\r?\n/,
    '\n',
  )
  .replace(
    /    onError: \(err: any\) => \{\r?\n      setActivityError\(err\.message \|\| 'Failed to log activity'\);\r?\n    },/,
    `    onError: (error: unknown) => {
      setActivityError(error instanceof Error ? error.message : 'Failed to log activity');
    },`,
  )
  .replace('    const feed: any[] = [];', '    const feed: TimelineItem[] = [];')
  .replace(
    `{item.date.includes('T') ? item.date.split('T')[0] : item.date}`,
    `{item.type === 'activity'
    ? new Date(item.date).toLocaleString()
    : (item.date.includes('T') ? item.date.split('T')[0] : item.date)}`,
  );

for (const forbidden of [
  'const [notes, setNotes]',
  'setNotes(customer.notes',
  'notes: notes || undefined',
  'customer.notes.replace(',
  'value={notes}',
  'setNotes(e.target.value)',
  'Internal Notes</label>',
]) {
  if (content.includes(forbidden)) {
    throw new Error(`Legacy customer notes UI remains: ${forbidden}`);
  }
}

if (!content.includes("type TimelineItem = {") || !content.includes('type LucideIcon')) {
  throw new Error('Timeline typing finalisation did not apply');
}

fs.writeFileSync(workspace, content);
console.log('WI3 customer workspace finalisation applied.');
