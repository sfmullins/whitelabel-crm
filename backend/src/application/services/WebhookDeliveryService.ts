import crypto from 'node:crypto';
import { PlatformRepository } from '../../infrastructure/database/PlatformRepository';
import { assertWebhookDestinationAllowed } from '../../infrastructure/security/WebhookUrlPolicy';

export function signWebhookPayload(secret:string,timestamp:string,body:string):string {
  return `sha256=${crypto.createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

export class WebhookDeliveryService {
  private timer:NodeJS.Timeout|null=null;
  private running=false;

  constructor(
    private readonly repository=new PlatformRepository(),
    private readonly intervalMs=30_000,
  ){}

  start():void {
    if(this.timer)return;
    void this.processDue();
    this.timer=setInterval(()=>void this.processDue(),this.intervalMs);
    this.timer.unref?.();
  }

  stop():void {if(this.timer)clearInterval(this.timer);this.timer=null;}

  async processDue(limit=25):Promise<{succeeded:number;failed:number}> {
    if(this.running)return {succeeded:0,failed:0};
    this.running=true;let succeeded=0;let failed=0;
    try{
      for(const delivery of this.repository.dueDeliveries(limit)){
        const timestamp=Math.floor(Date.now()/1000).toString();
        const body=JSON.stringify({id:delivery.eventId,eventType:delivery.eventType,eventVersion:1,occurredAt:delivery.createdAt,payload:JSON.parse(delivery.payload)});
        try{
          await assertWebhookDestinationAllowed(delivery.endpointUrl);
          const secret=this.repository.getWebhookSecret(delivery.credentialKey);
          const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),10_000);
          try{
            const response=await fetch(delivery.endpointUrl,{method:'POST',headers:{'content-type':'application/json','user-agent':'WhiteLabelCRM-Webhook/1.0','x-wlc-event':delivery.eventType,'x-wlc-delivery':delivery.id,'x-wlc-timestamp':timestamp,'x-wlc-signature':signWebhookPayload(secret,timestamp,body)},body,signal:controller.signal,redirect:'error'});
            if(response.ok){this.repository.markDeliverySucceeded(delivery.id,response.status);succeeded+=1;}
            else{this.repository.markDeliveryFailed(delivery.id,response.status,`Webhook endpoint returned HTTP ${response.status}`);failed+=1;}
          }finally{clearTimeout(timeout);}
        }catch(error){this.repository.markDeliveryFailed(delivery.id,null,error instanceof Error?error.message:String(error));failed+=1;}
      }
      return {succeeded,failed};
    }finally{this.running=false;}
  }
}
