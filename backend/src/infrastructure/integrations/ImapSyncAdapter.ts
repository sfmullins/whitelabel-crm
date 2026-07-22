import tls from 'node:tls';
import type { ConnectedAccountConfig,EmailSyncAdapter,EmailSyncBatch,RemoteEmailMessage } from './ConnectedAdapters';
import { parseEmailSyncCursor,serializeEmailSyncCursor } from './ConnectedAdapters';
import { parseRawEmail } from './RawEmailParser';

interface ImapResponse { text:string;literals:Buffer[]; }

function quote(value:string):string { return `"${value.replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`; }
function parseUrl(serverUrl:string):{host:string;port:number;servername:string} {
  const url=new URL(serverUrl);
  if(url.protocol!=='imaps:')throw new Error('WI6 IMAP requires an imaps:// TLS endpoint');
  return {host:url.hostname,port:Number(url.port||993),servername:url.hostname};
}

class ImapSession {
  private socket:tls.TLSSocket|null=null;
  private buffer=Buffer.alloc(0);
  private tag=0;

  async connect(serverUrl:string):Promise<void> {
    const options=parseUrl(serverUrl);
    this.socket=await new Promise<tls.TLSSocket>((resolve,reject)=>{
      let client:tls.TLSSocket;
      client=tls.connect({...options,minVersion:'TLSv1.2',rejectUnauthorized:true},()=>resolve(client));
      client.setTimeout(30_000,()=>client.destroy(new Error('IMAP connection timed out')));
      client.on('error',reject);
    });
    const greeting=await this.readUntilLine();
    if(!/^\* (OK|PREAUTH)/i.test(greeting))throw new Error(`IMAP server rejected connection: ${greeting.slice(0,200)}`);
  }

  async command(command:string):Promise<ImapResponse> {
    if(!this.socket)throw new Error('IMAP session is not connected');
    const tag=`A${String(++this.tag).padStart(4,'0')}`;
    this.socket.write(`${tag} ${command}\r\n`);
    const literals:Buffer[]=[];
    let text='';
    while(true){
      const line=await this.readUntilLine();
      text+=`${line}\r\n`;
      const literal=line.match(/\{(\d+)\}$/);
      if(literal){
        const bytes=await this.readBytes(Number(literal[1]));
        literals.push(bytes);
        text+=`<${bytes.byteLength} byte literal>\r\n`;
      }
      if(line.startsWith(`${tag} `)){
        if(!line.startsWith(`${tag} OK`))throw new Error(`IMAP command failed: ${line.slice(0,500)}`);
        return {text,literals};
      }
    }
  }

  async close():Promise<void> {
    if(!this.socket)return;
    try { await this.command('LOGOUT'); } catch { /* connection may already be gone */ }
    this.socket.end();this.socket.destroy();this.socket=null;
  }

  private async readUntilLine():Promise<string> {
    while(true){
      const index=this.buffer.indexOf('\r\n');
      if(index>=0){const line=this.buffer.subarray(0,index).toString('utf8');this.buffer=this.buffer.subarray(index+2);return line;}
      await this.readChunk();
    }
  }

  private async readBytes(size:number):Promise<Buffer> {
    while(this.buffer.byteLength<size)await this.readChunk();
    const result=this.buffer.subarray(0,size);this.buffer=this.buffer.subarray(size);return result;
  }

  private async readChunk():Promise<void> {
    if(!this.socket)throw new Error('IMAP session is closed');
    const chunk=await new Promise<Buffer>((resolve,reject)=>{
      const onData=(value:Buffer)=>{cleanup();resolve(value);};
      const onError=(error:Error)=>{cleanup();reject(error);};
      const onEnd=()=>{cleanup();reject(new Error('IMAP connection closed unexpectedly'));};
      const cleanup=()=>{this.socket?.off('data',onData);this.socket?.off('error',onError);this.socket?.off('end',onEnd);};
      this.socket!.once('data',onData);this.socket!.once('error',onError);this.socket!.once('end',onEnd);
    });
    this.buffer=Buffer.concat([this.buffer,chunk]);
  }
}

function extractFlags(text:string):string[] {
  const match=text.match(/FLAGS \(([^)]*)\)/i);return match?match[1].split(/\s+/).filter(Boolean):[];
}
function extractInternalDate(text:string):string {
  const match=text.match(/INTERNALDATE "([^"]+)"/i);const parsed=Date.parse(match?.[1]??'');return Number.isFinite(parsed)?new Date(parsed).toISOString():new Date().toISOString();
}
function extractUids(text:string):number[] {
  const lines=text.split(/\r?\n/).filter((line)=>/^\* SEARCH/i.test(line));
  return lines.flatMap((line)=>line.replace(/^\* SEARCH\s*/i,'').trim().split(/\s+/)).map(Number).filter((value)=>Number.isInteger(value)&&value>0);
}
function extractUidValidity(text:string):string|null {
  return text.match(/\[UIDVALIDITY\s+(\d+)\]/i)?.[1]??text.match(/UIDVALIDITY\s+(\d+)/i)?.[1]??null;
}

export class ImapSyncAdapter implements EmailSyncAdapter {
  async test(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<void> {
    const session=new ImapSession();
    try { await session.connect(config.serverUrl);await session.command(`LOGIN ${quote(config.username)} ${quote(secret.password??'')}`); }
    finally { await session.close(); }
  }

  async fetchSince(config:ConnectedAccountConfig,secret:Record<string,string>,cursor:string|null):Promise<EmailSyncBatch> {
    const session=new ImapSession();
    const mailbox=String(config.settings.mailbox??'INBOX');
    const batchSize=Math.max(1,Math.min(500,Number(config.settings.batchSize??100)));
    const messages:RemoteEmailMessage[]=[];
    try {
      await session.connect(config.serverUrl);
      await session.command(`LOGIN ${quote(config.username)} ${quote(secret.password??'')}`);
      const selected=await session.command(`SELECT ${quote(mailbox)}`);
      const uidValidity=extractUidValidity(selected.text);
      let state=parseEmailSyncCursor(cursor,mailbox);
      if(state.mailbox!==mailbox || (state.uidValidity&&uidValidity&&state.uidValidity!==uidValidity))state={mailbox,uidValidity,lastUid:0,failedUids:[]};
      else state={...state,mailbox,uidValidity:uidValidity??state.uidValidity};
      const search=await session.command(`UID SEARCH UID ${Math.max(1,state.lastUid+1)}:*`);
      const newUids=extractUids(search.text);
      const targets=[...new Set([...state.failedUids,...newUids])].sort((a,b)=>a-b).slice(0,batchSize);
      const pendingFailed=state.failedUids.filter((uid)=>!targets.includes(uid));
      let highest=state.lastUid;
      for(const uid of targets){
        const fetched=await session.command(`UID FETCH ${uid} (UID FLAGS INTERNALDATE BODY.PEEK[])`);
        const raw=fetched.literals.at(-1)?.toString('utf8');
        if(!raw)continue;
        messages.push(parseRawEmail({raw,providerMessageKey:`${mailbox}:${uid}`,uid,receivedAt:extractInternalDate(fetched.text),username:config.username,flags:extractFlags(fetched.text)}));
        highest=Math.max(highest,uid);
      }
      return {messages,nextCursor:serializeEmailSyncCursor({mailbox,uidValidity:state.uidValidity,lastUid:highest,failedUids:pendingFailed})};
    } finally { await session.close(); }
  }
}
