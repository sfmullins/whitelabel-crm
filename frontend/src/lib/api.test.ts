import { afterEach,describe,expect,it,vi } from 'vitest';
import { ApiError,api } from './api';

describe('structured API errors',()=>{
  afterEach(()=>vi.restoreAllMocks());

  it('preserves status, code, details and request ID',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'INSTANCE_ONBOARDING_REQUIRED',message:'Publish the instance first',details:{status:'provisioning'},requestId:'request-123'}),{status:409,headers:{'content-type':'application/json','x-request-id':'header-request'}})));
    await expect(api.get('/api/workspace/dashboard')).rejects.toMatchObject({name:'ApiError',status:409,code:'INSTANCE_ONBOARDING_REQUIRED',details:{status:'provisioning'},requestId:'request-123'});
  });

  it('uses the response request header when the body is not JSON',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('gateway failure',{status:502,statusText:'Bad Gateway',headers:{'x-request-id':'gateway-request'}})));
    try{await api.post('/api/example',{});throw new Error('Expected request to fail');}
    catch(error){expect(error).toBeInstanceOf(ApiError);expect(error).toMatchObject({status:502,code:'HTTP_502',requestId:'gateway-request'});}
  });
});
