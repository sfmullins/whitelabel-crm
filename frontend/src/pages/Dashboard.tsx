import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertTriangle, BriefcaseBusiness, Building2, CalendarClock, CheckCircle2, CircleDollarSign, Layers, MessageSquare, Settings, Users, WalletCards } from 'lucide-react';
import type { DashboardOperationalSummary,WorkspaceModel } from 'shared';
import { api } from '../lib/api';
import { useWorkspaceModel } from '../hooks/useWorkspaceModel';
import { definitionRoute,workspaceExperience } from '../lib/workspaceModel';

export default function Dashboard() {
  const model=useWorkspaceModel();
  const metrics = useQuery<DashboardOperationalSummary>({
    queryKey: ['workspace-dashboard'],
    queryFn: () => api.get('/api/workspace/dashboard'),
    refetchInterval: 30_000,
  });
  if (metrics.isLoading||model.isLoading) return <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-muted"/>)}</div>;
  if (model.isError || !model.data) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-destructive">{(model.error as Error)?.message || 'The active CRM model could not be loaded. Restart the local client so its database upgrade can complete.'}</div>;
  if (metrics.isError || !metrics.data) return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-destructive">{(metrics.error as Error)?.message || 'Dashboard could not be loaded'}</div>;
  const data = metrics.data;
  const money = (cents: number) => new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const experience=workspaceExperience(model.data);
  if(experience.specialist)return <SpecialistDashboard data={data} model={model.data} money={money}/>;
  return <div className="space-y-7">
    <div><h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1><p className="mt-1 text-sm text-muted-foreground">Operational signals from persisted CRM and financial records.</p></div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Active clients" value={data.activeClientOrganisations} icon={Building2}/><Card label="Active engagements" value={data.activeEngagements} icon={BriefcaseBusiness}/><Card label="Overdue follow-ups" value={data.overdueFollowUps} icon={AlertTriangle} danger/><Card label="Due today" value={data.dueTodayFollowUps} icon={CalendarClock}/><Card label="Collected this month" value={money(data.collectedRevenueCents)} icon={CircleDollarSign}/><Card label="Outstanding invoices" value={money(data.outstandingCents)} icon={WalletCards}/>
    </div>
    <div className="grid gap-6 xl:grid-cols-3">
      <section className="rounded-xl border bg-card p-6 shadow-sm xl:col-span-2"><div className="flex justify-between"><div><h2 className="font-bold">Needs attention</h2><p className="text-xs text-muted-foreground">Open commitments, quiet accounts and engagements ending soon.</p></div><Link to="/follow-ups" className="text-xs font-semibold text-primary">Open follow-up queue</Link></div><div className="mt-5 grid gap-5 lg:grid-cols-3"><Attention title="Follow-ups" empty="No open follow-ups" items={data.needsAttention.followUps.map((item) => ({ id: item.activityId, title: item.organisationName, detail: `${item.status} · ${item.followUpDate}`, route: `/organisations/${item.organisationId}?tab=timeline&activityId=${item.activityId}` }))}/><Attention title={`No activity in ${data.staleAfterDays}+ days`} empty="No stale active clients" items={data.needsAttention.staleOrganisations.map((item) => ({ id: item.id, title: item.name, detail: item.lastActivityAt ? `Last activity ${new Date(item.lastActivityAt).toLocaleDateString()}` : 'No activity recorded', route: `/organisations/${item.id}` }))}/><Attention title="Engagements ending soon" empty="No engagements ending soon" items={data.needsAttention.engagementsEndingSoon.map((item) => ({ id: item.id, title: item.name, detail: `${item.organisationName} · ${item.endDate}`, route: `/organisations/${item.organisationId}?tab=engagements&engagementId=${item.id}` }))}/></div></section>
      <section className="rounded-xl border bg-card p-6 shadow-sm"><h2 className="font-bold">Recently updated organisations</h2><div className="mt-4 divide-y">{data.recentlyUpdatedOrganisations.map((organisation) => <Link key={organisation.id} to={`/organisations/${organisation.id}`} className="block py-3 hover:text-primary"><p className="text-sm font-bold">{organisation.name}</p><p className="text-xs text-muted-foreground">{organisation.status.replace('_',' ')} · {new Date(organisation.updatedAt).toLocaleDateString()}</p></Link>)}</div></section>
    </div>
    <section className="rounded-xl border bg-card p-6 shadow-sm"><div><h2 className="font-bold">Recent CRM activity</h2><p className="text-xs text-muted-foreground">Canonical activities only; no simulated trend data.</p></div>{data.recentActivities.length === 0 ? <div className="mt-5 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No activity recorded.</div> : <div className="mt-4 divide-y">{data.recentActivities.map((activity) => <Link key={activity.id} to={`/organisations/${activity.organisationId}?tab=timeline&activityId=${activity.id}`} className="flex gap-3 py-4 hover:bg-muted/30"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><MessageSquare className="h-4 w-4"/></div><div className="min-w-0"><p className="text-sm font-bold">{activity.organisationName} · <span className="capitalize">{activity.type}</span></p><p className="truncate text-xs text-muted-foreground">{activity.body}</p><p className="mt-1 text-[10px] text-muted-foreground">{activity.author} · {new Date(activity.occurredAt).toLocaleString()}</p></div></Link>)}</div>}</section>
  </div>;
}
function SpecialistDashboard({data,model,money}:{data:DashboardOperationalSummary;model:WorkspaceModel;money:(cents:number)=>string}){
  const experience=workspaceExperience(model);
  const definitions=new Map(model.definitions.map((definition)=>[definition.apiName,definition]));
  const configuredCardKeys=new Set((model.presentation?.dashboardCards??[]).filter((item)=>item.source==='custom_object').map((item)=>item.key));
  const cardDefinitions=[
    ...(model.presentation?.dashboardCards??[
    {source:'customers' as const,key:'customers',label:undefined},
    ...model.definitions.map((definition)=>({source:'custom_object' as const,key:definition.apiName,label:undefined})),
    ]),
    ...(model.presentation?model.definitions.filter((definition)=>!configuredCardKeys.has(definition.apiName)).map((definition)=>({source:'custom_object' as const,key:definition.apiName,label:undefined})):[]),
  ];
  const cards=cardDefinitions.flatMap((item)=>{
    if(item.source==='customers')return [{key:'customers',label:item.label||model.customerPlural,value:model.customerCount,route:'/customers'}];
    const definition=definitions.get(item.key);
    return definition?[{key:definition.apiName,label:item.label||definition.pluralName,value:definition.recordCount,route:definitionRoute(definition)}]:[];
  });
  const configuredActionKeys=new Set((model.presentation?.quickActions??[]).filter((item)=>item.source==='custom_object').map((item)=>item.key));
  const actionDefinitions=[
    ...(model.presentation?.quickActions??[]),
    ...(model.presentation?model.definitions.filter((definition)=>!configuredActionKeys.has(definition.apiName)).map((definition)=>({source:'custom_object' as const,key:definition.apiName,label:`Add ${definition.name.toLowerCase()}`})):[]),
  ];
  const actions=actionDefinitions.flatMap((item)=>{
    if(item.source==='customers')return [{key:'customers',label:item.label,route:'/customers?action=create'}];
    if(item.source==='route'&&item.route)return [{key:item.key,label:item.label,route:item.route}];
    const definition=definitions.get(item.key);
    return definition?[{key:definition.apiName,label:item.label,route:definitionRoute(definition)}]:[];
  });
  return <div className="space-y-7">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-wider text-primary">{model.templateName} model active</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{experience.dashboardTitle}</h1><p className="mt-1 text-sm text-muted-foreground">{experience.dashboardDescription}</p></div><Link to="/onboarding" className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs font-bold shadow-sm hover:bg-muted"><Settings className="h-4 w-4"/>Customise this setup</Link></div>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950"><div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700"/><div><h2 className="font-bold">Your {model.templateName.toLowerCase()} setup is applied</h2><p className="mt-1 text-xs text-emerald-800">The workspace below is built from your selected model. Its record types remain yours to rename, add to or remove.</p></div></div><span className="rounded-full bg-white px-3 py-1 text-xs font-bold shadow-sm">{model.definitions.length} record types active</span></section>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card)=><LinkCard key={card.key} label={card.label} value={card.value} route={card.route} icon={card.key==='customers'?Users:Layers}/>)}
    </div>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Overdue follow-ups" value={data.overdueFollowUps} icon={AlertTriangle} danger/><Card label="Due today" value={data.dueTodayFollowUps} icon={CalendarClock}/><Card label="Collected this month" value={money(data.collectedRevenueCents)} icon={CircleDollarSign}/><Card label="Outstanding invoices" value={money(data.outstandingCents)} icon={WalletCards}/>
    </div>
    <section className="rounded-xl border bg-card p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-bold">Next actions</h2><p className="mt-1 text-xs text-muted-foreground">Actions and terminology come from the active template and remain editable through your model.</p></div><Link to="/reporting" className="text-xs font-semibold text-primary">Open reports</Link></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{actions.map((action)=><Link key={action.key} to={action.route} className="rounded-lg border p-4 hover:bg-muted/40"><p className="font-bold">{action.label}</p><p className="mt-1 text-xs text-muted-foreground">Open the relevant workspace and create a record.</p></Link>)}</div></section>
  </div>;
}
function LinkCard({label,value,route,icon:Icon}:{label:string;value:number;route:string;icon:React.ComponentType<{className?:string}>}){return <Link to={route} className="flex items-center justify-between rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"><div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-black">{value}</p><p className="mt-1 text-[10px] font-semibold text-primary">Open {label.toLowerCase()}</p></div><div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5"/></div></Link>;}
function Card({ label, value, icon: Icon, danger = false }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; danger?: boolean }) { return <div className="flex items-center justify-between rounded-xl border bg-card p-5 shadow-sm"><div><p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-2 text-2xl font-black ${danger && Number(value) > 0 ? 'text-red-700' : ''}`}>{value}</p></div><div className={`flex h-11 w-11 items-center justify-center rounded-xl ${danger ? 'bg-red-100 text-red-700' : 'bg-primary/10 text-primary'}`}><Icon className="h-5 w-5"/></div></div>; }
function Attention({ title, empty, items }: { title: string; empty: string; items: Array<{ id: string; title: string; detail: string; route: string }> }) { return <div><h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h3><div className="mt-3 space-y-2">{items.length === 0 ? <p className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground">{empty}</p> : items.slice(0,5).map((item) => <Link key={item.id} to={item.route} className="block rounded-lg border p-3 hover:bg-muted/40"><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-muted-foreground">{item.detail}</p></Link>)}</div></div>; }
