import { useEffect,useMemo,useRef,useState } from 'react';
import type { OnboardingConfiguration,OnboardingWorkspace,ReadinessResult,SignedDeploymentProfile } from 'shared/onboarding';
import type { OnboardingImportMapping,OnboardingImportPreview,OnboardingImportResult } from 'shared/onboarding-import';
import { api } from '../../lib/api';
import type {
  AdminRole,AdminTeam,AdminUser,CommunicationAccount,CustomFieldDefinition,CustomObjectDefinition,DeviceSummary,
  EnrolmentSummary,ExtensionSummary,ImportHistory,ImportWorkspace,ProvisioningState,SaveState,
} from './models';

type ConfigSection=Exclude<keyof OnboardingConfiguration,'schemaVersion'>;
const emptyImport:ImportWorkspace={fileName:'',csvData:'',preview:null,mapping:{},duplicateStrategy:'skip'};

export function useProvisioningWorkspace(onSuccess?:()=>void){
  const [state,setState]=useState<ProvisioningState|null>(null);
  const [saveState,setSaveState]=useState<SaveState>('loading');
  const [message,setMessage]=useState('');
  const [working,setWorking]=useState<string|null>(null);
  const [importWorkspace,setImportWorkspace]=useState<ImportWorkspace>(emptyImport);
  const lastSaved=useRef('');const loaded=useRef(false);

  useEffect(()=>{void load();},[]);
  useEffect(()=>{
    if(!state||!loaded.current)return;const serialized=JSON.stringify(state.draft);if(serialized===lastSaved.current)return;
    setSaveState('saving');const timer=window.setTimeout(async()=>{
      try{const workspace=await api.put<OnboardingWorkspace>('/api/onboarding/draft',state.draft);lastSaved.current=serialized;setState((current)=>current?{...current,workspace:{...workspace,draft:{...workspace.draft,configuration:current.draft}}}:current);setSaveState('saved');}
      catch(error){setSaveState('error');setMessage(error instanceof Error?error.message:'The onboarding draft could not be saved.');}
    },650);return()=>window.clearTimeout(timer);
  },[state?.draft]);

  async function load(){
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
      setState({workspace,draft,profile,roles,teams,users,fields:[...customerFields,...bookingFields,...serviceFields,...invoiceFields],objects,extensions,accounts,enrolments,devices,imports});setSaveState('saved');
    }catch(error){setSaveState('error');setMessage(error instanceof Error?error.message:'The onboarding workspace could not be opened.');}
  }

  const patch=<K extends ConfigSection>(section:K,value:Partial<OnboardingConfiguration[K]>)=>setState((current)=>current?{...current,draft:{...current.draft,[section]:{...current.draft[section],...value}}}:current);
  const updateTerm=(key:keyof OnboardingConfiguration['terminology'],field:'singular'|'plural',value:string)=>setState((current)=>current?{...current,draft:{...current.draft,terminology:{...current.draft.terminology,[key]:{...current.draft.terminology[key],[field]:value}}}}:current);
  const run=async<T>(key:string,action:()=>Promise<T>,success:string,refresh=true):Promise<T|null>=>{setWorking(key);setMessage('');try{const result=await action();setMessage(success);if(refresh)await load();return result;}catch(error){setMessage(error instanceof Error?error.message:String(error));return null;}finally{setWorking(null);}};

  const validate=async()=>{if(!state)return;const readiness=await run('validate',()=>api.post<ReadinessResult>('/api/onboarding/validate',{}),'Readiness evidence refreshed.',false);if(readiness)setState((current)=>current?{...current,workspace:{...current.workspace,readiness}}:current);};
  const publish=async()=>{const result=await run('publish',()=>api.post<{workspace:OnboardingWorkspace;deploymentProfile:SignedDeploymentProfile}>('/api/onboarding/publish',{}),'The signed instance profile is published and ready for WI13 packaging.',false);if(result){setState((current)=>current?{...current,workspace:result.workspace,draft:result.workspace.draft.configuration,profile:result.deploymentProfile}:current);lastSaved.current=JSON.stringify(result.workspace.draft.configuration);onSuccess?.();}};
  const rollback=async(revisionId:string)=>{const result=await run('rollback',()=>api.post<{workspace:OnboardingWorkspace;deploymentProfile:SignedDeploymentProfile}>(`/api/onboarding/rollback/${revisionId}`,{}),'The selected configuration was restored as a new signed publication.',false);if(result){setState((current)=>current?{...current,workspace:result.workspace,draft:result.workspace.draft.configuration,profile:result.deploymentProfile}:current);lastSaved.current=JSON.stringify(result.workspace.draft.configuration);}};

  const createTeam=(input:{name:string;description?:string})=>run('team',()=>api.post('/api/admin/teams',input),'Team created.');
  const createUser=(input:{email:string;displayName:string;roleKeys:string[];teamIds:string[]})=>run('user',()=>api.post('/api/admin/users',input),'Employee account created.');
  const createField=(input:{entityType:string;name:string;label:string;type:string;required:boolean;options:string[]})=>run('field',()=>api.post('/api/custom-fields/definitions',input),'Custom field created in the canonical schema registry.');
  const createObject=(input:{name:string;apiName:string;pluralName:string;description?:string})=>run('object',()=>api.post('/api/custom-objects/definitions',input),'Custom entity created in the canonical schema registry.');
  const testAccount=(id:string)=>run(`account:${id}`,()=>api.post(`/api/communication-accounts/${id}/test`,{}),'Connection test completed.');

  const toggleExtension=(extension:ExtensionSummary,enabled:boolean)=>setState((current)=>{
    if(!current)return current;const retained=current.draft.extensions.filter((item)=>item.packageKey!==extension.packageKey);return {...current,draft:{...current.draft,extensions:[...retained,{packageKey:extension.packageKey,enabled,approvedCapabilities:extension.capabilities??[]}]}};
  });
  const createEnrolment=(userId:string,deviceLimit=1)=>run('enrolment',()=>api.post<{enrolmentToken:string}>('/api/onboarding/enrolments',{userId,deviceLimit}),'One-time employee enrolment created.',false);
  const revokeEnrolment=(id:string)=>run(`enrolment:${id}`,()=>api.post(`/api/onboarding/enrolments/${id}/revoke`,{}),'Enrolment revoked.');
  const revokeDevice=(id:string)=>run(`device:${id}`,()=>api.post(`/api/onboarding/devices/${id}/revoke`,{}),'Device revoked and the employee sessions were cleared.');

  const loadImportFile=async(file:File)=>{if(file.size>5_000_000){setMessage('CSV files are limited to 5 MB.');return;}const csvData=await file.text();setImportWorkspace({fileName:file.name,csvData,preview:null,mapping:{},duplicateStrategy:'skip'});setMessage('CSV loaded. Preview it to confirm mapping and row quality before any data changes.');};
  const previewImport=async(mapping?:Partial<OnboardingImportMapping>)=>{if(!importWorkspace.csvData)return;const result=await run('import-preview',()=>api.post<OnboardingImportPreview>('/api/onboarding/import/preview',{csvData:importWorkspace.csvData,mapping:mapping??importWorkspace.mapping,duplicateStrategy:importWorkspace.duplicateStrategy,target:'organisations-and-contacts'}),'Import preview completed.',false);if(result)setImportWorkspace((current)=>({...current,preview:result,mapping:result.mapping}));};
  const commitImport=async()=>{const preview=importWorkspace.preview;if(!preview)return;const result=await run('import-commit',()=>api.post<OnboardingImportResult>('/api/onboarding/import/commit',{csvData:importWorkspace.csvData,mapping:preview.mapping,duplicateStrategy:importWorkspace.duplicateStrategy,target:'organisations-and-contacts',previewChecksum:preview.checksum}),'Import committed transactionally.');if(result)setImportWorkspace(emptyImport);};

  const downloadDeploymentFiles=()=>{if(!state?.profile)return;const profile=state.profile;const base=profile.profile.businessIdentity.displayName.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'crm';download(JSON.stringify(profile,null,2),`${base}.crmdeploy.json`,'application/json');window.setTimeout(()=>download(profile.publicKey,`${base}.crmdeploy.json.pub`,'text/plain'),120);setMessage('The signed profile and detached public-key trust anchor were downloaded. WI13 must package both.');};
  const selectedExtensions=useMemo(()=>new Map(state?.draft.extensions.map((item)=>[item.packageKey,item])??[]),[state?.draft.extensions]);

  return {state,saveState,message,setMessage,working,patch,updateTerm,validate,publish,rollback,createTeam,createUser,createField,createObject,testAccount,toggleExtension,createEnrolment,revokeEnrolment,revokeDevice,loadImportFile,previewImport,commitImport,importWorkspace,setImportWorkspace,downloadDeploymentFiles,selectedExtensions,reload:load};
}

function download(content:string,fileName:string,type:string){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=fileName;anchor.click();URL.revokeObjectURL(url);}
