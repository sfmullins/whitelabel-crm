export class ApiError extends Error{
  readonly status:number;
  readonly code:string;
  readonly details:unknown;
  readonly requestId:string|null;
  constructor(input:{status:number;code:string;message:string;details?:unknown;requestId?:string|null}){
    super(input.message);this.name='ApiError';this.status=input.status;this.code=input.code;this.details=input.details??null;this.requestId=input.requestId??null;
  }
}

function applyIdentity(headers:Headers):void{
  if(typeof window==='undefined')return;
  const token=window.localStorage.getItem('crm.session.token');
  const localUserId=window.localStorage.getItem('crm.localUserId');
  if(token)headers.set('Authorization',`Bearer ${token}`);
  else if(localUserId)headers.set('x-crm-user-id',localUserId);
}

interface ApiErrorBody {error?:string;message?:string;details?:unknown;requestId?:string;}
async function responseError(response:Response):Promise<ApiError>{
  let body:ApiErrorBody|undefined;
  try{body=await response.json() as ApiErrorBody;}catch{body=undefined;}
  const requestId=body?.requestId??response.headers.get('x-request-id');
  return new ApiError({status:response.status,code:body?.error??`HTTP_${response.status}`,message:body?.message??response.statusText??'Request failed',details:body?.details,requestId});
}

export async function apiFetch<T=unknown>(path:string,options:RequestInit={}):Promise<T>{
  const headers=new Headers(options.headers||{});if(options.body!==undefined&&!(options.body instanceof FormData)&&!headers.has('content-type'))headers.set('Content-Type','application/json');applyIdentity(headers);
  const response=await fetch(path,{...options,headers});
  if(!response.ok){const error=await responseError(response);if(response.status===401&&typeof window!=='undefined')window.dispatchEvent(new CustomEvent('crm:unauthenticated'));throw error;}
  if(response.status===204)return {} as T;return response.json() as Promise<T>;
}

async function download(path:string):Promise<{blob:Blob;filename:string}>{const headers=new Headers();applyIdentity(headers);const response=await fetch(path,{headers});if(!response.ok)throw await responseError(response);const disposition=response.headers.get('content-disposition')||'';const filename=disposition.match(/filename="?([^";]+)"?/i)?.[1]||'download';return {blob:await response.blob(),filename};}

function jsonRequest<T>(method:string,path:string,body:unknown,options:RequestInit={}):Promise<T>{return apiFetch<T>(path,{...options,method,body:JSON.stringify(body)});}
export const api={
  get:<T=unknown>(path:string,options:RequestInit={})=>apiFetch<T>(path,options),
  post:<T=unknown>(path:string,body:unknown,options:RequestInit={})=>jsonRequest<T>('POST',path,body,options),
  put:<T=unknown>(path:string,body:unknown,options:RequestInit={})=>jsonRequest<T>('PUT',path,body,options),
  patch:<T=unknown>(path:string,body:unknown,options:RequestInit={})=>jsonRequest<T>('PATCH',path,body,options),
  delete:<T=unknown>(path:string,options:RequestInit={})=>apiFetch<T>(path,{...options,method:'DELETE'}),
  download,
};
