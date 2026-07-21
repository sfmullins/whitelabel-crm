import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Link2, Mail, RefreshCw, Server, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface Account {
  id: string;
  kind: 'email' | 'calendar';
  name: string;
  serverUrl: string;
  username: string;
  healthStatus: string;
  lastSyncAt: string | null;
  lastError: string | null;
  enabled: boolean;
}

interface SyncRun {
  id: string;
  accountName: string;
  syncType: string;
  status: string;
  fetchedCount: number;
  createdCount: number;
  matchedCount: number;
  failureCount: number;
  startedAt: string;
}

interface Suggestion {
  id: string;
  sourceType: string;
  sourceId: string;
  organisationName: string | null;
  contactName: string | null;
  reason: string;
  confidence: number;
}

export default function Integrations() {
  const client = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState('');

  const accounts = useQuery<Account[]>({
    queryKey: ['communication-accounts'],
    queryFn: () => api.get('/api/communication-accounts'),
  });
  const runs = useQuery<SyncRun[]>({
    queryKey: ['synchronization-runs'],
    queryFn: () => api.get('/api/synchronization-runs?limit=50'),
  });
  const suggestions = useQuery<Suggestion[]>({
    queryKey: ['match-suggestions'],
    queryFn: () => api.get('/api/match-suggestions?status=pending'),
  });

  const action = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api.post(path, body ?? {}),
    onSuccess: () => {
      setError('');
      client.invalidateQueries({ queryKey: ['communication-accounts'] });
      client.invalidateQueries({ queryKey: ['synchronization-runs'] });
      client.invalidateQueries({ queryKey: ['match-suggestions'] });
      client.invalidateQueries({ queryKey: ['email-threads'] });
      client.invalidateQueries({ queryKey: ['calendar-events'] });
    },
    onError: (value: Error) => setError(value.message),
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Connected accounts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Standards-based email and calendar synchronization with encrypted local credentials.
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Link2 className="mr-2 h-4 w-4" />
          Connect account
        </Button>
      </header>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        {accounts.isLoading ? (
          <State text="Loading accounts…" />
        ) : !accounts.data?.length ? (
          <State text="No connected accounts." />
        ) : (
          accounts.data.map((account) => (
            <article key={account.id} className="rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    {account.kind === 'email' ? <Mail className="h-5 w-5" /> : <CalendarDays className="h-5 w-5" />}
                  </div>
                  <div>
                    <h2 className="font-bold">{account.name}</h2>
                    <p className="text-xs text-muted-foreground">
                      {account.username} · {account.serverUrl}
                    </p>
                  </div>
                </div>
                <span
                  className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${
                    account.healthStatus === 'healthy'
                      ? 'bg-emerald-100 text-emerald-700'
                      : account.healthStatus === 'failed'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {account.healthStatus}
                </span>
              </div>

              {account.lastError && (
                <p className="mt-3 rounded bg-red-50 p-2 text-xs text-red-700">{account.lastError}</p>
              )}
              <p className="mt-4 text-xs text-muted-foreground">
                Last sync: {account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : 'Never'}
              </p>
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => action.mutate({ path: `/api/communication-accounts/${account.id}/test` })}
                >
                  <ShieldCheck className="mr-1 h-4 w-4" />
                  Test
                </Button>
                <Button
                  size="sm"
                  onClick={() => action.mutate({ path: `/api/communication-accounts/${account.id}/sync` })}
                >
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Sync
                </Button>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="font-bold">Unresolved matches</h2>
          {!suggestions.data?.length ? (
            <State text="No pending suggestions." />
          ) : (
            suggestions.data.map((item) => (
              <article key={item.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">
                      {item.organisationName || 'Unknown organisation'}
                      {item.contactName ? ` · ${item.contactName}` : ''}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.reason} · {item.confidence}% confidence
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => action.mutate({ path: `/api/match-suggestions/${item.id}/reject` })}
                  >
                    Reject
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="space-y-3">
          <h2 className="font-bold">Synchronization history</h2>
          {!runs.data?.length ? (
            <State text="No synchronization runs." />
          ) : (
            runs.data.slice(0, 20).map((run) => (
              <article key={run.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold">{run.accountName}</p>
                    <p className="text-xs text-muted-foreground">
                      {run.syncType} · {new Date(run.startedAt).toLocaleString()}
                    </p>
                  </div>
                  <span className="text-xs font-bold uppercase">{run.status}</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Fetched {run.fetchedCount} · created {run.createdCount} · matched {run.matchedCount} · failed{' '}
                  {run.failureCount}
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      {showCreate && (
        <AccountDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            client.invalidateQueries({ queryKey: ['communication-accounts'] });
          }}
        />
      )}
    </div>
  );
}

function AccountDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<'email' | 'calendar'>('email');
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [smtpUrl, setSmtpUrl] = useState('');
  const [fromAddress, setFromAddress] = useState('');
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/communication-accounts', {
        kind,
        name,
        serverUrl,
        username,
        password,
        settings: kind === 'email' ? {
          mailbox: 'INBOX',
          batchSize: 100,
          smtpUrl: smtpUrl.trim() || undefined,
          fromAddress: fromAddress.trim() || username.trim(),
        } : {},
      }),
    onSuccess: onCreated,
    onError: (value: Error) => setError(value.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl">
        <div className="flex justify-between">
          <div>
            <h2 className="text-xl font-bold">Connect account</h2>
            <p className="text-xs text-muted-foreground">
              Credentials are encrypted in the local application-data directory.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close account dialog">×</button>
        </div>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <select
            value={kind}
            onChange={(event) => {
              const next = event.target.value as 'email' | 'calendar';
              setKind(next);
              setServerUrl(next === 'email' ? 'imaps://' : 'https://');
            }}
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
          >
            <option value="email">Email (IMAP)</option>
            <option value="calendar">Calendar (CalDAV)</option>
          </select>
          <Input required placeholder="Account name" value={name} onChange={(event) => setName(event.target.value)} />
          <Input
            required
            placeholder={kind === 'email' ? 'imaps://mail.example.com' : 'https://dav.example.com/calendars/user/'}
            value={serverUrl}
            onChange={(event) => setServerUrl(event.target.value)}
          />
          <Input required placeholder="Username" value={username} onChange={(event) => { setUsername(event.target.value); if (!fromAddress) setFromAddress(event.target.value); }} />
          {kind === 'email' && <>
            <Input placeholder="smtps://mail.example.com:465 (optional standard fallback)" value={smtpUrl} onChange={(event) => setSmtpUrl(event.target.value)} />
            <Input type="email" placeholder="Outbound From address" value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} />
          </>}
          <Input
            required
            type="password"
            placeholder="Password or app password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              Connect
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function State({ text }: { text: string }) {
  return (
    <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
      <Server className="mx-auto mb-2 h-5 w-5" />
      {text}
    </div>
  );
}
