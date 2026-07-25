import { useEffect,useMemo,useRef,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { Link,NavLink,Outlet,useNavigate } from 'react-router-dom';
import { useBranding } from '../../hooks/useBranding';
import { logout,useIdentity,type CrmIdentity } from '../../hooks/useIdentity';
import { useExtensionRuntime } from '../../hooks/useExtensionRuntime';
import { useWorkspaceModel } from '../../hooks/useWorkspaceModel';
import Onboarding from '../../pages/Onboarding';
import Login from '../../pages/Login';
import {
  ArrowDown,ArrowUp,BarChart3,BriefcaseBusiness,Building2,Calendar,CalendarClock,CheckSquare,Database,FileText,FolderOpen,Inbox,LayoutDashboard,
  Layers,Link2,LogOut,PackageOpen,Pencil,Plus,Radio,Search,Settings,ShieldCheck,Sparkles,Upload,UserCog,UserRound,Users,Workflow,X,
} from 'lucide-react';
import type { SavedView,SearchResponse,SearchResult } from 'shared';
import type { OnboardingStatus } from 'shared/onboarding';
import { Button } from '../ui/button';
import { api } from '../../lib/api';
import { buildQueryString,formatEntityLabel,groupSearchResults,readRecentRecords,rememberRecentRecord,savedViewRoute } from '../../lib/wi4';
import { definitionRoute,workspaceExperience } from '../../lib/workspaceModel';
import { mergeNavigationOrder,orderNavigationItems } from '../../lib/navigationPreferences';

interface NavItem {to:string;label:string;icon:React.ComponentType<{className?:string}>;permission?:string;anyPermission?:string[];}
interface NavigationPreferences {organisationOrder:string[];personalOrder:string[];canManageOrganisation:boolean;}
const navGroups:Array<{label:string;items:NavItem[]}>= [
  {label:'Workspace',items:[{to:'/',label:'Dashboard',icon:LayoutDashboard,permission:'crm.read'},{to:'/reporting',label:'Reporting',icon:BarChart3,permission:'reports.read'}]},
  {label:'CRM',items:[{to:'/organisations',label:'Organisations',icon:Building2,permission:'crm.read'},{to:'/contacts',label:'Contacts',icon:UserRound,permission:'crm.read'},{to:'/follow-ups',label:'Follow-ups',icon:CalendarClock,permission:'crm.read'}]},
  {label:'Operations',items:[
    {to:'/work',label:'Work',icon:CheckSquare,permission:'crm.read'},{to:'/documents',label:'Documents',icon:FolderOpen,permission:'crm.read'},
    {to:'/communications',label:'Communications',icon:Radio,permission:'crm.read'},{to:'/email',label:'Email inbox',icon:Inbox,permission:'crm.read'},
    {to:'/calendar-workspace',label:'Calendar',icon:Calendar,permission:'crm.read'},{to:'/integrations',label:'Connected accounts',icon:Link2,permission:'crm.read'},
    {to:'/automation',label:'Automation',icon:Workflow,permission:'crm.read'},{to:'/customers',label:'Customer records',icon:Users,permission:'crm.read'},
    {to:'/bookings',label:'Bookings',icon:Calendar,permission:'crm.read'},{to:'/invoices',label:'Invoices',icon:FileText,permission:'crm.read'},{to:'/services',label:'Services',icon:Layers,permission:'crm.read'},
    {to:'/bulk-import',label:'Bulk import',icon:Upload,permission:'data.import'},
  ]},
  {label:'System',items:[
    {to:'/administration',label:'Administration',icon:UserCog,anyPermission:['users.manage','audit.read']},
    {to:'/onboarding',label:'Instance onboarding',icon:Sparkles,permission:'onboarding.read'},
    {to:'/extensions',label:'Extensions',icon:PackageOpen,permission:'extensions.read'},
    {to:'/operations-health',label:'Operations health',icon:ShieldCheck,permission:'operations.manage'},
    {to:'/workspace-design',label:'Workspace design',icon:Database,permission:'schema.manage'},
    {to:'/settings',label:'Settings',icon:Settings,permission:'settings.manage'},
  ]},
];

export default function MainLayout(){const identity=useIdentity();if(identity.isLoading)return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Establishing CRM identity…</div>;if(!identity.user)return <Login/>;return <AuthenticatedLayout user={identity.user} can={identity.can}/>;}

function AuthenticatedLayout({user,can}:{user:CrmIdentity;can:(permission:string)=>boolean}){
  const client=useQueryClient();
  const lifecycle=useQuery<OnboardingStatus>({queryKey:['onboarding-status'],queryFn:()=>api.get('/api/onboarding/status'),retry:false,staleTime:5_000});
  const signOut=async()=>{await logout();client.setQueryData(['crm-identity'],{user:null});client.removeQueries();};
  if(lifecycle.isLoading)return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-slate-400">Checking instance lifecycle…</div>;
  if(lifecycle.isError||!lifecycle.data)return <LifecycleBlock title="Instance status unavailable" message={(lifecycle.error as Error)?.message||'The authoritative instance lifecycle could not be loaded.'} onSignOut={signOut}/>;
  if(lifecycle.data.status==='suspended')return <LifecycleBlock title="Instance suspended" message="This CRM instance is suspended. Normal workspace access is disabled until an administrator restores it." onSignOut={signOut}/>;
  if(!lifecycle.data.canAccessWorkspace){
    if(can('onboarding.manage'))return <Onboarding onSuccess={async()=>{await Promise.all([client.invalidateQueries({queryKey:['onboarding-status']}),client.invalidateQueries({queryKey:['settings']}),client.invalidateQueries({queryKey:['extension-runtime']})]);}}/>;
    return <LifecycleBlock title="Instance setup in progress" message="The business instance has not been published. An owner or administrator must complete onboarding before employees can open the CRM workspace." onSignOut={signOut}/>;
  }
  return <ActiveWorkspace user={user} can={can}/>;
}

function LifecycleBlock({title,message,onSignOut}:{title:string;message:string;onSignOut:()=>Promise<void>}){return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-200"><div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-7 shadow-2xl"><ShieldCheck className="h-8 w-8 text-blue-400"/><h1 className="mt-4 text-2xl font-black">{title}</h1><p className="mt-3 text-sm leading-6 text-slate-400">{message}</p><Button variant="outline" className="mt-6 border-slate-700 bg-transparent text-white" onClick={()=>void onSignOut()}><LogOut className="mr-2 h-4 w-4"/>Sign out</Button></div></div>;}

function ActiveWorkspace({user,can}:{user:CrmIdentity;can:(permission:string)=>boolean}){
  const {settings,isLoading,error:brandingError}=useBranding();const workspaceModel=useWorkspaceModel();const extensionRuntime=useExtensionRuntime();const navigate=useNavigate();const client=useQueryClient();
  const [isSearchOpen,setIsSearchOpen]=useState(false);const [isNavigationOpen,setIsNavigationOpen]=useState(false);const [query,setQuery]=useState('');const [selectedIndex,setSelectedIndex]=useState(0);const triggerRef=useRef<HTMLButtonElement>(null);const inputRef=useRef<HTMLInputElement>(null);
  const navigationPreferences=useQuery<NavigationPreferences>({queryKey:['workspace-navigation'],queryFn:()=>api.get('/api/workspace-design/navigation')});
  const recents=useMemo(()=>readRecentRecords(),[isSearchOpen]);
  const search=useQuery<SearchResponse>({queryKey:['command-search',query],queryFn:({signal})=>api.get(`/api/search${buildQueryString({q:query,limit:12,offset:0})}`,{signal}),enabled:isSearchOpen&&query.trim().length>=2,staleTime:10_000});
  const pinnedViews=useQuery<SavedView[]>({queryKey:['saved-views','pinned'],queryFn:()=>api.get('/api/saved-views?pinnedOnly=true'),enabled:isSearchOpen});const flatResults=search.data?.items??[];
  const visible=(item:NavItem)=>!item.permission&&!item.anyPermission||Boolean(item.permission&&can(item.permission))||Boolean(item.anyPermission?.some(can));
  const experience=workspaceExperience(workspaceModel.data);
  const definitionByKey=new Map((workspaceModel.data?.definitions??[]).map((definition)=>[definition.apiName,definition]));
  const templateItems:NavItem[]=(workspaceModel.data?.presentation?.navigation??[]).flatMap((item)=>{
    if(item.source==='customers')return [{to:'/customers',label:item.label||workspaceModel.data!.customerPlural,icon:Users,permission:'crm.read'}];
    if(item.source==='route'&&item.route)return [{to:item.route,label:item.label||item.key,icon:item.key==='follow-ups'?CalendarClock:Layers,permission:'crm.read'}];
    const definition=definitionByKey.get(item.key);
    return definition?[{to:definitionRoute(definition),label:item.label||definition.pluralName,icon:Layers,permission:'crm.read'}]:[];
  });
  const configuredDefinitionKeys=new Set((workspaceModel.data?.presentation?.navigation??[]).filter((item)=>item.source==='custom_object').map((item)=>item.key));
  const addedModelItems:NavItem[]=(workspaceModel.data?.definitions??[]).filter((definition)=>!configuredDefinitionKeys.has(definition.apiName)).map((definition)=>({to:definitionRoute(definition),label:definition.pluralName,icon:Layers,permission:'crm.read'}));
  const specialistGroups=experience.specialist?[
    navGroups[0],
    {label:experience.groupLabel,items:templateItems.length?[...templateItems,...addedModelItems]:[
      {to:'/customers',label:workspaceModel.data!.customerPlural,icon:Users,permission:'crm.read'},
      ...workspaceModel.data!.definitions.map((definition)=>({to:definitionRoute(definition),label:definition.pluralName,icon:Layers,permission:'crm.read'})),
    ]},
    {...navGroups[2],items:navGroups[2].items.filter((item)=>item.to!=='/customers')},
    navGroups[3],
  ]:navGroups;
  const extensionItems:NavItem[]=(extensionRuntime.registry?.navigation??[]).map((item)=>({to:String(item.route),label:extensionRuntime.t(`navigation.${item.packageKey}.${item.key}`,String(item.label??item.key)),icon:PackageOpen,permission:'crm.read'}));
  const allGroups=extensionItems.length?[...specialistGroups,{label:'Extensions',items:extensionItems.sort((a,b)=>a.label.localeCompare(b.label))}]:specialistGroups;
  const selectedOrder=(navigationPreferences.data?.personalOrder.length?navigationPreferences.data.personalOrder:navigationPreferences.data?.organisationOrder)??[];
  const visibleGroups=allGroups.map((group)=>({...group,items:orderNavigationItems(group.items.filter(visible),selectedOrder)})).filter((group)=>group.items.length);
  const closeSearch=()=>{setIsSearchOpen(false);requestAnimationFrame(()=>triggerRef.current?.focus());};const openResult=(result:SearchResult)=>{rememberRecentRecord(result);navigate(result.route);closeSearch();};

  useEffect(()=>{const keydown=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();setIsSearchOpen((open)=>!open);}if(!isSearchOpen)return;if(event.key==='Escape'){event.preventDefault();closeSearch();}if(event.key==='ArrowDown'){event.preventDefault();setSelectedIndex((index)=>Math.min(index+1,Math.max(0,flatResults.length-1)));}if(event.key==='ArrowUp'){event.preventDefault();setSelectedIndex((index)=>Math.max(0,index-1));}if(event.key==='Enter'&&flatResults[selectedIndex]){event.preventDefault();openResult(flatResults[selectedIndex]);}};window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);},[isSearchOpen,flatResults,selectedIndex]);
  useEffect(()=>{if(isSearchOpen){setQuery('');setSelectedIndex(0);requestAnimationFrame(()=>inputRef.current?.focus());}},[isSearchOpen]);useEffect(()=>setSelectedIndex(0),[query]);
  const signOut=async()=>{await logout();client.setQueryData(['crm-identity'],{user:null});client.removeQueries();};
  if(isLoading)return <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">Opening local CRM workspace…</div>;if(brandingError||!settings)return <LifecycleBlock title="Published settings unavailable" message={(brandingError as Error)?.message||'The active instance does not have a readable settings projection.'} onSignOut={signOut}/>;

  return <div className="flex min-h-screen bg-slate-50">
    <aside className="hidden w-64 shrink-0 flex-col justify-between border-r bg-white md:flex"><div className="space-y-6 p-5"><div className="flex items-center gap-3 px-2">{settings?.logoUrl?<img src={settings.logoUrl} alt="" className="h-9 w-9 object-contain"/>:<div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">{settings?.businessName?.[0]?.toUpperCase()||'G'}</div>}<div className="min-w-0"><h2 className="truncate font-bold text-slate-800">{settings?.businessName}</h2><p className="truncate text-[10px] font-bold uppercase tracking-wider text-slate-400">{experience.workspaceLabel}</p></div></div><nav className="space-y-5">{visibleGroups.map((group)=><div key={group.label}><p className="mb-1 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">{group.label}</p><div className="space-y-1">{group.items.map(({to,label,icon:Icon})=><NavLink key={`${to}:${label}`} to={to} end={to==='/'} className={({isActive})=>`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive?'bg-primary text-primary-foreground shadow-sm':'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}><Icon className="h-4 w-4"/>{label}</NavLink>)}</div></div>)}</nav><button onClick={()=>setIsNavigationOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs font-bold text-slate-500 hover:border-primary hover:text-primary"><Pencil className="h-3.5 w-3.5"/>Edit navigation</button></div><div className="border-t bg-slate-50/60 p-4"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm"><UserRound className="h-4 w-4 text-primary"/></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-bold text-slate-800">{user.displayName}</p><p className="truncate text-[10px] text-slate-500">{user.roles.map((role)=>role.name).join(', ')}</p><p className="mt-1 text-[10px] text-slate-400">{user.localTrusted?'Trusted local session':'Authenticated session'}</p></div><button onClick={signOut} className="rounded p-1.5 text-slate-400 hover:bg-white hover:text-red-700" aria-label="Sign out or switch user"><LogOut className="h-4 w-4"/></button></div></div></aside>
    <div className="flex min-w-0 flex-1 flex-col"><header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b bg-white px-4 md:px-8"><button ref={triggerRef} onClick={()=>setIsSearchOpen(true)} className="flex w-full max-w-xl items-center gap-3 rounded-lg border bg-slate-50 px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-100" aria-haspopup="dialog"><Search className="h-4 w-4"/><span className="min-w-0 flex-1 truncate">{experience.searchPlaceholder}</span><kbd className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-semibold">Ctrl K</kbd></button>{can('crm.write')&&<Button size="sm" onClick={()=>navigate(experience.specialist?'/customers?action=create':'/organisations')}><Plus className="mr-1.5 h-4 w-4"/>{experience.createLabel}</Button>}</header><main className="flex-1 overflow-y-auto p-4 md:p-8"><Outlet/></main></div>
    {isSearchOpen&&<div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/50 p-4 pt-[10vh]" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={(event)=>event.target===event.currentTarget&&closeSearch()}><div className="flex max-h-[75vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"><div className="flex items-center gap-3 border-b p-4"><Search className="h-5 w-5 text-muted-foreground"/><input ref={inputRef} value={query} onChange={(event)=>setQuery(event.target.value)} className="w-full bg-transparent text-base outline-none" placeholder="Search the local CRM" aria-label="Search query"/><button onClick={closeSearch} aria-label="Close search"><X className="h-5 w-5 text-muted-foreground"/></button></div><div className="overflow-y-auto p-2">{query.trim().length<2?<BlankPalette recents={recents} views={pinnedViews.data??[]} navigate={(route)=>{navigate(route);closeSearch();}} can={can}/>:search.isLoading?<PaletteState text="Searching local records…"/>:search.isError?<PaletteState danger text={(search.error as Error).message}/>:flatResults.length===0?<PaletteState text="No matching records."/>:<div className="space-y-3">{groupSearchResults(flatResults).map((group)=><section key={group.type}><p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{formatEntityLabel(group.type)}</p>{group.items.map((item)=>{const index=flatResults.indexOf(item);return <button key={item.id} onMouseEnter={()=>setSelectedIndex(index)} onClick={()=>openResult(item)} className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left ${selectedIndex===index?'bg-primary/10 ring-1 ring-primary/20':'hover:bg-muted'}`}><div className="min-w-0"><p className="font-bold">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.subtitle}{item.context?` · ${item.context}`:''}</p></div></button>;})}</section>)}</div>}</div>{query.trim().length>=2&&<Link to={`/search${buildQueryString({q:query})}`} onClick={closeSearch} className="border-t px-4 py-3 text-center text-xs font-bold text-primary hover:bg-muted">View all search results</Link>}</div></div>}
    {isNavigationOpen&&<NavigationEditor groups={visibleGroups} preferences={navigationPreferences.data} onClose={()=>setIsNavigationOpen(false)}/>}
  </div>;
}

function NavigationEditor({groups,preferences,onClose}:{groups:Array<{label:string;items:NavItem[]}>;preferences:NavigationPreferences|undefined;onClose:()=>void}){
  const client=useQueryClient();const [scope,setScope]=useState<'personal'|'organisation'>('personal');
  const available=groups.flatMap((group)=>group.items.map((item)=>item.to));
  const [orders,setOrders]=useState<{personal:string[];organisation:string[]}>({
    personal:mergeNavigationOrder(preferences?.personalOrder??[],available),
    organisation:mergeNavigationOrder(preferences?.organisationOrder??[],available),
  });
  const current=orders[scope];
  const save=useMutation({mutationFn:()=>api.put('/api/workspace-design/navigation',{scope,orderedKeys:current}),onSuccess:async()=>{await client.invalidateQueries({queryKey:['workspace-navigation']});onClose();}});
  const move=(key:string,groupKeys:string[],direction:-1|1)=>{const orderedGroup=[...groupKeys].sort((a,b)=>current.indexOf(a)-current.indexOf(b));const index=orderedGroup.indexOf(key);const swap=orderedGroup[index+direction];if(!swap)return;const next=[...current];const left=next.indexOf(key);const right=next.indexOf(swap);[next[left],next[right]]=[next[right],next[left]];setOrders((value)=>({...value,[scope]:next}));};
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label="Edit navigation"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black">Edit navigation</h2><p className="mt-1 text-sm text-muted-foreground">Move the most useful destinations to the top of each section. New template objects are added automatically.</p></div><button onClick={onClose} aria-label="Close"><X className="h-5 w-5"/></button></div>{preferences?.canManageOrganisation&&<div className="mt-5 flex rounded-xl bg-muted p-1"><button onClick={()=>setScope('personal')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${scope==='personal'?'bg-card shadow-sm':''}`}>My navigation</button><button onClick={()=>setScope('organisation')} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold ${scope==='organisation'?'bg-card shadow-sm':''}`}>Organisation default</button></div>}<div className="mt-5 space-y-5">{groups.map((group)=>{const keys=group.items.map((item)=>item.to);const items=[...group.items].sort((a,b)=>current.indexOf(a.to)-current.indexOf(b.to));return <section key={group.label}><p className="mb-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground">{group.label}</p><div className="space-y-2">{items.map((item,index)=><div key={item.to} className="flex items-center gap-3 rounded-xl border p-3"><span className="min-w-0 flex-1 truncate text-sm font-bold">{item.label}</span><button onClick={()=>move(item.to,keys,-1)} disabled={index===0} className="rounded-lg border p-2 disabled:opacity-30" aria-label="Move up"><ArrowUp className="h-4 w-4"/></button><button onClick={()=>move(item.to,keys,1)} disabled={index===items.length-1} className="rounded-lg border p-2 disabled:opacity-30" aria-label="Move down"><ArrowDown className="h-4 w-4"/></button></div>)}</div></section>;})}</div><div className="mt-6 flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.isPending} onClick={()=>save.mutate()}>{save.isPending?'Saving…':scope==='organisation'?'Save organisation default':'Save my navigation'}</Button></div></div></div>;
}
function BlankPalette({recents,views,navigate,can}:{recents:ReturnType<typeof readRecentRecords>;views:SavedView[];navigate:(route:string)=>void;can:(permission:string)=>boolean}){const direct=can('crm.write')?[{title:'Create organisation',route:'/organisations?action=create'},{title:'Create contact',route:'/organisations?intent=create-contact'},{title:'Log activity',route:'/organisations?intent=log-activity'},{title:'Create task',route:'/work?action=create'},{title:'Upload document',route:'/documents?action=upload'},{title:'Compose email',route:'/communications?action=compose'}]:[];if(can('crm.read'))direct.push({title:'Open follow-up queue',route:'/follow-ups'});return <div className="space-y-4 p-2">{direct.length>0&&<section><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Actions</p>{direct.map((item)=><button key={item.route} onClick={()=>navigate(item.route)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"><Plus className="h-4 w-4 text-primary"/>{item.title}</button>)}</section>}{recents.length>0&&<section><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Recently viewed</p>{recents.map((item)=><button key={`${item.entityType}-${item.entityId}`} onClick={()=>navigate(item.route)} className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-muted"><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-muted-foreground">{item.subtitle}</p></button>)}</section>}{views.length>0&&<section><p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pinned views</p>{views.map((view)=><button key={view.id} onClick={()=>navigate(savedViewRoute(view))} className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold hover:bg-muted"><BriefcaseBusiness className="h-4 w-4 text-primary"/>{view.name}</button>)}</section>}</div>;}
function PaletteState({text,danger=false}:{text:string;danger?:boolean}){return <div className={`p-10 text-center text-sm ${danger?'text-destructive':'text-muted-foreground'}`}>{text}</div>;}
