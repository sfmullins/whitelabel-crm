import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useBranding } from '../../hooks/useBranding';
import Onboarding from '../../pages/Onboarding';
import {
  BriefcaseBusiness, Building2, Calendar, CalendarClock, FileText, LayoutDashboard,
  Layers, Plus, Search, Settings, UserRound, Users, X,
} from 'lucide-react';
import type { SavedView, SearchResponse, SearchResult } from 'shared';
import { Button } from '../ui/button';
import { api } from '../../lib/api';
import { buildQueryString, formatEntityLabel, groupSearchResults, readRecentRecords, rememberRecentRecord, savedViewRoute } from '../../lib/wi4';

const navGroups = [
  { label: 'Workspace', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }] },
  { label: 'CRM', items: [
    { to: '/organisations', label: 'Organisations', icon: Building2 },
    { to: '/contacts', label: 'Contacts', icon: UserRound },
    { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  ] },
  { label: 'Operations', items: [
    { to: '/customers', label: 'Customer records', icon: Users },
    { to: '/bookings', label: 'Bookings', icon: Calendar },
    { to: '/invoices', label: 'Invoices', icon: FileText },
    { to: '/services', label: 'Services', icon: Layers },
  ] },
  { label: 'System', items: [{ to: '/settings', label: 'Settings', icon: Settings }] },
];

