import { useEffect,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { ArrowRight,Database,Link2,Plus,Settings2,Trash2 } from 'lucide-react';
import type { CustomFieldDefinition,WorkspaceModelDefinition } from 'shared';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { useIdentity } from '../hooks/useIdentity';
import { useWorkspaceModel } from '../hooks/useWorkspaceModel';

interface Relationship {
  id:string;sourceDefinitionId:string;targetType:'customer'|'custom_object';targetDefinitionId:string|null;
  name:string;label:string;cardinality:'many-to-one'|'one-to-many'|'one-to-one';
  sourceName:string;targetName:string|null;
}
interface ObjectImpact {
  id:string;name:string;apiName:string;recordCount:number;fieldCount:number;relationshipCount:number;linkedRecordCount:number;
}

const fieldTypes=[
  ['text','Short text'],['textarea','Long text'],['number','Number'],['currency','Money'],['percentage','Percentage'],
  ['date','Date'],['datetime','Date and time'],['checkbox','Yes / no'],['dropdown','Choose one'],
  ['multi-select','Choose several'],['email','Email'],['phone','Phone'],['url','Web address'],
] as const;

export default function WorkspaceDesign(){
  const identity=useIdentity();const model=useWorkspaceModel();const client=useQueryClient();
  const design=useQuery<{relationships:Relationship[]}>({queryKey:['workspace-design'],queryFn:()=>api.get('/api/workspace-design')});
  const [selectedId,setSelectedId]=useState<string|null>(null);const [showCreate,setShowCreate]=useState(false);
  const definitions=model.data?.definitions??[];
  useEffect(()=>{if(!selectedId&&definitions[0])setSelectedId(definitions[0].id!);},[selectedId,definitions]);
  const selected=definitions.find((item)=>item.id===selectedId)??definitions[0];
  const refresh=async()=>{await Promise.all([client.invalidateQueries({queryKey:['workspace-model']}),client.invalidateQueries({queryKey:['workspace-design']})]);};
  if(!identity.can('schema.manage'))return <State message="Only an owner or administrator can change the workspace structure."/>;
  if(model.isLoading||design.isLoading)return <State message="Opening workspace design…"/>;
  if(model.isError||design.isError)return <State danger message={(model.error||design.error as Error)?.message||'Workspace design could not be loaded'}/>;
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="flex items-center gap-2 text-primary"><Settings2 className="h-5 w-5"/><span className="text-xs font-black uppercase tracking-[0.16em]">Workspace design</span></div><h1 className="mt-2 text-3xl font-black tracking-tight">Shape the CRM around the work</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Objects are the things your team keeps track of. Add the information each object needs, then connect it to customers or another object. Changes appear in navigation, dashboards and bulk import automatically.</p></div>
      <Button onClick={()=>setShowCreate(true)}><Plus className="mr-2 h-4 w-4"/>New object</Button>
    </header>
    <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="px-3 pb-3 pt-2"><p className="text-xs font-black uppercase tracking-wider text-muted-foreground">Objects</p><p className="mt-1 text-xs text-muted-foreground">{definitions.length} in this workspace</p></div>
        <div className="space-y-1">{definitions.map((definition)=><button key={definition.id} onClick={()=>setSelectedId(definition.id!)} className={`w-full rounded-xl px-3 py-3 text-left ${selected?.id===definition.id?'bg-primary text-primary-foreground':'hover:bg-muted'}`}><p className="font-bold">{definition.pluralName}</p><p className={`mt-0.5 text-xs ${selected?.id===definition.id?'text-primary-foreground/75':'text-muted-foreground'}`}>{definition.fields.length} fields · {definition.recordCount} records</p></button>)}</div>
        {!definitions.length&&<div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No custom objects yet. Start with the first thing your team needs to track.</div>}
      </aside>
      <main>{selected?<ObjectEditor definition={selected} allDefinitions={definitions} relationships={design.data?.relationships??[]} refresh={refresh}/>:<EmptyDesign onCreate={()=>setShowCreate(true)}/>}</main>
    </div>
    {showCreate&&<CreateObjectDialog onClose={()=>setShowCreate(false)} onCreated={async(id)=>{await refresh();setSelectedId(id);setShowCreate(false);}}/>}
  </div>;
}

function ObjectEditor({definition,allDefinitions,relationships,refresh}:{definition:WorkspaceModelDefinition;allDefinitions:WorkspaceModelDefinition[];relationships:Relationship[];refresh:()=>Promise<void>}){
  const [showField,setShowField]=useState(false);const [showRelationship,setShowRelationship]=useState(false);const [showDelete,setShowDelete]=useState(false);
  const ownRelationships=relationships.filter((item)=>item.sourceDefinitionId===definition.id);
  return <div className="space-y-5">
    <section className="rounded-2xl border bg-card p-6 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-wider text-primary">Object</p><h2 className="mt-1 text-2xl font-black">{definition.pluralName}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{definition.description||`Information your team keeps about each ${definition.name.toLowerCase()}.`}</p></div><Button variant="outline" className="text-destructive" onClick={()=>setShowDelete(true)}><Trash2 className="mr-2 h-4 w-4"/>Delete object</Button></div></section>
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black">Information to capture</p><p className="mt-1 text-xs text-muted-foreground">These become the fields on every {definition.name.toLowerCase()} record.</p></div><Button size="sm" onClick={()=>setShowField(true)}><Plus className="mr-1 h-4 w-4"/>Add field</Button></div><div className="mt-5 space-y-2">{definition.fields.map((field)=><FieldRow key={field.id} field={field} refresh={refresh}/>)}</div>{!definition.fields.length&&<EmptyLine text="No fields yet. Add the first piece of information your team should capture."/>}</section>
      <section className="rounded-2xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><p className="font-black">Connections</p><p className="mt-1 text-xs text-muted-foreground">Show how this object relates to customers or other records.</p></div><Button size="sm" onClick={()=>setShowRelationship(true)}><Link2 className="mr-1 h-4 w-4"/>Add connection</Button></div><div className="mt-5 space-y-2"><div className="rounded-xl border bg-muted/30 p-3"><p className="text-sm font-bold">{definition.name} <ArrowRight className="mx-1 inline h-3.5 w-3.5"/> Customer</p><p className="mt-1 text-xs text-muted-foreground">Built-in connection. Every record belongs to a customer.</p></div>{ownRelationships.map((relationship)=><RelationshipRow key={relationship.id} relationship={relationship} refresh={refresh}/>)}</div></section>
    </div>
    {showField&&<CreateFieldDialog definition={definition} onClose={()=>setShowField(false)} onCreated={async()=>{await refresh();setShowField(false);}}/>}
    {showRelationship&&<CreateRelationshipDialog definition={definition} allDefinitions={allDefinitions} onClose={()=>setShowRelationship(false)} onCreated={async()=>{await refresh();setShowRelationship(false);}}/>}
    {showDelete&&<DeleteObjectDialog definition={definition} onClose={()=>setShowDelete(false)} onDeleted={refresh}/>}
  </div>;
}

function FieldRow({field,refresh}:{field:CustomFieldDefinition;refresh:()=>Promise<void>}){
  const remove=useMutation({mutationFn:()=>api.delete(`/api/custom-fields/definitions/${field.id}`),onSuccess:refresh});
  return <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-bold">{field.label}{field.required&&<span className="ml-1 text-destructive">*</span>}</p><p className="text-xs text-muted-foreground">{fieldTypes.find(([key])=>key===field.type)?.[1]??field.type}</p></div><button onClick={()=>window.confirm(`Remove the field “${field.label}” and its saved values?`)&&remove.mutate()} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={`Delete ${field.label}`}><Trash2 className="h-4 w-4"/></button></div>;
}
function RelationshipRow({relationship,refresh}:{relationship:Relationship;refresh:()=>Promise<void>}){
  const remove=useMutation({mutationFn:()=>api.delete(`/api/workspace-design/relationships/${relationship.id}`),onSuccess:refresh});
  return <div className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-bold">{relationship.label}</p><p className="text-xs text-muted-foreground">Connects to {relationship.targetType==='customer'?'customers':relationship.targetName} · {relationship.cardinality.replace(/-/g,' ')}</p></div><button onClick={()=>window.confirm(`Remove the connection “${relationship.label}”?`)&&remove.mutate()} className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-4 w-4"/></button></div>;
}

function CreateObjectDialog({onClose,onCreated}:{onClose:()=>void;onCreated:(id:string)=>void}){
  const [name,setName]=useState('');const [pluralName,setPluralName]=useState('');const [description,setDescription]=useState('');const [advanced,setAdvanced]=useState(false);const [apiName,setApiName]=useState('');const [error,setError]=useState('');
  const generated=slug(name);const create=useMutation({mutationFn:()=>api.post<{id:string}>('/api/custom-objects/definitions',{name,pluralName,description,apiName:advanced?apiName:generated}),onSuccess:(value)=>onCreated(value.id),onError:(value:Error)=>setError(value.message)});
  return <Dialog title="Create an object" description="Start with the real-world thing your team needs to keep track of." onClose={onClose}><form className="space-y-4" onSubmit={(event)=>{event.preventDefault();create.mutate();}}><Field label="What is one of these called?"><Input autoFocus value={name} onChange={(event)=>{const next=event.target.value;setPluralName((current)=>!current||current===`${name}s`?`${next}s`:current);setName(next);}} placeholder="e.g. Property, Course, Vehicle"/></Field><Field label="What are several called?"><Input value={pluralName} onChange={(event)=>setPluralName(event.target.value)} placeholder="e.g. Properties, Courses, Vehicles"/></Field><Field label="What does your team use it for?"><textarea className="control min-h-24" value={description} onChange={(event)=>setDescription(event.target.value)} placeholder="A short explanation shown to users."/></Field><button type="button" onClick={()=>setAdvanced((value)=>!value)} className="text-xs font-bold text-muted-foreground">{advanced?'Hide technical name':'Advanced: change technical name'}</button>{advanced&&<Field label="Technical name"><Input value={apiName} onChange={(event)=>setApiName(slug(event.target.value))}/></Field>}{error&&<ErrorText text={error}/>}<Actions onClose={onClose} busy={create.isPending} label="Create object"/></form></Dialog>;
}

function CreateFieldDialog({definition,onClose,onCreated}:{definition:WorkspaceModelDefinition;onClose:()=>void;onCreated:()=>void}){
  const [label,setLabel]=useState('');const [type,setType]=useState('text');const [required,setRequired]=useState(false);const [options,setOptions]=useState('');const [error,setError]=useState('');
  const create=useMutation({mutationFn:()=>api.post(`/api/custom-objects/definitions/${definition.id}/fields`,{name:slug(label),label,type,required,options:['dropdown','multi-select'].includes(type)?options.split('\n').map((item)=>item.trim()).filter(Boolean):[]}),onSuccess:onCreated,onError:(value:Error)=>setError(value.message)});
  return <Dialog title={`Add information to ${definition.name}`} description="Choose a label people will understand. The technical name is generated automatically." onClose={onClose}><form className="space-y-4" onSubmit={(event)=>{event.preventDefault();create.mutate();}}><Field label="Field label"><Input autoFocus value={label} onChange={(event)=>setLabel(event.target.value)} placeholder="e.g. Renewal date"/></Field><Field label="What kind of answer is it?"><select className="control" value={type} onChange={(event)=>setType(event.target.value)}>{fieldTypes.map(([key,name])=><option key={key} value={key}>{name}</option>)}</select></Field>{['dropdown','multi-select'].includes(type)&&<Field label="Choices (one per line)"><textarea className="control min-h-28" value={options} onChange={(event)=>setOptions(event.target.value)}/></Field>}<label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-bold"><input type="checkbox" checked={required} onChange={(event)=>setRequired(event.target.checked)}/>Make this required</label>{error&&<ErrorText text={error}/>}<Actions onClose={onClose} busy={create.isPending} label="Add field"/></form></Dialog>;
}

function CreateRelationshipDialog({definition,allDefinitions,onClose,onCreated}:{definition:WorkspaceModelDefinition;allDefinitions:WorkspaceModelDefinition[];onClose:()=>void;onCreated:()=>void}){
  const candidates=allDefinitions.filter((item)=>item.id!==definition.id);const [target,setTarget]=useState('customer');const [label,setLabel]=useState('');const [cardinality,setCardinality]=useState<'many-to-one'|'one-to-one'>('many-to-one');const [error,setError]=useState('');
  const create=useMutation({mutationFn:()=>api.post('/api/workspace-design/relationships',{sourceDefinitionId:definition.id,targetType:target==='customer'?'customer':'custom_object',targetDefinitionId:target==='customer'?null:target,name:slug(label),label,cardinality}),onSuccess:onCreated,onError:(value:Error)=>setError(value.message)});
  return <Dialog title={`Connect ${definition.pluralName}`} description="Create a named link that explains how records relate." onClose={onClose}><form className="space-y-4" onSubmit={(event)=>{event.preventDefault();create.mutate();}}><Field label="Connect to"><select className="control" value={target} onChange={(event)=>setTarget(event.target.value)}><option value="customer">Customers</option>{candidates.map((item)=><option key={item.id} value={item.id}>{item.pluralName}</option>)}</select></Field><Field label="What should users call this connection?"><Input value={label} onChange={(event)=>setLabel(event.target.value)} placeholder="e.g. Assigned vehicle"/></Field><Field label="How should this connection behave?"><select className="control" value={cardinality} onChange={(event)=>setCardinality(event.target.value as typeof cardinality)}><option value="many-to-one">Several {definition.pluralName.toLowerCase()} may share the same target</option><option value="one-to-one">Each target may be used once</option></select></Field>{error&&<ErrorText text={error}/>}<Actions onClose={onClose} busy={create.isPending} label="Add connection"/></form></Dialog>;
}

function DeleteObjectDialog({definition,onClose,onDeleted}:{definition:WorkspaceModelDefinition;onClose:()=>void;onDeleted:()=>Promise<void>}){
  const impact=useQuery<ObjectImpact>({queryKey:['object-impact',definition.id],queryFn:()=>api.get(`/api/custom-objects/definitions/${definition.id}/impact`)});
  const [confirmation,setConfirmation]=useState('');const [error,setError]=useState('');
  const remove=useMutation({mutationFn:()=>api.deleteJson(`/api/custom-objects/definitions/${definition.id}`,{permanent:true,confirmation}),onSuccess:async()=>{await onDeleted();onClose();},onError:(value:Error)=>setError(value.message)});
  return <Dialog title={`Permanently delete ${definition.name}?`} description="This cannot be undone from the CRM. A database backup is the only recovery route." onClose={onClose}>{impact.isLoading?<State message="Calculating impact…"/>:<div className="space-y-4"><div className="grid grid-cols-2 gap-3">{[['Records',impact.data?.recordCount],['Fields',impact.data?.fieldCount],['Connections',impact.data?.relationshipCount],['Saved links',impact.data?.linkedRecordCount]].map(([label,value])=><div key={String(label)} className="rounded-xl border bg-destructive/5 p-3"><p className="text-2xl font-black">{value??0}</p><p className="text-xs text-muted-foreground">{label} removed</p></div>)}</div><Field label={`Type ${definition.name} to confirm`}><Input value={confirmation} onChange={(event)=>setConfirmation(event.target.value)}/></Field>{error&&<ErrorText text={error}/>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button className="bg-destructive text-destructive-foreground" disabled={confirmation!==definition.name||remove.isPending} onClick={()=>remove.mutate()}>Delete permanently</Button></div></div>}</Dialog>;
}

function EmptyDesign({onCreate}:{onCreate:()=>void}){return <div className="rounded-2xl border border-dashed bg-card p-12 text-center"><Database className="mx-auto h-10 w-10 text-primary"/><h2 className="mt-4 text-xl font-black">Start with an object</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">An object is simply something your team tracks repeatedly.</p><Button className="mt-5" onClick={onCreate}>Create the first object</Button></div>;}
function Dialog({title,description,onClose,children}:{title:string;description:string;onClose:()=>void;children:React.ReactNode}){return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl border bg-card p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div><button onClick={onClose} className="text-xl text-muted-foreground" aria-label="Close">×</button></div>{children}</div></div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="block text-xs font-bold text-muted-foreground">{label}<div className="mt-1.5">{children}</div></label>;}
function Actions({onClose,busy,label}:{onClose:()=>void;busy:boolean;label:string}){return <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy}>{busy?'Saving…':label}</Button></div>;}
function ErrorText({text}:{text:string}){return <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{text}</p>;}
function EmptyLine({text}:{text:string}){return <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{text}</div>;}
function State({message,danger=false}:{message:string;danger?:boolean}){return <div className={`rounded-2xl border bg-card p-10 text-center text-sm ${danger?'text-destructive':'text-muted-foreground'}`}>{message}</div>;}
function slug(value:string){return value.toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,64);}
