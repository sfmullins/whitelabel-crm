import { useEffect } from 'react';
import { useQuery,useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

export interface CrmIdentity {
  id:string;
  email:string;
  displayName:string;
  status:'active'|'invited'|'disabled';
  roles:Array<{id:string;key:string;name:string}>;
  permissions:string[];
  teams:Array<{id:string;name:string}>;
  hasPassword:boolean;
  lastLoginAt:string|null;
  localTrusted:boolean;
}

export function useIdentity(){
  const client=useQueryClient();
  const identity=useQuery<{user:CrmIdentity|null}>({queryKey:['crm-identity'],queryFn:()=>api.get('/api/auth/me'),retry:false,staleTime:30_000});
  useEffect(()=>{
    const unauthenticated=()=>{window.localStorage.removeItem('crm.session.token');client.setQueryData(['crm-identity'],{user:null});};
    window.addEventListener('crm:unauthenticated',unauthenticated);
    return()=>window.removeEventListener('crm:unauthenticated',unauthenticated);
  },[client]);
  const user=identity.data?.user??null;
  return {...identity,user,can:(permission:string)=>Boolean(user?.permissions.includes(permission)),isAdministrator:Boolean(user?.roles.some((role)=>role.key==='owner'||role.key==='administrator'))};
}

export async function login(email:string,password:string){
  const result=await api.post<{token:string;expiresAt:string;user:CrmIdentity}>('/api/auth/login',{email,password});
  window.localStorage.setItem('crm.session.token',result.token);window.localStorage.removeItem('crm.localUserId');return result;
}

function stableDeviceIdentifier():string{
  const key='crm.device.identifier';const existing=window.localStorage.getItem(key);if(existing)return existing;
  const generated=typeof crypto.randomUUID==='function'?`${crypto.randomUUID()}-${crypto.randomUUID()}`:Array.from(crypto.getRandomValues(new Uint8Array(32)),(value)=>value.toString(16).padStart(2,'0')).join('');
  window.localStorage.setItem(key,generated);return generated;
}

export async function redeemEmployeeEnrolment(code:string,deviceName:string){
  const result=await api.post<{sessionToken:string;expiresAt:string;user:CrmIdentity;deviceId:string}>('/api/onboarding/enrolments/redeem',{code:code.trim(),deviceName:deviceName.trim(),deviceFingerprint:stableDeviceIdentifier()});
  window.localStorage.setItem('crm.session.token',result.sessionToken);window.localStorage.removeItem('crm.localUserId');return result;
}

export async function selectLocalUser(userId:string){window.localStorage.removeItem('crm.session.token');window.localStorage.setItem('crm.localUserId',userId);return api.post('/api/auth/local-session',{userId});}
export async function logout(){try{await api.post('/api/auth/logout',{});}finally{window.localStorage.removeItem('crm.session.token');window.localStorage.removeItem('crm.localUserId');}}
