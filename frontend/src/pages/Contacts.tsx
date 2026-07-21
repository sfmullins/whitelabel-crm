import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Mail, Search, Star, UserRound } from 'lucide-react';
import type { ContactDirectoryResponse } from 'shared';
import { api } from '../lib/api';
import { buildQueryString } from '../lib/wi4';
import { Input } from '../components/ui/input';

export default function Contacts() {
  const [params, setParams] = useSearchParams();
  const query = useMemo(() => ({
    search: params.get('search') || undefined,
    status: params.get('status') || undefined,
    includeArchived: params.get('includeArchived') === 'true',
    limit: 100,
    offset: Number(params.get('offset') || 0),
  }), [params]);
  const contacts = useQuery<ContactDirectoryResponse>({
    queryKey: ['workspace-contacts', query],
    queryFn: () => api.get(`/api/workspace/contacts${buildQueryString(query)}`),
  });
  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key); else next.set(key, value);
    setParams(next);
  };

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-extrabold tracking-tight">Contacts</h1><p className="mt-1 text-sm text-muted-foreground">People in the context of their organisation.</p></div>
    <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm md:grid-cols-[2fr_1fr_auto]">
      <label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={query.search ?? ''} onChange={(e) => setFilter('search', e.target.value)} placeholder="Search name, email or role"/></label>
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={query.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
      <label className="flex items-center gap-2 px-2 text-xs text-muted-foreground"><input type="checkbox" checked={query.includeArchived} onChange={(e) => setFilter('includeArchived', e.target.checked ? 'true' : undefined)}/>Archived</label>
    </div>
    {contacts.isLoading ? <State text="Loading contacts…"/> : contacts.isError ? <State text={(contacts.error as Error).message} danger/> : (
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b px-5 py-3 text-xs text-muted-foreground">{contacts.data?.total ?? 0} contacts</div>
        {(contacts.data?.items.length ?? 0) === 0 ? <State text="No contacts match this view."/> : <div className="divide-y">
          {contacts.data?.items.map((contact) => <Link key={contact.id} to={`/organisations/${contact.organisationId}?tab=contacts&contactId=${contact.id}`} className="grid gap-4 p-5 hover:bg-muted/40 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="flex min-w-0 gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><UserRound className="h-4 w-4"/></div><div className="min-w-0"><p className="flex items-center gap-1 font-bold truncate">{`${contact.firstName ?? ''} ${contact.lastName ?? ''}`.trim() || contact.email || 'Unnamed contact'}{contact.isPrimary && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500"/>}</p><p className="text-xs text-muted-foreground truncate">{contact.jobTitle || 'Role not recorded'}</p></div></div>
            <div><p className="text-[10px] uppercase text-muted-foreground">Organisation</p><p className="text-sm font-medium truncate">{contact.organisationName}</p></div>
            <div><p className="text-[10px] uppercase text-muted-foreground">Contact</p><p className="flex items-center gap-1 text-sm truncate">{contact.email ? <><Mail className="h-3.5 w-3.5"/>{contact.email}</> : contact.phone || 'Not recorded'}</p></div>
          </Link>)}
        </div>}
      </div>
    )}
  </div>;
}
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-xl border p-10 text-center text-sm ${danger ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'text-muted-foreground'}`}>{text}</div>; }
