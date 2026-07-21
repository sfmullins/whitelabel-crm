import { ChangeEvent, DragEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Download, FileText, UploadCloud } from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

interface OrganisationDirectory { items: Array<{ id:string;name:string }>; }
interface DocumentItem {
  id:string;title:string;currentFilename:string;mimeType:string;byteSize:number;description:string|null;category:string|null;
  createdAt:string;updatedAt:string;archivedAt:string|null;links:Array<{entityType:string;entityId:string}>;
  versions:Array<{id:string;versionNumber:number;filename:string;createdAt:string}>;
}

export default function Documents() {
  const client=useQueryClient();
  const [organisationId,setOrganisationId]=useState('');
  const [showUpload,setShowUpload]=useState(false);
  const [error,setError]=useState('');
  const organisations=useQuery<OrganisationDirectory>({ queryKey:['workspace-organisations','documents'],queryFn:() => api.get('/api/workspace/organisations?limit=200&offset=0') });
  const documents=useQuery<DocumentItem[]>({
    queryKey:['documents',organisationId],
    queryFn:() => api.get(`/api/documents${organisationId ? `?organisationId=${encodeURIComponent(organisationId)}` : ''}`),
  });
  const archive=useMutation({ mutationFn:(id:string) => api.post(`/api/documents/${id}/archive`,{}),onSuccess:() => client.invalidateQueries({queryKey:['documents']}),onError:(value:Error)=>setError(value.message) });
  return <div className="space-y-6"><header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-extrabold tracking-tight">Documents</h1><p className="mt-1 text-sm text-muted-foreground">Versioned files and attachments stored locally outside SQLite.</p></div><Button onClick={() => setShowUpload(true)}><UploadCloud className="mr-2 h-4 w-4"/>Upload</Button></header>
    {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
    <div className="rounded-xl border bg-card p-4 shadow-sm"><select value={organisationId} onChange={(event)=>setOrganisationId(event.target.value)} className="h-10 min-w-64 rounded-md border bg-background px-3 text-sm"><option value="">All organisations</option>{organisations.data?.items.map((org)=><option key={org.id} value={org.id}>{org.name}</option>)}</select></div>
    {documents.isLoading ? <State text="Loading documents…"/> : documents.isError ? <State danger text={(documents.error as Error).message}/> : !documents.data?.length ? <State text="No documents match this view."/> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{documents.data.map((document)=><article key={document.id} className="rounded-xl border bg-card p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><FileText className="h-5 w-5"/></div><div className="min-w-0"><h2 className="truncate font-bold">{document.title}</h2><p className="truncate text-xs text-muted-foreground">{document.currentFilename}</p></div></div><span className="rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase">v{document.versions[0]?.versionNumber ?? 1}</span></div>{document.description && <p className="mt-4 text-sm text-foreground/75">{document.description}</p>}<p className="mt-4 text-xs text-muted-foreground">{formatBytes(document.byteSize)} · {document.mimeType}</p><div className="mt-4 flex gap-2"><a href={`/api/documents/${document.id}/content`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-semibold hover:bg-muted"><Download className="mr-1.5 h-4 w-4"/>Open</a><Button size="sm" variant="outline" onClick={()=>archive.mutate(document.id)}><Archive className="mr-1.5 h-4 w-4"/>Archive</Button></div></article>)}</div>}
    {showUpload && <UploadDialog organisations={organisations.data?.items ?? []} initialOrganisationId={organisationId} onClose={()=>setShowUpload(false)} onUploaded={()=>{setShowUpload(false);client.invalidateQueries({queryKey:['documents']});}}/>}
  </div>;
}

function UploadDialog({organisations,initialOrganisationId,onClose,onUploaded}:{organisations:Array<{id:string;name:string}>;initialOrganisationId:string;onClose:()=>void;onUploaded:()=>void}) {
  const [organisationId,setOrganisationId]=useState(initialOrganisationId);
  const [file,setFile]=useState<File|null>(null);
  const [title,setTitle]=useState('');
  const [description,setDescription]=useState('');
  const [category,setCategory]=useState('');
  const [error,setError]=useState('');
  const upload=useMutation({ mutationFn:async()=>{
    if(!file) throw new Error('Select a file');
    const contentBase64=await toBase64(file);
    return api.post('/api/documents',{ title:title || file.name,filename:file.name,mimeType:file.type || 'text/plain',contentBase64,description:description || null,category:category || null,links:[{entityType:'organisation',entityId:organisationId}] });
  },onSuccess:onUploaded,onError:(value:Error)=>setError(value.message) });
  const choose=(selected:File|null)=>{setFile(selected);if(selected && !title)setTitle(selected.name.replace(/\.[^.]+$/,''));};
  const drop=(event:DragEvent<HTMLDivElement>)=>{event.preventDefault();choose(event.dataTransfer.files[0] ?? null);};
  const change=(event:ChangeEvent<HTMLInputElement>)=>choose(event.target.files?.[0] ?? null);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-xl rounded-xl border bg-card p-6 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-bold">Upload document</h2><p className="text-xs text-muted-foreground">Maximum 8 MB. PDF, images, text and modern Office formats.</p></div><button onClick={onClose}>×</button></div><form className="mt-5 space-y-3" onSubmit={(event)=>{event.preventDefault();upload.mutate();}}><select required value={organisationId} onChange={(event)=>setOrganisationId(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="">Select organisation</option>{organisations.map((org)=><option key={org.id} value={org.id}>{org.name}</option>)}</select><div onDragOver={(event)=>event.preventDefault()} onDrop={drop} className="rounded-xl border-2 border-dashed p-8 text-center"><UploadCloud className="mx-auto h-8 w-8 text-muted-foreground"/><p className="mt-2 text-sm font-semibold">{file ? file.name : 'Drop a file here'}</p><label className="mt-3 inline-flex cursor-pointer rounded-md border px-3 py-2 text-xs font-bold hover:bg-muted">Choose file<input className="hidden" type="file" onChange={change}/></label></div><Input required placeholder="Display title" value={title} onChange={(event)=>setTitle(event.target.value)}/><Input placeholder="Category" value={category} onChange={(event)=>setCategory(event.target.value)}/><textarea className="min-h-24 w-full rounded-md border bg-background p-3 text-sm" placeholder="Description" value={description} onChange={(event)=>setDescription(event.target.value)}/>{error && <p className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!organisationId || !file || upload.isPending}>Upload</Button></div></form></div></div>;
}

function toBase64(file:File):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Could not read file'));reader.onload=()=>{const value=String(reader.result ?? '');resolve(value.includes(',') ? value.slice(value.indexOf(',')+1) : value);};reader.readAsDataURL(file);});}
function formatBytes(value:number){if(value<1024)return `${value} B`;if(value<1024*1024)return `${(value/1024).toFixed(1)} KB`;return `${(value/1024/1024).toFixed(1)} MB`;}
function State({text,danger=false}:{text:string;danger?:boolean}){return <div className={`rounded-xl border bg-card p-10 text-center text-sm ${danger?'text-destructive':'text-muted-foreground'}`}>{text}</div>;}
