import type { EmailAddress,RemoteAttachment,RemoteEmailMessage } from './ConnectedAdapters';

function unfoldHeaders(value:string):string { return value.replace(/\r?\n[\t ]+/g,' '); }
function decodeQuotedPrintable(value:string):Buffer {
  const unfolded=value.replace(/=\r?\n/g,'');
  const bytes:number[]=[];
  for(let index=0;index<unfolded.length;index+=1){
    if(unfolded[index]==='=' && /^[0-9A-Fa-f]{2}$/.test(unfolded.slice(index+1,index+3))){bytes.push(Number.parseInt(unfolded.slice(index+1,index+3),16));index+=2;}
    else bytes.push(unfolded.charCodeAt(index));
  }
  return Buffer.from(bytes);
}
function decodeEncodedWord(value:string):string {
  return value.replace(/=\?([^?]+)\?([bqBQ])\?([^?]+)\?=/g,(_match,charset:string,encoding:string,content:string)=>{
    try {
      const buffer=encoding.toLowerCase()==='b' ? Buffer.from(content,'base64') : decodeQuotedPrintable(content.replace(/_/g,' '));
      return new TextDecoder(charset.toLowerCase()==='iso-8859-1'?'windows-1252':'utf-8').decode(buffer);
    } catch { return content; }
  });
}
function parseAddress(value:string):EmailAddress {
  const match=value.trim().match(/^(?:"?([^"<]+)"?\s*)?<([^>]+)>$/);
  if(match)return {name:match[1]?.trim(),address:match[2].trim().toLowerCase()};
  return {address:value.trim().replace(/^mailto:/i,'').toLowerCase()};
}
function splitAddresses(value:string|undefined):EmailAddress[] {
  if(!value)return [];
  const items:string[]=[];let current='';let quote=false;let angle=0;
  for(const char of value){if(char==='"')quote=!quote;if(!quote&&char==='<')angle+=1;if(!quote&&char==='>')angle=Math.max(0,angle-1);if(char===','&&!quote&&angle===0){items.push(current);current='';}else current+=char;}
  if(current.trim())items.push(current);
  return items.map(parseAddress).filter((item)=>item.address.includes('@'));
}
function parseHeaders(raw:string):Record<string,string> {
  const output:Record<string,string>={};
  for(const line of unfoldHeaders(raw).split(/\r?\n/)){
    const index=line.indexOf(':');if(index<=0)continue;
    output[line.slice(0,index).trim().toLowerCase()]=decodeEncodedWord(line.slice(index+1).trim());
  }
  return output;
}
function headerParameter(value:string|undefined,key:string):string|undefined {
  if(!value)return undefined;
  const match=value.match(new RegExp(`(?:^|;)\\s*${key}=(?:"([^"]+)"|([^;\\s]+))`,'i'));
  return decodeEncodedWord(match?.[1]??match?.[2]??'') || undefined;
}
function decodePart(body:string,encoding:string|undefined):Buffer {
  if(encoding?.toLowerCase()==='base64')return Buffer.from(body.replace(/\s/g,''),'base64');
  if(encoding?.toLowerCase()==='quoted-printable')return decodeQuotedPrintable(body);
  return Buffer.from(body,'utf8');
}
function parseMimeEntity(raw:string):{text:string;html?:string;attachments:RemoteAttachment[]} {
  const split=raw.search(/\r?\n\r?\n/);
  const headers=parseHeaders(split>=0?raw.slice(0,split):'');
  const body=split>=0?raw.slice(split).replace(/^\r?\n\r?\n/,''):raw;
  const contentType=headers['content-type']??'text/plain; charset=utf-8';
  const disposition=headers['content-disposition'];
  const filename=headerParameter(disposition,'filename')??headerParameter(contentType,'name');
  const boundary=headerParameter(contentType,'boundary');
  if(/^multipart\//i.test(contentType)&&boundary){
    const result={text:'',html:undefined as string|undefined,attachments:[] as RemoteAttachment[]};
    const marker=`--${boundary}`;
    for(const part of body.split(marker).slice(1)){
      if(part.startsWith('--'))break;
      const parsed=parseMimeEntity(part.replace(/^\r?\n/,'').replace(/\r?\n$/,''));
      if(parsed.text&&!result.text)result.text=parsed.text;
      if(parsed.html&&!result.html)result.html=parsed.html;
      result.attachments.push(...parsed.attachments);
    }
    return result;
  }
  const decoded=decodePart(body,headers['content-transfer-encoding']);
  const mimeType=contentType.split(';')[0].trim().toLowerCase();
  if(filename || /^attachment/i.test(disposition??'')){
    return {text:'',attachments:[{filename:filename??'attachment',mimeType,contentBase64:decoded.toString('base64'),contentId:headers['content-id']?.replace(/[<>]/g,''),inline:/^inline/i.test(disposition??'')}]};
  }
  const value=new TextDecoder('utf-8').decode(decoded).trim();
  if(mimeType==='text/html')return {text:value.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(),html:value,attachments:[]};
  return {text:value,attachments:[]};
}

export function parseRawEmail(input:{raw:string;providerMessageKey:string;uid:number;receivedAt:string;username:string;flags:string[]}):RemoteEmailMessage {
  const split=input.raw.search(/\r?\n\r?\n/);
  const headers=parseHeaders(split>=0?input.raw.slice(0,split):input.raw);
  const mime=parseMimeEntity(input.raw);
  const from=splitAddresses(headers.from)[0]??{address:'unknown@invalid'};
  const to=splitAddresses(headers.to);
  const cc=splitAddresses(headers.cc);
  const bcc=splitAddresses(headers.bcc);
  const username=input.username.toLowerCase();
  const direction=from.address===username?'outbound':'inbound';
  const rfcMessageId=headers['message-id']?.replace(/[<>]/g,'');
  const references=headers.references?.split(/\s+/).filter(Boolean).map((value)=>value.replace(/[<>]/g,''))??[];
  const inReplyTo=headers['in-reply-to']?.replace(/[<>]/g,'');
  const providerThreadKey=references[0]??inReplyTo??rfcMessageId??`uid:${input.uid}`;
  const dateValue=Date.parse(headers.date??'');
  const sentAt=Number.isFinite(dateValue)?new Date(dateValue).toISOString():input.receivedAt;
  return {
    providerMessageKey:input.providerMessageKey,
    providerThreadKey,
    rfcMessageId,
    direction,
    from,
    to,
    cc,
    bcc,
    subject:headers.subject,
    bodyText:mime.text,
    bodyHtml:mime.html,
    sentAt,
    receivedAt:input.receivedAt,
    isRead:input.flags.some((flag)=>flag.toLowerCase()==='\\seen'),
    headers,
    attachments:mime.attachments,
  };
}
