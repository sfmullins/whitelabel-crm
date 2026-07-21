import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, Plus, Workflow } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface WorkflowDefinition { id:string;name:string;description:string|null;enabled:boolean;version:number;triggerType:string;actions:Array<{type:string}>; }
interface WorkflowRun { id:string;workflowName:string;status:string;startedAt:string;completedAt:string|null;reused?:boolean;actions:Array<{actionType:string;status:string}>; }
interface OrganisationDirectory { items:Array<{id:string;name:string}>; }

export default function Automation(){
  const client=useQueryClient();
  const [showCreate,setShowCreate]=useState(false);
  const [runWorkflow,setRunWorkflow]=useState<WorkflowDefinition|null>(null);
  const [error,setError]=useState('');
  const definitions=useQuery<WorkflowDefinition[]>({queryKey:['workflows'],queryFn:()=>api.get('/api/workflows')});
  const runs=useQuery<WorkflowRun[]>({queryKey:['workflow-runs'],queryFn:()=>api.get('/api/workflow-runs')});
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight">Automation</h1><p className="mt-1 text-sm text-muted-foreground">Allow-listed, auditable workflows with idempotent runs.</p></div><Button onClick={()=>setShowCreate(true)}><Plus className="mr-2 h-4 w-4"/>Create workflow</Button></header>{error&&<div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    <section className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><h2 className="font-bold">Definitions</h2>{definitions.isLoading?<State text="Loading workflows…"/>:!definitions.data?.length?<State text="No workflows defined."/>:definitions.data.map((workflow)=><article key={workflow.id} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><Workflow className="h-5 w-5 text-primary"/><h3 className="font-bold">{workflow.name}</h3></div><p className="mt-2 text-sm text-muted-foreground">{workflow.description||'No description'}</p><p className="mt-3 text-xs text-muted-foreground">Trigger: {workflow.triggerType} · {workflow.actions.length} action(s) · v{workflow.version}</p></div><Button size="sm" variant="outline" disabled={!workflow.enabled} onClick={()=>setRunWorkflow(workflow)}><Play className="mr-1 h-4 w-4"/>Run</Button></div></article>)}</div>
      <div className="space-y-3"><h2 className="font-bold">Recent runs</h2>{runs.isLoading?<State text="Loading runs…"/>:!runs.data?.length?<State text="No workflow executions."/>:runs.data.slice(0,20).map((run)=><article key={run.id} className="rounded-xl border bg-card p-4 shadow-sm"><div className="flex justify-between gap-3"><div><h3 className="text-sm font-bold">{run.workflowName}</h3><p className="text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString()} · {run.actions.length} action(s)</p></div><span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${run.status==='succeeded'?'bg-emerald-100 text-emerald-700':run.status==='failed'?'bg-red-100 text-red-700':'bg-amber-100 text-amber-700'}`}>{run.status}</span></div></article>)}</div></section>
    {showCreate&&<CreateDialog onClose={()=>setShowCreate(false)} onCreated={()=>{setShowCreate(false);client.invalidateQueries({queryKey:['workflows']});}}/>}{runWorkflow&&<RunDialog workflow={runWorkflow} onClose={()=>setRunWorkflow(null)} onRun={()=>{setRunWorkflow(null);client.invalidateQueries({queryKey:['workflow-runs']});client.invalidateQueries({queryKey:['work']});}} onError={setError}/>} 
  </div>;
}

function CreateDialog({onClose,onCreated}:{onClose:()=>void;onCreated:()=>void}){
  const [name,setName]=useState('Post-meeting follow-up');const [description,setDescription]=useState('Create a follow-up task after a meeting.');const [title,setTitle]=useState('Send meeting follow-up');const [error,setError]=useState('');
  const create=useMutation({mutationFn:()=>api.post('/api/workflows',{name,description,triggerType:'manual',conditions:{},actions:[{type:'create_task',title,priority:'high'}]}),onSuccess:onCreated,onError:(value:Error)=>setError(value.message)});
  return <Modal title="Create workflow" onClose={onClose}><form className="space-y-3" onSubmit={(event)=>{event.preventDefault();create.mutate();}}><Input required value={name} onChange={(event)=>setName(event.target.value)} placeholder="Workflow name"/><Input value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="Description"/><label className="block text-xs font-semibold text-muted-foreground">Create task action<Input className="mt-1" required value={title} onChange={(event)=>setTitle(event.target.value)}/></label><p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">WI5 workflows are intentionally constrained to allow-listed actions. External sends are not permitted.</p>{error&&<p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={create.isPending}>Create</Button></div></form></Modal>;
}

function RunDialog({workflow,onClose,onRun,onError}:{workflow:WorkflowDefinition;onClose:()=>void;onRun:()=>void;onError:(message:string)=>void}){
  const organisations=useQuery<OrganisationDirectory>({queryKey:['workspace-organisations','workflow-run'],queryFn:()=>api.get('/api/workspace/organisations?limit=200&offset=0')});
  const [organisationId,setOrganisationId]=useState('');
  const run=useMutation({mutationFn:()=>api.post(`/api/workflows/${workflow.id}/run`,{sourceType:'organisation',sourceId:organisationId,triggerEvent:'manual',idempotencyKey:`manual:${workflow.id}:${organisationId}:${Date.now()}`,context:{organisationId}}),onSuccess:onRun,onError:(value:Error)=>onError(value.message)});
  return <Modal title={`Run ${workflow.name}`} onClose={onClose}><div className="space-y-4"><select required value={organisationId} onChange={(event)=>setOrganisationId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select organisation context</option>{organisations.data?.items.map((org)=><option key={org.id} value={org.id}>{org.name}</option>)}</select><p className="text-sm text-muted-foreground">The run is recorded with an idempotency key and action-level results.</p><div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!organisationId||run.isPending} onClick={()=>run.mutate()}><Play className="mr-2 h-4 w-4"/>Run workflow</Button></div></div></Modal>;
}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-xl border bg-card p-6 shadow-2xl"><div className="mb-5 flex justify-between"><h2 className="text-xl font-bold">{title}</h2><button onClick={onClose}>×</button></div>{children}</div></div>;}
function State({text}:{text:string}){return <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">{text}</div>;}
