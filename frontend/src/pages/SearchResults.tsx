import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, CheckSquare, FileText, FolderOpen, MessageSquare, Radio, Search, UserRound, BriefcaseBusiness, Users } from 'lucide-react';
import type { SearchEntityType, SearchResponse } from 'shared';
import { api } from '../lib/api';
import { buildQueryString, formatEntityLabel, groupSearchResults, rememberRecentRecord } from '../lib/wi4';
import { Input } from '../components/ui/input';

const types: SearchEntityType[] = ['organisation','contact','engagement','activity','task','document','communication','customer','invoice'];
const icons = { organisation: Building2, contact: UserRound, engagement: BriefcaseBusiness, activity: MessageSquare, task: CheckSquare, document: FolderOpen, communication: Radio, customer: Users, invoice: FileText };

export default function SearchResults() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const selectedTypes = (params.get('types')?.split(',').filter(Boolean) ?? []) as SearchEntityType[];
  const includeArchived = params.get('includeArchived') === 'true';
  const query = useMemo(() => ({ q, types: selectedTypes.length ? selectedTypes : undefined, includeArchived, limit: 50, offset: Number(params.get('offset') || 0) }), [q, selectedTypes.join(','), includeArchived, params]);
  const results = useQuery<SearchResponse>({
    queryKey: ['search-page', query],
    queryFn: () => api.get(`/api/search${buildQueryString(query)}`),
    enabled: q.trim().length >= 2,
  });
  const setValue = (key: string, value?: string) => { const next = new URLSearchParams(params); if (!value) next.delete(key); else next.set(key, value); next.delete('offset'); setParams(next); };
  const toggleType = (type: SearchEntityType) => { const next = selectedTypes.includes(type) ? selectedTypes.filter((item) => item !== type) : [...selectedTypes, type]; setValue('types', next.length ? next.join(',') : undefined); };
  const groups = groupSearchResults(results.data?.items ?? []);

  return <div className="space-y-6">
    <div><h1 className="text-3xl font-extrabold tracking-tight">Search</h1><p className="mt-1 text-sm text-muted-foreground">Local full-text search across the complete CRM workspace.</p></div>
    <div className="space-y-4 rounded-xl border bg-card p-5 shadow-sm">
      <label className="relative block"><Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground"/><Input autoFocus className="h-11 pl-10 text-base" value={q} onChange={(e) => setValue('q', e.target.value)} placeholder="Search names, organisations, activity content or invoice numbers"/></label>
      <div className="flex flex-wrap gap-2">{types.map((type) => <button key={type} onClick={() => toggleType(type)} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${selectedTypes.includes(type) ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{formatEntityLabel(type)}</button>)}<label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={includeArchived} onChange={(e) => setValue('includeArchived', e.target.checked ? 'true' : undefined)}/>Include archived</label></div>
    </div>
    {q.trim().length < 2 ? <State text="Enter at least two characters."/> : results.isLoading ? <State text="Searching the local database…"/> : results.isError ? <State danger text={(results.error as Error).message}/> : groups.length === 0 ? <State text="No matching records."/> : <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{results.data?.total ?? 0} results</p>
      {groups.map((group) => <section key={group.type} className="overflow-hidden rounded-xl border bg-card shadow-sm"><div className="border-b px-5 py-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">{formatEntityLabel(group.type)}</div><div className="divide-y">{group.items.map((item) => { const Icon = icons[item.entityType]; return <Link key={item.id} to={item.route} onClick={() => rememberRecentRecord(item)} className="flex gap-4 p-5 hover:bg-muted/40"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4"/></div><div className="min-w-0"><p className="font-bold">{item.title}</p><p className="text-xs text-muted-foreground">{item.subtitle}</p>{item.context && <p className="mt-1 line-clamp-2 text-xs text-foreground/70">{item.context}</p>}</div></Link>; })}</div></section>)}
    </div>}
  </div>;
}
function State({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`rounded-xl border p-12 text-center text-sm ${danger ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'text-muted-foreground'}`}>{text}</div>; }