export default function MainLayout() {
  const { settings, isLoading, needsOnboarding, refetch } = useBranding();
  const navigate = useNavigate();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recents = useMemo(() => readRecentRecords(), [isSearchOpen]);
  const search = useQuery<SearchResponse>({
    queryKey: ['command-search', query],
    queryFn: ({ signal }) => api.get(`/api/search${buildQueryString({ q: query, limit: 12, offset: 0 })}`, { signal }),
    enabled: isSearchOpen && query.trim().length >= 2,
    staleTime: 10_000,
  });
  const pinnedViews = useQuery<SavedView[]>({
    queryKey: ['saved-views', 'pinned'],
    queryFn: () => api.get('/api/saved-views?pinnedOnly=true'),
    enabled: isSearchOpen,
  });
  const flatResults = search.data?.items ?? [];

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault(); setIsSearchOpen((open) => !open);
      }
      if (!isSearchOpen) return;
      if (event.key === 'Escape') { event.preventDefault(); closeSearch(); }
      if (event.key === 'ArrowDown') { event.preventDefault(); setSelectedIndex((index) => Math.min(index + 1, Math.max(0, flatResults.length - 1))); }
      if (event.key === 'ArrowUp') { event.preventDefault(); setSelectedIndex((index) => Math.max(0, index - 1)); }
      if (event.key === 'Enter' && flatResults[selectedIndex]) { event.preventDefault(); openResult(flatResults[selectedIndex]); }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [isSearchOpen, flatResults, selectedIndex]);

  useEffect(() => {
    if (isSearchOpen) { setQuery(''); setSelectedIndex(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [isSearchOpen]);
  useEffect(() => setSelectedIndex(0), [query]);

  const closeSearch = () => { setIsSearchOpen(false); requestAnimationFrame(() => triggerRef.current?.focus()); };
  const openResult = (result: SearchResult) => { rememberRecentRecord(result); navigate(result.route); closeSearch(); };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Opening local CRM workspace…</div>;
  if (needsOnboarding) return <Onboarding onSuccess={refetch}/>;

  return <div className="flex min-h-screen bg-slate-50">
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r bg-white md:flex">
      <div className="space-y-6 p-5">
        <div className="flex items-center gap-3 px-2">{settings?.logoUrl ? <img src={settings.logoUrl} alt="" className="h-9 w-9 object-contain"/> : <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">{settings?.businessName?.[0]?.toUpperCase() || 'G'}</div>}<div className="min-w-0"><h2 className="truncate font-bold text-slate-800">{settings?.businessName}</h2><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Local CRM workspace</p></div></div>
        <nav className="space-y-5">{navGroups.map((group) => <div key={group.label}><p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon className="h-4 w-4"/>{label}</NavLink>)}</div></div>)}</nav>
      </div>
      <div className="border-t bg-slate-50/60 p-5 text-xs text-slate-500"><span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500"/>Local database mode</span></div>
    </aside>

    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-white px-4 md:px-8">
        <button ref={triggerRef} onClick={() => setIsSearchOpen(true)} className="flex w-full max-w-xl items-center gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-100" aria-haspopup="dialog"><Search className="h-4 w-4"/><span className="min-w-0 flex-1 truncate">Search organisations, contacts, activities and invoices…</span><kbd className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd></button>
        <Button size="sm" onClick={() => navigate('/organisations')}><Plus className="mr-1.5 h-4 w-4"/>Create</Button>
      </header>
      <main className="flex-1 overflow-y-auto p-4 md:p-8"><Outlet/></main>
    </div>

    {isSearchOpen && <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={(event) => event.target === event.currentTarget && closeSearch()}>
      <div className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
        <div className="flex items-center gap-3 border-b p-4"><Search className="h-5 w-5 text-muted-foreground"/><input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} className="w-full bg-transparent text-base outline-none" placeholder="Search the local CRM" aria-label="Search query"/><button onClick={closeSearch} aria-label="Close search"><X className="h-5 w-5 text-muted-foreground"/></button></div>
        <div className="overflow-y-auto p-2">
          {query.trim().length < 2 ? <BlankPalette recents={recents} views={pinnedViews.data ?? []} navigate={(route) => { navigate(route); closeSearch(); }}/> : search.isLoading ? <PaletteState text="Searching local records…"/> : search.isError ? <PaletteState danger text={(search.error as Error).message}/> : flatResults.length === 0 ? <PaletteState text="No matching records."/> : <div className="space-y-3">{groupSearchResults(flatResults).map((group) => <section key={group.type}><p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{formatEntityLabel(group.type)}</p>{group.items.map((item) => { const index = flatResults.indexOf(item); return <button key={item.id} onMouseEnter={() => setSelectedIndex(index)} onClick={() => openResult(item)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left ${selectedIndex === index ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted'}`}><div className="min-w-0"><p className="font-bold">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.subtitle}{item.context ? ` · ${item.context}` : ''}</p></div></button>; })}</section>)}</div>}
        </div>
        {query.trim().length >= 2 && <Link to={`/search${buildQueryString({ q: query })}`} onClick={closeSearch} className="border-t px-4 py-3 text-center text-xs font-bold text-primary hover:bg-muted">View all search results</Link>}
      </div>
    </div>}
  </div>;
}

function BlankPalette({ recents, views, navigate }: { recents: ReturnType<typeof readRecentRecords>; views: SavedView[]; navigate: (route: string) => void }) {
  const direct = [
    { title: 'Create organisation', route: '/organisations?action=create' },
    { title: 'Create contact', route: '/organisations?intent=create-contact' },
    { title: 'Log activity', route: '/organisations?intent=log-activity' },
    { title: 'Open follow-up queue', route: '/follow-ups' },
  ];
  return <div className="space-y-4 p-2"><section><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</p>{direct.map((item) => <button key={item.route} onClick={() => navigate(item.route)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"><Plus className="h-4 w-4 text-primary"/>{item.title}</button>)}</section>{recents.length > 0 && <section><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recently viewed</p>{recents.map((item) => <button key={`${item.entityType}-${item.entityId}`} onClick={() => navigate(item.route)} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted"><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-muted-foreground">{item.subtitle}</p></button>)}</section>}{views.length > 0 && <section><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pinned views</p>{views.map((view) => <button key={view.id} onClick={() => navigate(savedViewRoute(view))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"><BriefcaseBusiness className="h-4 w-4 text-primary"/>{view.name}</button>)}</section>}</div>;
}
function PaletteState({ text, danger = false }: { text: string; danger?: boolean }) { return <div className={`p-10 text-center text-sm ${danger ? 'text-destructive' : 'text-muted-foreground'}`}>{text}</div>; }
