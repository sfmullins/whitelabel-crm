import { useEffect,useMemo,useRef,useState } from 'react';
import type { BrandAssetReference,OnboardingConfiguration,OnboardingWorkspace,ReadinessResult,SignedDeploymentProfile } from 'shared/onboarding';
import type { OnboardingImportMapping,OnboardingImportPreview,OnboardingImportResult } from 'shared/onboarding-import';
import { ApiError,api } from '../../lib/api';
import type {
  AdminRole,AdminTeam,AdminUser,CommunicationAccount,CustomFieldDefinition,CustomObjectDefinition,DeviceSummary,
  EnrolmentSummary,ExtensionSummary,ImportHistory,ImportWorkspace,ProvisioningState,SaveState,
} from './models';

type ConfigSection=Exclude<keyof OnboardingConfiguration,'schemaVersion'>;
const emptyImport:ImportWorkspace={fileName:'',csvData:'',preview:null,mapping:{},duplicateStrategy:'skip'};

function errorMessage(error:unknown,fallback:string):string{
  if(error instanceof ApiError)return `${error.message}${error.requestId?` · request ${error.requestId}`:''}`;
  return error instanceof Error?error.message:fallback;
}

async function fileToBase64(file:File):Promise<string>{
  const bytes=new Uint8Array(await file.arrayBuffer());let binary='';const chunkSize=0x8000;
  for(let offset=0;offset<bytes.length;offset+=chunkSize)binary+=String.fromCharCode(...bytes.subarray(offset,offset+chunkSize));
  return btoa(binary);
}

