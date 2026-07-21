import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Archive, Building2, Filter, Plus, Save, Search } from 'lucide-react';
import type {
  Organisation,
  OrganisationCreate,
  OrganisationDirectoryResponse,
  OrganisationDirectorySort,
  OrganisationStatus,
  SavedView,
} from 'shared';
import { api } from '../lib/api';
import { buildQueryString } from '../lib/wi4';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const statusLabels: Record<OrganisationStatus, string> = {
  prospect: 'Prospect', active_client: 'Active client', past_client: 'Past client', partner: 'Partner', inactive: 'Inactive',
};

const builtInViews = [
  { name: 'All organisations', values: {} },
  { name: 'Prospects', values: { status: 'prospect' } },
  { name: 'Active clients', values: { status: 'active_client' } },
  { name: 'Past clients', values: { status: 'past_client' } },
  { name: 'Recently active', values: { sort: 'recent_activity' } },
  { name: 'Follow-up due', values: { sort: 'next_follow_up' } },
] as const;

export default function Organisations() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [viewName, setViewName] = useState('');
  const [form, setForm] = useState<OrganisationCreate>({ name: '', status: 'prospect' });
  const [error, setError] = useState('');

  const query = useMemo(() => ({
    status: params.get('status') || undefined,
    industry: params.get('industry') || undefined,
    country: params.get('country') || undefined,
    search: params.get('search') || undefined,
    includeArchived: params.get('includeArchived') === 'true',
    sort: (params.get('sort') || 'name_asc') as OrganisationDirectorySort,
    limit: 50,
    offset: Number(params.get('offset') || 0),
  }), [params]);

  const organisations = useQuery<OrganisationDirectoryResponse>({
    queryKey: ['workspace-organisations', query],
    queryFn: () => api.get(`/api/workspace/organisations${buildQueryString(query)}`),
  });
  const savedViews = useQuery<SavedView[]>({
    queryKey: ['saved-views', 'organisations'],
    queryFn: () => api.get('/api/saved-views?context=organisations'),
  });

  const createMutation = useMutation<Organisation, Error, OrganisationCreate>({
    mutationFn: (input) => api.post('/api/organisations', input),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['workspace-organisations'] });
      setShowCreate(false);
      window.location.assign(`/organisations/${created.id}`);
    },
    onError: (e) => setError(e.message),
  });

  const saveViewMutation = useMutation({
    mutationFn: () => api.post('/api/saved-views', {
      name: viewName,
      definition: {
        version: 1,
        context: 'organisations',
        filters: {
          ...(query.status ? { status: query.status } : {}),
          ...(query.industry ? { industry: query.industry } : {}),
          ...(query.country ? { country: query.country } : {}),
          ...(query.search ? { search: query.search } : {}),
          includeArchived: query.includeArchived,
        },
        sort: query.sort,
      },
      isPinned: false,
    }),
    onSuccess: () => {
      setShowSave(false); setViewName('');
      queryClient.invalidateQueries({ queryKey: ['saved-views', 'organisations'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const setFilter = (key: string, value?: string) => {
    const next = new URLSearchParams(params);
    if (!value) next.delete(key); else next.set(key, value);
    next.delete('offset');
    setParams(next);
  };

  const applyValues = (values: Record<string, unknown>) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '' && value !== false) next.set(key, String(value));
    setParams(next);
  };

  const submitOrganisation = (event: FormEvent) => {
    event.preventDefault(); setError('');
    createMutation.mutate({ ...form, name: form.name.trim() });
  };

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Organisations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Accounts, decision-makers, engagements and next actions.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => setShowSave(true)}><Save className="h-4 w-4 mr-2" />Save view</Button>
        <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-2" />New organisation</Button>
      </div>
    </div>

    <div className="flex flex-wrap gap-2">
      {builtInViews.map((view) => <button key={view.name} onClick={() => applyValues(view.values)} className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">{view.name}</button>)}
      {savedViews.data?.map((view) => <button key={view.id} onClick={() => applyValues({ ...(view.definition.context === 'organisations' ? view.definition.filters : {}), ...(view.definition.context === 'organisations' ? { sort: view.definition.sort } : {}) })} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">{view.name}</button>)}
    </div>

    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="grid gap-3 md:grid-cols-5">
        <label className="relative md:col-span-2"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={query.search ?? ''} onChange={(e) => setFilter('search', e.target.value)} placeholder="Search organisations"/></label>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={query.status ?? ''} onChange={(e) => setFilter('status', e.target.value)}><option value="">All statuses</option>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <Input value={query.industry ?? ''} onChange={(e) => setFilter('industry', e.target.value)} placeholder="Industry"/>
        <select className="h-10 rounded-md border bg-background px-3 text-sm" value={query.sort} onChange={(e) => setFilter('sort', e.target.value)}><option value="name_asc">Name</option><option value="updated_desc">Recently updated</option><option value="recent_activity">Recently active</option><option value="next_follow_up">Next follow-up</option></select>
      </div>
      <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={query.includeArchived} onChange={(e) => setFilter('includeArchived', e.target.checked ? 'true' : undefined)}/>Include archived organisations</label>
    </div>

    {organisations.isLoading ? <div className="rounded-xl border p-10 text-center text-muted-foreground">Loading organisations…</div> : organisations.isError ? <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-destructive">{(organisations.error as Error).message}</div> : (
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b px-5 py-3 text-xs text-muted-foreground"><span>{organisations.data?.total ?? 0} organisations</span><span className="flex items-center gap-1"><Filter className="h-3.5 w-3.5"/>Filters are reflected in the URL</span></div>
        {(organisations.data?.items.length ?? 0) === 0 ? <div className="p-12 text-center text-muted-foreground">No organisations match this view.</div> : <div className="divide-y">
          {organisations.data?.items.map((organisation) => <Link key={organisation.id} to={`/organisations/${organisation.id}`} className="grid gap-3 p-5 hover:bg-muted/40 md:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]">
            <div className="flex gap-3 min-w-0"><div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Building2 className="h-4 w-4"/></div><div className="min-w-0"><p className="font-bold truncate">{organisation.name}</p><p className="text-xs text-muted-foreground truncate">{organisation.industry || 'Industry not recorded'}{organisation.country ? ` · ${organisation.country}` : ''}</p></div></div>
            <div><p className="text-[10px] uppercase text-muted-foreground">Status</p><p className="text-sm font-medium">{statusLabels[organisation.status]}</p></div>
            <div><p className="text-[10px] uppercase text-muted-foreground">Primary contact</p><p className="text-sm truncate">{organisation.primaryContact ? `${organisation.primaryContact.firstName ?? ''} ${organisation.primaryContact.lastName ?? ''}`.trim() || organisation.primaryContact.email : 'Not assigned'}</p></div>
            <div><p className="text-[10px] uppercase text-muted-foreground">Next action</p><p className="text-sm">{organisation.nextFollowUpDate || 'No open follow-up'}</p></div>
          </Link>)}
        </div>}
      </div>
    )}

    {showCreate && <Modal title="Create organisation" onClose={() => setShowCreate(false)}>
      <form onSubmit={submitOrganisation} className="space-y-4">
        {error && <ErrorBox message={error}/>}<Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Organisation name"/>
        <div className="grid gap-3 sm:grid-cols-2"><Input value={form.legalName ?? ''} onChange={(e) => setForm({ ...form, legalName: e.target.value || null })} placeholder="Legal name"/><Input value={form.industry ?? ''} onChange={(e) => setForm({ ...form, industry: e.target.value || null })} placeholder="Industry"/></div>
        <div className="grid gap-3 sm:grid-cols-2"><Input value={form.country ?? ''} maxLength={2} onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() || null })} placeholder="Country code (IE)"/><select className="h-10 rounded-md border bg-background px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as OrganisationStatus })}>{Object.entries(statusLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button><Button disabled={createMutation.isPending}>{createMutation.isPending ? 'Creating…' : 'Create organisation'}</Button></div>
      </form>
    </Modal>}
    {showSave && <Modal title="Save this organisation view" onClose={() => setShowSave(false)}><div className="space-y-4">{error && <ErrorBox message={error}/>}<Input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="View name"/><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowSave(false)}>Cancel</Button><Button disabled={!viewName.trim() || saveViewMutation.isPending} onClick={() => saveViewMutation.mutate()}>Save view</Button></div></div></Modal>}
  </div>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-2xl"><div className="mb-5 flex justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose} aria-label="Close">×</button></div>{children}</div></div>; }
function ErrorBox({ message }: { message: string }) { return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</div>; }
