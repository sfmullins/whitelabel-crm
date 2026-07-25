import { useMemo,useState } from 'react';
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query';
import { Link,useParams } from 'react-router-dom';
import { ArrowLeft,Plus,Users } from 'lucide-react';
import type { Customer,CustomFieldDefinition,CustomObjectRecord,WorkspaceModelDefinition,WorkspaceModelRelationship } from 'shared';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { recordTitle } from '../lib/workspaceModel';
import { useWorkspaceModel } from '../hooks/useWorkspaceModel';

export default function ModelRecords(){
  const {apiName}=useParams<{apiName:string}>();
  const model=useWorkspaceModel();
  const definition=model.data?.definitions.find((item)=>item.apiName===apiName);
  const records=useQuery<CustomObjectRecord[]>({
    queryKey:['model-records',definition?.id],
    queryFn:()=>api.get(`/api/custom-objects/records?definitionId=${definition?.id}`),
    enabled:Boolean(definition?.id),
  });
  const customers=useQuery<Customer[]>({
    queryKey:['customers','workspace-model-directory'],
    queryFn:()=>api.get('/api/customers'),
    enabled:Boolean(definition),
  });
  const [showCreate,setShowCreate]=useState(false);
  const customerNames=useMemo(()=>new Map((customers.data??[]).map((customer)=>[
    customer.id,`${customer.firstName} ${customer.lastName}`.trim(),
  ])),[customers.data]);

  if(model.isLoading)return <DirectorySkeleton/>;
  if(model.isError)return <ErrorState message={(model.error as Error).message}/>;
  if(!definition)return <ErrorState message="This record type is not part of the active workspace model."/>;
  return <div className="space-y-6">
    <div>
      <Link to="/" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-primary"><ArrowLeft className="h-3.5 w-3.5"/>Back to overview</Link>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-bold uppercase tracking-wider text-primary">{model.data?.templateName} model active</p><h1 className="mt-1 text-3xl font-extrabold tracking-tight">{definition.pluralName}</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{definition.description||`Manage ${definition.pluralName.toLowerCase()} connected to ${model.data?.customerPlural.toLowerCase()}.`}</p></div>
        <Button onClick={()=>setShowCreate(true)}><Plus className="mr-2 h-4 w-4"/>Add {definition.name.toLowerCase()}</Button>
      </div>
    </div>
    {records.isLoading?<DirectorySkeleton/>:records.isError?<ErrorState message={(records.error as Error).message}/>: (records.data??[]).length===0?
      <div className="rounded-xl border border-dashed bg-card p-12 text-center"><Users className="mx-auto h-10 w-10 text-muted-foreground"/><h2 className="mt-4 font-bold">No {definition.pluralName.toLowerCase()} yet</h2><p className="mt-1 text-sm text-muted-foreground">Add the first record here. It will also appear in the connected {model.data?.customerSingular.toLowerCase()} profile.</p><Button className="mt-5" onClick={()=>setShowCreate(true)}><Plus className="mr-2 h-4 w-4"/>Add {definition.name.toLowerCase()}</Button></div>:
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm"><table className="w-full text-left text-sm"><thead className="border-b bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><tr><th className="p-4">{definition.name}</th><th className="p-4">{model.data?.customerSingular}</th>{definition.fields.slice(0,3).map((field)=><th className="hidden p-4 lg:table-cell" key={field.id}>{field.label}</th>)}</tr></thead><tbody className="divide-y">{records.data!.map((record)=><tr key={record.id} className="hover:bg-muted/20"><td className="p-4 font-bold">{recordTitle(definition,record.values??{})}</td><td className="p-4"><Link className="font-semibold text-primary hover:underline" to={`/customers/${record.customerId}`}>{customerNames.get(record.customerId)||'Open connected record'}</Link></td>{definition.fields.slice(0,3).map((field)=><td className="hidden max-w-[240px] truncate p-4 text-muted-foreground lg:table-cell" key={field.id}>{displayValue(record.values?.[field.name])}</td>)}</tr>)}</tbody></table></div>}
    {showCreate&&<CreateRecordDialog definition={definition} definitions={model.data?.definitions??[]} customers={customers.data??[]} customerLabel={model.data?.customerSingular??'Customer'} onClose={()=>setShowCreate(false)}/>}
  </div>;
}