export function useProvisioningWorkspace(onSuccess?:()=>void|Promise<void>){
  const [state,setState]=useState<ProvisioningState|null>(null);
  const [saveState,setSaveState]=useState<SaveState>('loading');
  const [message,setMessage]=useState('');
  const [working,setWorking]=useState<string|null>(null);
  const [importWorkspace,setImportWorkspace]=useState<ImportWorkspace>(emptyImport);
  const lastSaved=useRef('');
  const loaded=useRef(false);
  const stateRef=useRef<ProvisioningState|null>(null);
  const saveTimer=useRef<number|null>(null);
  const savePromise=useRef<Promise<OnboardingWorkspace>|null>(null);
  const loadPromise=useRef<Promise<void>|null>(null);
  const workingRef=useRef<string|null>(null);

  const replaceState=(next:ProvisioningState|null)=>{stateRef.current=next;setState(next);};
  const updateState=(updater:(current:ProvisioningState)=>ProvisioningState)=>setState((current)=>{
    if(!current)return current;
    const next=updater(current);stateRef.current=next;return next;
  });

  useEffect(()=>{void load();return()=>{if(saveTimer.current!==null)window.clearTimeout(saveTimer.current);};},[]);
  useEffect(()=>{
    if(!state||!loaded.current)return;
    const serialized=JSON.stringify(state.draft);
    if(serialized===lastSaved.current)return;
    if(saveTimer.current!==null)window.clearTimeout(saveTimer.current);
    setSaveState('unsaved');
    saveTimer.current=window.setTimeout(()=>{saveTimer.current=null;void persistLatestDraft();},650);
    return()=>{if(saveTimer.current!==null){window.clearTimeout(saveTimer.current);saveTimer.current=null;}};
  },[state?.draft]);

  async function load():Promise<void>{
    if(loadPromise.current)return loadPromise.current;
    const request=(async()=>{
      setSaveState('loading');
      try{
        const workspace=await api.get<OnboardingWorkspace>('/api/onboarding/workspace');
        const [profile,roles,teams,users,customerFields,bookingFields,serviceFields,invoiceFields,objects,extensions,accounts,enrolments,devices,imports]=await Promise.all([
          workspace.deploymentProfileAvailable?api.get<SignedDeploymentProfile>('/api/onboarding/deployment-profile').catch(()=>null):Promise.resolve(null),
          api.get<AdminRole[]>('/api/admin/roles').catch(()=>[]),api.get<AdminTeam[]>('/api/admin/teams').catch(()=>[]),api.get<AdminUser[]>('/api/admin/users').catch(()=>[]),
          api.get<CustomFieldDefinition[]>('/api/custom-fields/definitions?entityType=customer').catch(()=>[]),api.get<CustomFieldDefinition[]>('/api/custom-fields/definitions?entityType=booking').catch(()=>[]),api.get<CustomFieldDefinition[]>('/api/custom-fields/definitions?entityType=service').catch(()=>[]),api.get<CustomFieldDefinition[]>('/api/custom-fields/definitions?entityType=invoice').catch(()=>[]),
          api.get<CustomObjectDefinition[]>('/api/custom-objects/definitions').catch(()=>[]),api.get<ExtensionSummary[]>('/api/extensions').catch(()=>[]),api.get<CommunicationAccount[]>('/api/communication-accounts').catch(()=>[]),
          api.get<EnrolmentSummary[]>('/api/onboarding/enrolments').catch(()=>[]),api.get<DeviceSummary[]>('/api/onboarding/devices').catch(()=>[]),api.get<ImportHistory[]>('/api/onboarding/import/history').catch(()=>[]),
        ]);
        const draft=workspace.draft.configuration;lastSaved.current=JSON.stringify(draft);loaded.current=true;
        replaceState({workspace,draft,profile,roles,teams,users,fields:[...customerFields,...bookingFields,...serviceFields,...invoiceFields],objects,extensions,accounts,enrolments,devices,imports});setSaveState('saved');
      }catch(error){setSaveState('error');setMessage(errorMessage(error,'The onboarding workspace could not be opened.'));}
    })();
    loadPromise.current=request;
    try{await request;}finally{if(loadPromise.current===request)loadPromise.current=null;}
  }

  async function persistLatestDraft():Promise<OnboardingWorkspace|null>{
    if(savePromise.current){try{await savePromise.current;}catch{/* The active request already set the visible error state. */}}
    const current=stateRef.current;if(!current)return null;
    const configuration=structuredClone(current.draft);const serialized=JSON.stringify(configuration);
    if(serialized===lastSaved.current){if(saveState!=='conflict')setSaveState('saved');return current.workspace;}
    setSaveState('saving');
    const request=api.put<OnboardingWorkspace>('/api/onboarding/draft',{configuration,expectedChecksum:current.workspace.draft.checksum});
    savePromise.current=request;
    try{
      const workspace=await request;lastSaved.current=serialized;
      updateState((latest)=>{
        const hasNewerEdits=JSON.stringify(latest.draft)!==serialized;const draft=hasNewerEdits?latest.draft:workspace.draft.configuration;
        return {...latest,workspace:{...workspace,draft:{...workspace.draft,configuration:draft}},draft};
      });
      if(savePromise.current===request)savePromise.current=null;
      const latest=stateRef.current;
      if(latest&&JSON.stringify(latest.draft)!==lastSaved.current){setSaveState('unsaved');return persistLatestDraft();}
      setSaveState('saved');setMessage('');return workspace;
    }catch(error){
      if(error instanceof ApiError&&error.status===409){setSaveState('conflict');setMessage(`${errorMessage(error,'The onboarding draft changed elsewhere.')} Reload the latest revision before continuing.`);}
      else{setSaveState('error');setMessage(errorMessage(error,'The onboarding draft could not be saved.'));}
      return null;
    }finally{if(savePromise.current===request)savePromise.current=null;}
  }

  async function flushDraft():Promise<OnboardingWorkspace|null>{
    if(saveTimer.current!==null){window.clearTimeout(saveTimer.current);saveTimer.current=null;}
    return persistLatestDraft();
  }

  const patch=<K extends ConfigSection>(section:K,value:Partial<OnboardingConfiguration[K]>)=>updateState((current)=>({...current,draft:{...current.draft,[section]:{...current.draft[section],...value}}}));
  const updateTerm=(key:keyof OnboardingConfiguration['terminology'],field:'singular'|'plural',value:string)=>updateState((current)=>({...current,draft:{...current.draft,terminology:{...current.draft.terminology,[key]:{...current.draft.terminology[key],[field]:value}}}}));
  const run=async<T>(key:string,action:()=>Promise<T>,success:string,refresh=true):Promise<T|null>=>{
    if(workingRef.current)return null;workingRef.current=key;setWorking(key);setMessage('');
    try{const result=await action();setMessage(success);if(refresh)await load();return result;}
    catch(error){setMessage(errorMessage(error,'The requested operation failed.'));return null;}
    finally{workingRef.current=null;setWorking(null);}
  };

  const validate=async()=>{const workspace=await flushDraft();if(!workspace)return;const readiness=await run('validate',()=>api.post<ReadinessResult>('/api/onboarding/validate',{expectedChecksum:workspace.draft.checksum}),'Readiness evidence refreshed.',false);if(readiness)updateState((current)=>({...current,workspace:{...current.workspace,readiness}}));};
  const publish=async()=>{const workspace=await flushDraft();if(!workspace)return;const result=await run('publish',()=>api.post<{workspace:OnboardingWorkspace;deploymentProfile:SignedDeploymentProfile}>('/api/onboarding/publish',{expectedChecksum:workspace.draft.checksum}),'The signed instance profile is published and the workspace is active.',false);if(result){lastSaved.current=JSON.stringify(result.workspace.draft.configuration);replaceState(stateRef.current?{...stateRef.current,workspace:result.workspace,draft:result.workspace.draft.configuration,profile:result.deploymentProfile}:stateRef.current);await onSuccess?.();}};
  const rollback=async(revisionId:string)=>{const workspace=await flushDraft();if(!workspace)return;const result=await run('rollback',()=>api.post<{workspace:OnboardingWorkspace;deploymentProfile:SignedDeploymentProfile}>(`/api/onboarding/rollback/${revisionId}`,{expectedChecksum:workspace.draft.checksum}),'The selected configuration was restored as a new signed publication.',false);if(result){lastSaved.current=JSON.stringify(result.workspace.draft.configuration);replaceState(stateRef.current?{...stateRef.current,workspace:result.workspace,draft:result.workspace.draft.configuration,profile:result.deploymentProfile}:stateRef.current);}};

  const uploadBrandAsset=async(file:File):Promise<BrandAssetReference|null>=>{
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setMessage('Use PNG, JPEG or WebP. Executable SVG content is not accepted.');return null;}
    if(file.size<1||file.size>1_048_576){setMessage('The logo must be between 1 byte and 1 MB.');return null;}
    const result=await run('brand-asset',async()=>api.post<BrandAssetReference>('/api/onboarding/assets',{contentBase64:await fileToBase64(file),mimeType:file.type,fileName:file.name}),'Brand asset uploaded and verified.',false);
    if(result)patch('branding',{logoUrl:result.url,logoAsset:result});return result;
  };

  const createTeam=(input:{name:string;description?:string})=>run('team',()=>api.post('/api/admin/teams',input),'Team created.');
  const createUser=(input:{email:string;displayName:string;roleKeys:string[];teamIds:string[]})=>run('user',()=>api.post('/api/admin/users',input),'Employee account created.');
  const createField=(input:{entityType:string;name:string;label:string;type:string;required:boolean;options:string[]})=>run('field',()=>api.post('/api/custom-fields/definitions',input),'Custom field created in the canonical schema registry.');
  const createObject=(input:{name:string;apiName:string;pluralName:string;description?:string})=>run('object',()=>api.post('/api/custom-objects/definitions',input),'Custom entity created in the canonical schema registry.');
  const testAccount=(id:string)=>run(`account:${id}`,()=>api.post(`/api/communication-accounts/${id}/test`,{}),'Connection test completed.');

  const toggleExtension=(extension:ExtensionSummary,enabled:boolean)=>updateState((current)=>{const retained=current.draft.extensions.filter((item)=>item.packageKey!==extension.packageKey);return {...current,draft:{...current.draft,extensions:[...retained,{packageKey:extension.packageKey,enabled,approvedCapabilities:extension.capabilities??[]}]}};});
  const createEnrolment=(userId:string,deviceLimit=1)=>run('enrolment',()=>api.post<{enrolmentToken:string}>('/api/onboarding/enrolments',{userId,deviceLimit}),'One-time employee enrolment created.',false);
  const revokeEnrolment=(id:string)=>run(`enrolment:${id}`,()=>api.post(`/api/onboarding/enrolments/${id}/revoke`,{}),'Enrolment revoked.');
  const revokeDevice=(id:string)=>run(`device:${id}`,()=>api.post(`/api/onboarding/devices/${id}/revoke`,{}),'Device revoked and the employee sessions were cleared.');

  const loadImportFile=async(file:File)=>{if(file.size>5_000_000){setMessage('CSV files are limited to 5 MB.');return;}const csvData=await file.text();setImportWorkspace({fileName:file.name,csvData,preview:null,mapping:{},duplicateStrategy:'skip'});setMessage('CSV loaded. Preview it to confirm mapping and row quality before any data changes.');};
  const previewImport=async(mapping?:Partial<OnboardingImportMapping>)=>{if(!importWorkspace.csvData)return;const result=await run('import-preview',()=>api.post<OnboardingImportPreview>('/api/onboarding/import/preview',{csvData:importWorkspace.csvData,mapping:mapping??importWorkspace.mapping,duplicateStrategy:importWorkspace.duplicateStrategy,target:'organisations-and-contacts'}),'Import preview completed.',false);if(result)setImportWorkspace((current)=>({...current,preview:result,mapping:result.mapping}));};
  const commitImport=async()=>{const preview=importWorkspace.preview;if(!preview)return;const result=await run('import-commit',()=>api.post<OnboardingImportResult>('/api/onboarding/import/commit',{csvData:importWorkspace.csvData,mapping:preview.mapping,duplicateStrategy:importWorkspace.duplicateStrategy,target:'organisations-and-contacts',previewChecksum:preview.checksum}),'Import committed transactionally.');if(result)setImportWorkspace(emptyImport);};

  const downloadDeploymentFiles=()=>{if(!stateRef.current?.profile)return;const profile=stateRef.current.profile;const base=profile.profile.businessIdentity.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'crm';download(JSON.stringify(profile,null,2),`${base}.crmdeploy.json`,'application/json');window.setTimeout(()=>download(profile.publicKey,`${base}.crmdeploy.json.pub`,'text/plain'),120);setMessage('The signed profile and detached public-key trust anchor were downloaded.');};
  const selectedExtensions=useMemo(()=>new Map(state?.draft.extensions.map((item)=>[item.packageKey,item])??[]),[state?.draft.extensions]);

  return {state,saveState,message,setMessage,working,patch,updateTerm,validate,publish,rollback,uploadBrandAsset,createTeam,createUser,createField,createObject,testAccount,toggleExtension,createEnrolment,revokeEnrolment,revokeDevice,loadImportFile,previewImport,commitImport,importWorkspace,setImportWorkspace,downloadDeploymentFiles,selectedExtensions,reload:load,flushDraft};
}

function download(content:string,fileName:string,type:string){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();URL.revokeObjectURL(url);}
