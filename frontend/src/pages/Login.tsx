import { FormEvent,useState } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { LockKeyhole,ShieldCheck,UserRound } from 'lucide-react';
import { Button } from '../components/ui/button';
import { api } from '../lib/api';
import { login,selectLocalUser,type CrmIdentity } from '../hooks/useIdentity';

interface LocalUser {id:string;email:string;displayName:string;roles:Array<{key:string;name:string}>;}

export default function Login(){
  const client=useQueryClient();const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [working,setWorking]=useState(false);
  const locals=useQuery<LocalUser[]>({queryKey:['local-users'],queryFn:()=>api.get('/api/auth/local-users'),retry:false});
  const refresh=async()=>{await client.invalidateQueries({queryKey:['crm-identity']});};
  const submit=async(event:FormEvent)=>{event.preventDefault();setWorking(true);setError('');try{await login(email,password);await refresh();}catch(value){setError(value instanceof Error?value.message:String(value));}finally{setWorking(false);}};
  const choose=async(userId:string)=>{setWorking(true);setError('');try{await selectLocalUser(userId);await refresh();}catch(value){setError(value instanceof Error?value.message:String(value));}finally{setWorking(false);}};
  return <div className="flex min-h-screen items-center justify-center bg-slate-950 p-5"><div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-7 text-slate-100 shadow-2xl">
    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ShieldCheck className="h-6 w-6"/></div><h1 className="mt-5 text-2xl font-black">Open CRM workspace</h1><p className="mt-2 text-sm text-slate-400">Use a named local profile on this device or sign in with an authenticated account.</p>
    {locals.data?.length?<section className="mt-6"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Local profiles</p><div className="mt-2 space-y-2">{locals.data.map((user)=><button key={user.id} disabled={working} onClick={()=>choose(user.id)} className="flex w-full items-center gap-3 rounded-xl border border-slate-700 p-3 text-left hover:bg-slate-800 disabled:opacity-50"><div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800"><UserRound className="h-4 w-4"/></div><div><p className="text-sm font-bold">{user.displayName}</p><p className="text-xs text-slate-400">{user.email} · {user.roles.map((role)=>role.name).join(', ')}</p></div></button>)}</div></section>:null}
    <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-slate-800"/><span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">Account login</span><div className="h-px flex-1 bg-slate-800"/></div>
    <form onSubmit={submit} className="space-y-4"><label className="block text-xs font-bold text-slate-300">Email<input autoComplete="username" type="email" value={email} onChange={(event)=>setEmail(event.target.value)} required className="mt-1.5 h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm outline-none focus:border-primary"/></label><label className="block text-xs font-bold text-slate-300">Password<div className="relative mt-1.5"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-500"/><input autoComplete="current-password" type="password" value={password} onChange={(event)=>setPassword(event.target.value)} required className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 pl-10 pr-3 text-sm outline-none focus:border-primary"/></div></label>{error&&<p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">{error}</p>}<Button className="w-full" disabled={working}>{working?'Opening workspace…':'Sign in'}</Button></form>
  </div></div>;
}
