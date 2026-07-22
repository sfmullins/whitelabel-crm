function applyIdentity(headers:Headers):void{
  if(typeof window==='undefined')return;
  const token=window.localStorage.getItem('crm.session.token');
  const localUserId=window.localStorage.getItem('crm.localUserId');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  else if(localUserId)headers.set('x-crm-user-id',localUserId);
}

export async function apiFetch<T=unknown>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers||{});if(!(options.body instanceof FormData))headers.set('Content-Type','application/json');applyIdentity(headers);
  const response=await fetch(path,{...options,headers});
  if(!response.ok){let errorMessage='An error occurred';try{const errorJson=await response.json() as {error?:string;message?:string};errorMessage=errorJson.message||errorJson.error||errorMessage;}catch{errorMessage=response.statusText||errorMessage;}if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('crm:unauthenticated'));throw new Error(errorMessage);}
  if(response.status===204)return {} as T;return response.json() as Promise<T>;
}

async function download(path:string):Promise<{blob:Blob;filename:string}>{const headers=new Headers();applyIdentity(headers);const response=await fetch(path,{headers});if(!response.ok)throw new Error((await response.text())||response.statusText);const disposition=response.headers.get('content-disposition')||'';const filename=disposition.match(/filename="?([^";]+)"?/i)?.[1]||'download';return {blob:await response.blob(),filename};}

export const api={
  get:<T=unknown>(path:string,options:RequestInit={})=>apiFetch<T>(path,options),
  post:<T=unknown>(path:string,body:unknown,options:RequestInit={})=>apiFetch<T>(path,{...options,method:'POST',body:JSON.stringify(body)}),
  put:<T=unknown>(path:string,body:unknown,options:RequestInit={})=>apiFetch<T>(path,{...options,method:'PUT',body:JSON.stringify(body)}),
  patch:<T=unknown>(path:string,body:unknown,options:RequestInit={})=>apiFetch<T>(path,{...options,method:'PATCH',body:JSON.stringify(body)}),
  delete:<T=unknown>(path:string,options:RequestInit={})=>apiFetch<T>(path,{...options,method:'DELETE'}),
  download,
};