function CreateRecordDialog({definition,definitions,customers,customerLabel,onClose}:{definition:WorkspaceModelDefinition;definitions:WorkspaceModelDefinition[];customers:Customer[];customerLabel:string;onClose:()=>void}){
  const client=useQueryClient();const [customerId,setCustomerId]=useState(customers[0]?.id??'');const [values,setValues]=useState<Record<string,string>>({});const [relationships,setRelationships]=useState<Record<string,string>>({});const [error,setError]=useState('');
  const create=useMutation({
    mutationFn:()=>api.post('/api/custom-objects/records',{objectDefinitionId:definition.id,customerId,values,relationships}),
    onSuccess:async()=>{await Promise.all([client.invalidateQueries({queryKey:['model-records',definition.id]}),client.invalidateQueries({queryKey:['workspace-model']})]);onClose();},
    onError:(value:Error)=>setError(value.message),
  });
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-label={`Add ${definition.name}`}><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border bg-card p-6 shadow-2xl"><div className="mb-5 flex items-start justify-between"><div><h2 className="text-xl font-bold">Add {definition.name.toLowerCase()}</h2><p className="mt-1 text-xs text-muted-foreground">This will be connected to the selected {customerLabel.toLowerCase()}.</p></div><button onClick={onClose} aria-label="Close">×</button></div>{customers.length===0?<div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Add a {customerLabel.toLowerCase()} first, then return here.</div>:<form className="space-y-4" onSubmit={(event)=>{event.preventDefault();create.mutate();}}><label className="block space-y-1 text-xs font-bold text-muted-foreground">{customerLabel}<select required value={customerId} onChange={(event)=>setCustomerId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground"><option value="">Select {customerLabel.toLowerCase()}</option>{customers.map((customer)=><option value={customer.id} key={customer.id}>{customer.firstName} {customer.lastName}</option>)}</select></label><div className="grid gap-4 md:grid-cols-2">{definition.fields.map((field)=><RecordField key={field.id} field={field} value={values[field.name]??''} onChange={(value)=>setValues((current)=>({...current,[field.name]:value}))}/>)}</div>{(definition.relationships??[]).length>0&&<div className="border-t pt-4"><p className="mb-3 text-xs font-black uppercase tracking-wider text-muted-foreground">Connections</p><div className="grid gap-4 md:grid-cols-2">{definition.relationships?.map((relationship)=><RelationshipPicker key={relationship.id} relationship={relationship} definitions={definitions} customers={customers} value={relationships[relationship.id]??''} onChange={(value)=>setRelationships((current)=>({...current,[relationship.id]:value}))}/>)}</div></div>}{error&&<p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button disabled={create.isPending}>{create.isPending?'Adding…':`Add ${definition.name.toLowerCase()}`}</Button></div></form>}</div></div>;
}

function RelationshipPicker({relationship,definitions,customers,value,onChange}:{relationship:WorkspaceModelRelationship;definitions:WorkspaceModelDefinition[];customers:Customer[];value:string;onChange:(value:string)=>void}){
  const target=definitions.find((definition)=>definition.id===relationship.targetDefinitionId);
  const records=useQuery<CustomObjectRecord[]>({queryKey:['relationship-target-records',relationship.targetDefinitionId],queryFn:()=>api.get(`/api/custom-objects/records?definitionId=${relationship.targetDefinitionId}`),enabled:relationship.targetType==='custom_object'&&Boolean(relationship.targetDefinitionId)});
  const options=relationship.targetType==='customer'?customers.map((customer)=>({id:customer.id!,label:`${customer.firstName} ${customer.lastName}`.trim()})):(records.data??[]).map((record)=>({id:record.id!,label:target?recordTitle(target,record.values??{}):record.id!}));
  return <label className="space-y-1 text-xs font-bold text-muted-foreground">{relationship.label}<select className="h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={value} onChange={(event)=>onChange(event.target.value)}><option value="">No connection</option>{options.map((option)=><option key={option.id} value={option.id}>{option.label}</option>)}</select></label>;
}

function RecordField({field,value,onChange}:{field:CustomFieldDefinition;value:string;onChange:(value:string)=>void}){
  const label=<span>{field.label}{field.required&&<span className="ml-1 text-destructive">*</span>}</span>;
  if(field.type==='textarea')return <label className="space-y-1 text-xs font-bold text-muted-foreground md:col-span-2">{label}<textarea required={field.required} className="min-h-24 w-full rounded-md border bg-background p-3 text-sm text-foreground" value={value} onChange={(event)=>onChange(event.target.value)}/></label>;
  if(field.type==='dropdown'||field.type==='multi-select')return <label className="space-y-1 text-xs font-bold text-muted-foreground">{label}<select required={field.required} multiple={field.type==='multi-select'} className="min-h-10 w-full rounded-md border bg-background px-3 text-sm text-foreground" value={field.type==='multi-select'?value.split(',').filter(Boolean):value} onChange={(event)=>onChange(field.type==='multi-select'?Array.from(event.target.selectedOptions).map((item)=>item.value).join(','):event.target.value)}><option value="">Select</option>{field.options.map((option)=><option key={option}>{option}</option>)}</select></label>;
  if(field.type==='checkbox')return <label className="flex items-center gap-2 rounded-lg border p-3 text-sm font-semibold"><input type="checkbox" checked={value==='true'} onChange={(event)=>onChange(String(event.target.checked))}/>{label}</label>;
  const inputType=field.type==='date'?'date':field.type==='datetime'?'datetime-local':field.type==='email'?'email':field.type==='url'?'url':field.type==='number'||field.type==='currency'||field.type==='percentage'?'number':'text';
  return <label className="space-y-1 text-xs font-bold text-muted-foreground">{label}<Input required={field.required} type={inputType} value={value} onChange={(event)=>onChange(event.target.value)}/></label>;
}
function displayValue(value:unknown){if(value==='true')return 'Yes';if(value==='false')return 'No';if(value===undefined||value===null||value==='')return '—';return String(value);}
function DirectorySkeleton(){return <div className="space-y-4">{[1,2,3].map((item)=><div key={item} className="h-20 animate-pulse rounded-xl bg-muted"/>)}</div>;}
function ErrorState({message}:{message:string}){return <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-8 text-destructive">{message}</div>;}
