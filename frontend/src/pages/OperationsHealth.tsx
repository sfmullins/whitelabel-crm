import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, FileCheck2, HardDrive, RefreshCw, Search, ShieldAlert } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';

interface Health {
  generatedAt:string;
  accounts:{failed:number;degraded:number};
  synchronization:{failed:number};
  reminders:{failed:number};
  workflows:{failed:number};
  drafts:{failed:number};
  calendarWrites:{failed:number};
  documents:{count:number;bytes:number};
  futureChannels:Array<{channel:string;liveConnectivity:boolean;manualLogging:boolean}>;
}

export default function OperationsHealth(){
  const client=useQueryClient();
  const health=useQuery<Health>({queryKey:['operations-health'],queryFn:()=>api.get('/api/operations-health'),refetchInterval:60_000});
  const maintenance=useMutation({mutationFn:(operation:string)=>api.post('/api/operations-maintenance',{operation}),onSuccess:()=>client.invalidateQueries({queryKey:['operations-health']})});
  if(health.isLoading)return <State text="Loading operational health…"/>;
  if(health.isError||!health.data)return <State danger text={(health.error as Error)?.message||'Operational health unavailable'}/>;
  const data=health.data;
  return <div className="space-y-6"><header><h1 className="text-3xl font-extrabold tracking-tight">Operations health</h1><p className="mt-1 text-sm text-muted-foreground">Local synchronization, reminder, workflow, storage and index diagnostics.</p></header>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><Metric label="Account failures" value={data.accounts.failed+data.accounts.degraded} danger={data.accounts.failed>0}/><Metric label="Failed sync runs" value={data.synchronization.failed} danger={data.synchronization.failed>0}/><Metric label="Failed reminders" value={data.reminders.failed} danger={data.reminders.failed>0}/><Metric label="Workflow failures" value={data.workflows.failed} danger={data.workflows.failed>0}/><Metric label="Failed drafts" value={data.drafts.failed} danger={data.drafts.failed>0}/><Metric label="Calendar conflicts" value={data.calendarWrites.failed} danger={data.calendarWrites.failed>0}/><Metric label="Documents" value={data.documents.count}/><Metric label="Storage" value={`${(data.documents.bytes/1024/1024).toFixed(1)} MB`}/></section>
    <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-primary"/><h2 className="font-bold">Maintenance tools</h2></div><p className="mt-2 text-sm text-muted-foreground">Each action creates an auditable maintenance run and returns a structured result.</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={()=>maintenance.mutate('document_integrity')}><FileCheck2 className="mr-2 h-4 w-4"/>Document integrity</Button><Button variant="outline" onClick={()=>maintenance.mutate('search_reindex')}><Search className="mr-2 h-4 w-4"/>Rebuild search</Button><Button variant="outline" onClick={()=>maintenance.mutate('communication_relink')}><RefreshCw className="mr-2 h-4 w-4"/>Rebuild communication links</Button><Button variant="outline" onClick={()=>maintenance.mutate('storage_report')}><HardDrive className="mr-2 h-4 w-4"/>Storage report</Button></div>{maintenance.isError&&<p className="mt-3 text-sm text-destructive">{(maintenance.error as Error).message}</p>}{maintenance.isSuccess&&<pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">{JSON.stringify(maintenance.data,null,2)}</pre>}</section>
    <section className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><Database className="h-5 w-5 text-primary"/><h2 className="font-bold">Future channel contracts</h2></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{data.futureChannels.map((item)=><div key={item.channel} className="rounded-lg border p-3"><p className="text-sm font-bold capitalize">{item.channel}</p><p className="mt-1 text-xs text-muted-foreground">Manual logging available</p><p className="text-xs text-muted-foreground">Live adapter reserved</p></div>)}</div></section>
  </div>;
}
function Metric({label,value,danger=false}:{label:string;value:string|number;danger?:boolean}){return <div className={`rounded-xl border bg-card p-5 shadow-sm ${danger?'border-red-300':''}`}><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-2 text-3xl font-extrabold ${danger?'text-red-700':''}`}>{value}</p></div>}
function State({text,danger=false}:{text:string;danger?:boolean}){return <div className={`rounded-xl border bg-card p-10 text-center text-sm ${danger?'text-destructive':'text-muted-foreground'}`}>{text}</div>}
