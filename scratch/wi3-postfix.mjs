import fs from 'node:fs';

// One-time branch finaliser. Removed after the validated workspace commit.
function replaceOnce(filePath, search, replacement) {
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.includes(search)) return false;
  fs.writeFileSync(filePath, content.replace(search, replacement));
  return true;
}

const workspace = 'frontend/src/pages/CustomerWorkspace.tsx';

replaceOnce(
  workspace,
  `  Layers, PlusCircle, Edit2, X
} from 'lucide-react';`,
  `  Layers, PlusCircle, Edit2, X, type LucideIcon
} from 'lucide-react';`,
);

replaceOnce(
  workspace,
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

replaceOnce(workspace, `  const [notes, setNotes] = useState('');
`, '');
replaceOnce(workspace, `      setNotes(customer.notes || '');
`, '');
replaceOnce(workspace, `      notes: notes || undefined,
`, '');

replaceOnce(
  workspace,
  `            {/* Profile Clean Notes */}
            {customer.notes && (
              <div className="pt-4 border-t border-border/40 space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-wider">Profile Background</p>
                {/* Remove timestamp logs from pure profile notes for rendering in sidebar */}
                <p className="text-xs text-foreground/80 leading-relaxed bg-muted/30 p-3 rounded-lg border border-border/20 whitespace-pre-line max-h-40 overflow-y-auto">
                  {customer.notes.replace(/\[Note logged on [^\]]+\]:\n[\s\S]+?(?=\n\n\[Note logged on|$)/g, '').trim() || 'No background summary logged.'}
                </p>
              </div>
            )}
`,
  '',
);

replaceOnce(
  workspace,
  `                <div className="space-y-1">
                  <label className="text-xs font-semibold">Internal Notes</label>
                  <textarea 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full min-h-[80px] p-3 text-sm bg-background border border-input rounded-lg focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                  />
                </div>
`,
  '',
);

replaceOnce(
  workspace,
  `    onError: (err: any) => {
      setActivityError(err.message || 'Failed to log activity');
    },`,
  `    onError: (error: unknown) => {
      setActivityError(error instanceof Error ? error.message : 'Failed to log activity');
    },`,
);

replaceOnce(workspace, '    const feed: any[] = [];', '    const feed: TimelineItem[] = [];');

replaceOnce(
  workspace,
  `{item.date.includes('T') ? item.date.split('T')[0] : item.date}`,
  `{item.type === 'activity'
    ? new Date(item.date).toLocaleString()
    : (item.date.includes('T') ? item.date.split('T')[0] : item.date)}`,
);

const finalContent = fs.readFileSync(workspace, 'utf8');
for (const forbidden of [
  "const [notes, setNotes]",
  "setNotes(customer.notes",
  "notes: notes || undefined",
  "customer.notes.replace(",
  "value={notes}",
  "setNotes(e.target.value)",
]) {
  if (finalContent.includes(forbidden)) {
    throw new Error(`Legacy customer notes UI remains: ${forbidden}`);
  }
}

console.log('WI3 customer workspace finalisation applied.');
