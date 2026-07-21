import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, Check, ExternalLink, RotateCcw, Save } from 'lucide-react';
import type { FollowUpBucket, FollowUpResponse, SavedView } from 'shared';
import { api } from '../lib/api';
import { buildQueryString } from '../lib/wi4';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

const buckets: Array<{ value: FollowUpBucket; label: string }> = [
  { value: 'overdue', label: 'Overdue' }, { value: 'today', label: 'Due today' }, { value: 'upcoming', label: 'Upcoming' },
  { value: 'open', label: 'All open' }, { value: 'completed', label: 'Completed' },
];

export default function FollowUps() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const query = useMemo(() => ({
    bucket: (params.get('bucket') || 'open') as FollowUpBucket,
    type: params.get('type') || undefined,
    from: params.get('from') || undefined,
    to: params.get('to') || undefined,
    organisationId: params.get('organisationId') || undefined,
    limit: 100,
    offset: Number(params.get('offset') || 0),
  }), [params]);
  const followUps = useQuery<FollowUpResponse>({
    queryKey: ['follow-ups', query],
    queryFn: () => api.get(`/api/follow-ups${buildQueryString(query)}`),
  });
  const views = useQuery<SavedView[]>({ queryKey: ['saved-views', 'followups'], queryFn: () => api.get('/api/saved-views?context=followups') });
  const statusMutation = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) => api.post(`/api/activities/${id}/follow-up/${completed ? 'complete' : 'reopen'}`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['follow-ups'] }); queryClient.invalidateQueries({ queryKey: ['workspace-dashboard'] }); },
  });
  const rescheduleMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => api.patch(`/api/activities/${id}`, { followUpDate: date }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['follow-ups'] }),
  });
  const saveMutation = useMutation({
    mutationFn: () => api.post('/api/saved-views', {
      name: saveName,
      definition: { version: 1, context: 'followups', filters: { bucket: query.bucket, ...(query.organisationId ? { organisationId: query.organisationId } : {}), ...(query.type ? { type: query.type } : {}) }, sort: 'due_asc' },
      isPinned: false,
    }),
    onSuccess: () => { setShowSave(false); setSaveName(''); queryClient.invalidateQueries({ queryKey: ['saved-views', 'followups'] }); },
  });
  const setFilter = (key: string, value?: string) => { const next = new URLSearchParams(params); if (!value) next.delete(key); else next.set(key, value); next.delete('offset'); setParams(next); };

  return <div className="space-y-6">
    <div className="flex flex-wrap justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight">Follow-ups</h1><p className="mt-1 text-sm text-muted-foreground">A focused queue derived from activity commitments.</p></div><Button variant="outline" onClick={() => setShowSave(true)}><Save className="mr-2 h-4 w-4"/>Save view</Button></div>
    <div className="flex flex-wrap gap-2">{buckets.map((bucket) => <button key={bucket.value} onClick={() => setFilter('bucket', bucket.value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${query.bucket === bucket.value ? 'border-primary bg-primary text-primary-foreground' : 'bg-card hover:bg-muted'}`}>{bucket.label}</button>)}{views.data?.map((view) => <button key={view.id} onClick={() => { if (view.definition.context === 'followups') { const next = new URLSearchParams(); Object.entries(view.definition.filters).forEach(([key,value]) => value !== undefined && next.set(key, String(value))); setParams(next); } }} className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary">{view.name}</button>)}</div>
    <div className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm sm:grid-cols-3"><select className="h-10 rounded-md border bg-background px-3 text-sm" value={query.type ?? ''} onChange={(e) => setFilter('type', e.target.value)}><option value="">All activity types</option>{['note','call','email','meeting','message','other'].map((type) => <option key={type}>{type}</option>)}</select><Input type="date" value={query.from ?? ''} onChange={(e) => setFilter('from', e.target.value)} aria-label="Follow-up from"/><Input type="date" value={query.to ?? ''} onChange={(e) => setFilter('to', e.target.value)} aria-label="Follow-up to"/></div>
    {followUps.isLoading ? <State text="Loading follow-ups…"/> : followUps.isError ? <State danger text={(followUps.error as Error).message}/> : (followUps.data?.items.length ?? 0) === 0 ? <State text="Nothing requires attention in this view."/> : <div className="space-y-3">
      {followUps.data?.items.map((item) => <article key={item.activityId} className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex min-w-0 gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${item.status === 'overdue' ? 'bg-red-100 text-red-700' : item.status === 'today' ? 'bg-amber-100 text-amber-700' : item.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}><CalendarClock className="h-5 w-5"/></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link className="font-bold hover:underline" to={`/organisations/${item.organisationId}`}>{item.organisationName}</Link><span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">{item.status}</span></div><p className="mt-1 text-sm text-foreground/80">{item.body}</p><p className="mt-1 text-xs text-muted-foreground">{item.contactName || 'Organisation level'}{item.engagementName ? ` · ${item.engagementName}` : ''} · Due {item.followUpDate}</p></div></div>
          <div className="flex flex-wrap gap-2">{item.status === 'completed' ? <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: item.activityId, completed: false })}><RotateCcw className="mr-1.5 h-3.5 w-3.5"/>Reopen</Button> : <Button size="sm" onClick={() => statusMutation.mutate({ id: item.activityId, completed: true })}><Check className="mr-1.5 h-3.5 w-3.5"/>Complete</Button>}<Link to={`/organisations/${item.organisationId}?tab=timeline&activityId=${item.activityId}`}><Button size="sm" variant="outline"><ExternalLink className="mr-1.5 h-3.5 w-3.5"/>Open</Button></Link></div></div>
        {item.status !== 'completed' && <div className="mt-4 flex items-center gap-2 border-t pt-4"><span className="text-xs text-muted-foreground">Reschedule</span><Input className="h-8 max-w-[170px]" type="date" defaultValue={item.followUpDate} onBlur={(e) => e.target.value !== item.followUpDate && rescheduleMutation.mutate({ id: item.activityId, date: e.target.value })}/></div>}
      </article>)}
    </div>}
    {showSave && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-2xl"><h2 className="text-lg font-bold">Save follow-up view</h2><Input className="my-4" value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="View name"/><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowSave(false)}>Cancel</Button><Button disabled={!saveName.trim()} onClick={() => saveMutation.mutate()}>Save</Button></div></div></div>}
  </div>;
}
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-xl border p-10 text-center text-sm ${danger ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'text-muted-foreground'}`}>{text}</div>; }
