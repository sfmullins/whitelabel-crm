import fs from 'node:fs';

function patch(path,replacements){
  let text=fs.readFileSync(path,'utf8');
  for(const [search,replacement] of replacements){
    if(!text.includes(search))throw new Error(`Missing WI7 finalisation target in ${path}: ${search.slice(0,140)}`);
    text=text.replace(search,replacement);
  }
  fs.writeFileSync(path,text);
}

patch('backend/src/infrastructure/database/seed.ts',[[
`  sqlite.exec(\`
    DELETE FROM match_suggestions; DELETE FROM email_attachments; DELETE FROM email_messages; DELETE FROM email_threads;
    DELETE FROM calendar_events; DELETE FROM calendars; DELETE FROM synchronization_runs; DELETE FROM communication_accounts;
    DELETE FROM workflow_action_runs; DELETE FROM workflow_runs; DELETE FROM workflow_definitions;`,
`  sqlite.exec(\`
    DELETE FROM maintenance_runs; DELETE FROM calendar_write_operations;
    DELETE FROM outbound_email_attempts; DELETE FROM email_draft_documents; DELETE FROM email_drafts;
    DELETE FROM match_suggestions; DELETE FROM email_attachments; DELETE FROM email_messages; DELETE FROM email_threads;
    DELETE FROM calendar_events; DELETE FROM calendars; DELETE FROM synchronization_runs; DELETE FROM communication_accounts;
    DELETE FROM workflow_action_runs; DELETE FROM workflow_runs; DELETE FROM workflow_definitions;`
],[
"  console.log(`WI6 seed complete. Acme Ltd connected communications are ready; today is ${today}.`);",
"  console.log(`WI7 seed complete. Acme Ltd communications hub is ready; today is ${today}.`);"
]]);

patch('backend/src/infrastructure/integrations/SmtpSendAdapter.ts',[[
`    const smtpUrl = String(config.settings.smtpUrl ?? '');
    if (!smtpUrl) throw new Error('SMTP endpoint is not configured for this email account');`,
`    const configuredSmtpUrl = String(config.settings.smtpUrl ?? '').trim();
    const smtpUrl = configuredSmtpUrl || (() => {
      const inbound = new URL(config.serverUrl);
      return \`smtps://\${inbound.hostname}:465\`;
    })();`
]]);

patch('frontend/src/pages/Integrations.tsx',[[
`  const [password, setPassword] = useState('');
  const [error, setError] = useState('');`,
`  const [password, setPassword] = useState('');
  const [smtpUrl, setSmtpUrl] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [error, setError] = useState('');`
],[
`        settings: kind === 'email' ? { mailbox: 'INBOX', batchSize: 100 } : {},`,
`        settings: kind === 'email' ? {
          mailbox: 'INBOX',
          batchSize: 100,
          smtpUrl: smtpUrl.trim() || undefined,
          fromAddress: fromAddress.trim() || username.trim(),
        } : {},`
],[
`          <Input required placeholder="Username" value={username} onChange={(event) => setUsername(event.target.value)} />
          <Input
            required
            type="password"`,
`          <Input required placeholder="Username" value={username} onChange={(event) => { setUsername(event.target.value); if (!fromAddress) setFromAddress(event.target.value); }} />
          {kind === 'email' && <>
            <Input placeholder="smtps://mail.example.com:465 (optional standard fallback)" value={smtpUrl} onChange={(event) => setSmtpUrl(event.target.value)} />
            <Input type="email" placeholder="Outbound From address" value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} />
          </>}
          <Input
            required
            type="password"`
]]);

patch('frontend/src/pages/Communications.tsx',[[
`import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';`,
`import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';`
],[
`  const client=useQueryClient();
  const [organisationId,setOrganisationId]=useState('');
  const [channel,setChannel]=useState('');
  const [view,setView]=useState<View>('timeline');
  const [showCreate,setShowCreate]=useState(false);`,
`  const client=useQueryClient();
  const [searchParams]=useSearchParams();
  const [organisationId,setOrganisationId]=useState(searchParams.get('organisationId')??'');
  const [channel,setChannel]=useState(searchParams.get('channel')??'');
  const requestedView=searchParams.get('view');
  const [view,setView]=useState<View>(requestedView==='drafts'||requestedView==='meetings'?requestedView:'timeline');
  const [showCreate,setShowCreate]=useState(searchParams.get('action')==='compose');`
]]);

console.log('Applied WI7 final seed, SMTP and hub-view refinements.');
