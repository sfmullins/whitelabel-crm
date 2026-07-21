import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, MessageSquare, Phone, Plus, Users } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface OrganisationDirectory { items:Array<{id:string;name:string}>; }
interface Communication { id:string;organisationId:string;organisationName:string;channel:string;direction:string;subject:string|null;body:string;occurredAt:string;status:string; }

export default function Communications(){
  const client=useQueryClient();
  const [organisationId,setOrganisationId]=useState('');
  const [channel,setChannel]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const organisations=useQuery<OrganisationDirectory>({queryKey:['workspace-organisations','communications'],queryFn:()=>api.get('/api/workspace/organisations?limit=200&offset=0')});
  const communications=useQuery<Communication[]>({queryKey:['communications',organisationId,channel],queryFn:()=>api.get(`/api/communications?limit=300${organisationId?`&organisationId=${encodeURIComponent(organisationId)}`:''}${channel?`&channel=${encodeURIComponent(channel)}`:''}`)});
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight">Communications</h1><p className="mt-1 text-sm text-muted-foreground">One channel-neutral record of emails, meetings, calls and future integrations.</p></div><Button onClick={()=>setShowCreate(true)}><Plus className="mr-2 h-4 w-4"/>Log communication</Button></header>
    <div className="flex flex-wrap gap-3 rounded-xl border bg-card p-4 shadow-sm"><select value={organisationId} onChange={(event)=>setOrganisationId(event.target.value)} className="h-10 min-w-64 rounded-md border bg-background px-3 text-sm"><option value="">All organisations</option>{organisations.data?.items.map((org)=><option key={org.id} value={org.id}>{org.name}</option>)}</select><select value={channel} onChange={(event)=>setChannel(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option value="">All channels</option>{['email','meeting','phone','sms','whatsapp','teams','slack','voip','other'].map((value)=><option key={value}>{value}</option>)}</select></div>
    {communications.isLoading?<State text="Loading communications…"/>:communications.isError?<State danger text={(communications.error as Error).message}/>:!communications.data?.length?<State text="No communication records match this view."/>:<div className="space-y-3">{communications.data.map((item)=><article key={item.id} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start gap-4"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon(item.channel)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-3"><div><span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">{item.channel}</span><h2 className="mt-2 font-bold">{item.subject || `${item.channel} communication`}</h2></div><time className="text-xs text-muted-foreground">{new Date(item.occurredAt).toLocaleString()}</time></div><p className="mt-2 whitespace-pre-wrap text-sm text-foreground/80">{item.body}</p><p className="mt-3 text-xs text-muted-foreground">{item.organisationName} · {item.direction} · {item.status}</p></div></div></article>)}</div>}
    {showCreate&&<CommunicationDialog organisations={organisations.data?.items??[]} initialOrganisationId={organisationId} onClose={()=>setShowCreate(false)} onCreated={()=>{setShowCreate(false);client.invalidateQueries({queryKey:['communications']});client.invalidateQueries({queryKey:['search']});}}/>}
  </div>;
}

function CommunicationDialog({organisations,initialOrganisationId,onClose,onCreated}:{organisations:Array<{id:string;name:string}>;initialOrganisationId:string;onClose:()=>void;onCreated:()=>void}){
  const [organisationId,setOrganisationId]=useState(initialOrganisationId);
  const [channel,setChannel]=useState('email');
  const [direction,setDirection]=useState('internal');
  const [subject,setSubject]=useState('');
  const [body,setBody]=useState('');
  const [occurredAt,setOccurredAt]=useState(new Date().toISOString().slice(0,16));
  const [error,setError]=useState('');
  const create=useMutation({mutationFn:()=>api.post('/api/communications',{organisationId,channel,direction,subject:subject||null,body,occurredAt:new Date(occurredAt).toISOString()}),onSuccess:onCreated,onError:(value:Error)=>setError(value.message)});
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Log communication</h2><p className="text-xs text-muted-foreground">Manual records use the same model as future synced channels.</p></div><button onClick={onClose}>×</button></div><form className="mt-5 space-y-3" onSubmit={(event)=>{event.preventDefault();create.mutate();}}><select required value={organisationId} onChange={(event)=>setOrganisationId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select organisation</option>{organisations.map((org)=><option key={org.id} value={org.id}>{org.name}</option>)}</select><div className="grid gap-3 sm:grid-cols-2"><select value={channel} onChange={(event)=>setChannel(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm">{['email','meeting','phone','sms','whatsapp','teams','slack','voip','other'].map((value)=><option key={value}>{value}</option>)}</select><select value={direction} onChange={(event)=>setDirection(event.target.value)} className="h-10 rounded-md border bg-background px-3 text-sm"><option>internal</option><option>inbound</option><option>outbound</option></select></div><Input placeholder="Subject or summary" value={subject} onChange={(event)=>setSubject(event.target.value)}/><Input type="datetime-local" value={occurredAt} onChange={(event)=>setOccurredAt(event.target.value)}/><textarea required className="min-h-36 w-full rounded-md border bg-background p-3 text-sm" placeholder="Communication details" value={body} onChange={(event)=>setBody(event.target.value)}/>{error&&<p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!organisationId||!body.trim()||create.isPending}>Save</Button></div></form></div></div>;
}
function icon(channel:string){if(channel==='email')return <Mail className="h-5 w-5"/>;if(channel==='meeting'||channel==='teams')return <Users className="h-5 w-5"/>;if(channel==='phone'||channel==='voip')return <Phone className="h-5 w-5"/>;return <MessageSquare className="h-5 w-5"/>;}
function State({text,danger=false}:{text:string;danger?:boolean}){return <div className={`rounded-xl border bg-card p-10 text-center text-sm ${danger?'text-destructive':'text-muted-foreground'}`}>{text}</div>;}
