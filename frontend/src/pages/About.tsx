import { useQuery } from '@tanstack/react-query';
import type { ReleaseMetadata } from 'shared/release';
import { api } from '../lib/api';

interface HealthResponse {status:string;time:string;release:ReleaseMetadata;}
interface DesktopInfo extends Partial<ReleaseMetadata>{version:string;userDataPath:string;deploymentMode:'managed'|'standalone';instanceId:string|null;configurationRevision:number|null;}

function Detail({label,value}:{label:string;value:string|number|null|undefined}){return <div><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 break-all text-sm font-medium text-slate-900">{value??'Not available'}</dd></div>;}

export default function About(){
  const health=useQuery<HealthResponse>({queryKey:['release-health'],queryFn:()=>api.get('/health'),staleTime:60_000});
  const desktop=useQuery<DesktopInfo|null>({queryKey:['desktop-application-info'],queryFn:async()=>{const bridge=(window as unknown as {desktop?:{getApplicationInfo:()=>Promise<DesktopInfo>}}).desktop;return bridge?bridge.getApplicationInfo():null;},staleTime:Infinity});
  const release=desktop.data?.commitSha?desktop.data:health.data?.release;
  return <div className="mx-auto max-w-4xl space-y-6">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Release diagnostics</p><h1 className="mt-1 text-3xl font-bold text-slate-900">About WhiteLabelCRM</h1><p className="mt-2 text-sm text-slate-600">Exact build, deployment and compatibility information for support and release verification.</p></header>
    {health.isError?<div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">Release metadata could not be loaded.</div>:<section className="rounded-xl border bg-white p-6 shadow-sm" aria-busy={health.isLoading}><dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <Detail label="Version" value={release?.version}/><Detail label="Channel" value={release?.channel}/><Detail label="Commit" value={release?.commitSha}/><Detail label="Build ID" value={release?.buildId}/><Detail label="Built" value={release?.buildTimestamp}/><Detail label="Mode" value={desktop.data?.deploymentMode??release?.deploymentMode}/><Detail label="Platform" value={release?.platform}/><Detail label="Architecture" value={release?.architecture}/><Detail label="Minimum profile" value={release?.minimumProfileVersion}/><Detail label="Minimum database" value={release?.minimumDatabaseVersion}/><Detail label="Instance" value={desktop.data?.instanceId}/><Detail label="Configuration revision" value={desktop.data?.configurationRevision}/>
    </dl></section>}
    {desktop.data?.userDataPath&&<section className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="font-bold text-slate-900">Local application data</h2><p className="mt-2 break-all font-mono text-xs text-slate-600">{desktop.data.userDataPath}</p><p className="mt-3 text-xs text-slate-500">Managed clients do not store an authoritative CRM database. Standalone data remains isolated on this device.</p></section>}
  </div>;
}
