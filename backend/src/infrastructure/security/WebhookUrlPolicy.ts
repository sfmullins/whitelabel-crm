import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

function normalizedHostname(value:string):string{return value.replace(/^\[/,'').replace(/\]$/,'').toLowerCase();}
function loopbackHostname(value:string):boolean{const host=normalizedHostname(value);return host==='localhost'||host.endsWith('.localhost')||host==='127.0.0.1'||host==='::1';}
function allowLoopback():boolean{return process.env.CRM_ALLOW_LOOPBACK_WEBHOOKS==='true';}

export function isPrivateOrSpecialAddress(value:string):boolean {
  const address=normalizedHostname(value);
  if(isIP(address)===4){
    const parts=address.split('.').map(Number);const [a,b]=parts;
    return a===0||a===10||a===127||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===0)||(a===192&&b===168)||(a===198&&b>=18&&b<=19)||(a===198&&b===51)||(a===203&&b===0)||(a>=224);
  }
  if(isIP(address)===6){
    const compact=address.toLowerCase();
    if(compact==='::'||compact==='::1'||compact.startsWith('fc')||compact.startsWith('fd')||/^fe[89ab]/.test(compact)||compact.startsWith('2001:db8:'))return true;
    const mapped=compact.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);return mapped?isPrivateOrSpecialAddress(mapped[1]):false;
  }
  return false;
}

export function validateWebhookEndpoint(value:string):string {
  const url=new URL(value.trim());const hostname=normalizedHostname(url.hostname);const local=loopbackHostname(hostname);
  if(url.username||url.password||url.hash)throw new Error('Webhook URL must not contain credentials or a fragment');
  if(url.protocol!=='https:'&&!(local&&url.protocol==='http:'&&allowLoopback()))throw new Error('Webhook URL must use HTTPS');
  if((local||isPrivateOrSpecialAddress(hostname))&&!allowLoopback())throw new Error('Webhook URL must not target a private, loopback or special-use address');
  if((hostname.endsWith('.local')||hostname.endsWith('.internal'))&&!allowLoopback())throw new Error('Webhook URL must not target a local or internal hostname');
  return url.toString();
}

export async function assertWebhookDestinationAllowed(value:string):Promise<void> {
  const url=new URL(validateWebhookEndpoint(value));const hostname=normalizedHostname(url.hostname);if(loopbackHostname(hostname)&&allowLoopback())return;
  const addresses=await lookup(hostname,{all:true,verbatim:true});if(!addresses.length)throw new Error('Webhook hostname did not resolve');
  if(addresses.some((entry)=>isPrivateOrSpecialAddress(entry.address)))throw new Error('Webhook hostname resolves to a private or special-use address');
}
