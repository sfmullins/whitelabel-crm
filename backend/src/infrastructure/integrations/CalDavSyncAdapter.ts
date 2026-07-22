import type { CalendarSyncAdapter,CalendarSyncBatch,ConnectedAccountConfig,EmailAddress,RemoteCalendar,RemoteCalendarEvent } from './ConnectedAdapters';

function authorization(username:string,password:string):string { return `Basic ${Buffer.from(`${username}:${password}`,'utf8').toString('base64')}`; }
function decodeXml(value:string):string { return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'); }
function escapeXml(value:string):string { return value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function xmlValues(xml:string,name:string):string[] {
  const expression=new RegExp(`<(?:[a-zA-Z0-9_-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-zA-Z0-9_-]+:)?${name}>`,'gi');
  return [...xml.matchAll(expression)].map((match)=>decodeXml(match[1].replace(/<[^>]+>/g,'').trim()));
}
function responseBlocks(xml:string):string[] {
  return [...xml.matchAll(/<(?:[a-zA-Z0-9_-]+:)?response(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?response>/gi)].map((match)=>match[1]);
}
function unfoldIcs(value:string):string { return value.replace(/\r?\n[ \t]/g,''); }
function unescapeIcs(value:string):string { return value.replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\\;/g,';').replace(/\\\\/g,'\\'); }
function icsProperty(lines:string[],name:string):Array<{params:Record<string,string>;value:string}> {
  return lines.filter((line)=>line.toUpperCase().startsWith(`${name.toUpperCase()}`)).map((line)=>{
    const index=line.indexOf(':');if(index<0)return {params:{},value:''};
    const [, ...parameterParts]=line.slice(0,index).split(';');
    const params=Object.fromEntries(parameterParts.map((part)=>{const split=part.indexOf('=');return split<0?[part.toUpperCase(),'']:[part.slice(0,split).toUpperCase(),part.slice(split+1).replace(/^"|"$/g,'')];}));
    return {params,value:unescapeIcs(line.slice(index+1))};
  });
}
function zonedDateTimeToUtc(parts:number[],timeZone:string):string {
  const [year,month,day,hour,minute,second]=parts;
  let guess=Date.UTC(year,month-1,day,hour,minute,second);
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  for(let iteration=0;iteration<3;iteration+=1){
    const values=Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part)=>part.type!=='literal').map((part)=>[part.type,Number(part.value)]));
    const represented=Date.UTC(values.year,values.month-1,values.day,values.hour,values.minute,values.second);
    const adjustment=represented-Date.UTC(year,month-1,day,hour,minute,second);
    const next=guess-adjustment;
    if(next===guess)break;
    guess=next;
  }
  return new Date(guess).toISOString();
}
function parseIcsDate(value:string,timeZone?:string):string {
  if(/^\d{8}$/.test(value))return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00.000Z`;
  const match=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if(!match)throw new Error(`Unsupported iCalendar date: ${value}`);
  const parts=match.slice(1,7).map(Number);
  if(match[7]==='Z')return new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5])).toISOString();
  return timeZone?zonedDateTimeToUtc(parts,timeZone):new Date(Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5])).toISOString();
}
function parseAttendee(value:{params:Record<string,string>;value:string}):EmailAddress & {responseStatus?:string} {
  return {name:value.params.CN,address:value.value.replace(/^mailto:/i,'').toLowerCase(),responseStatus:value.params.PARTSTAT?.toLowerCase()};
}
function parseEvent(ics:string,resourceHref:string,etag?:string):RemoteCalendarEvent|null {
  const unfolded=unfoldIcs(ics);
  const event=unfolded.match(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/i)?.[1];
  if(!event)return null;
  const lines=event.split(/\r?\n/);
  const first=(name:string)=>icsProperty(lines,name)[0]?.value;
  const uid=first('UID')??resourceHref;
  const start=icsProperty(lines,'DTSTART')[0];
  const end=icsProperty(lines,'DTEND')[0];
  if(!start||!end)return null;
  const timezone=start.params.TZID??'UTC';
  return {
    providerEventKey:uid,
    resourceHref,
    etag,
    title:first('SUMMARY')??'(Untitled event)',
    description:first('DESCRIPTION'),
    location:first('LOCATION'),
    startsAt:parseIcsDate(start.value,start.params.TZID),
    endsAt:parseIcsDate(end.value,end.params.TZID??start.params.TZID),
    timezone,
    recurrence:first('RRULE')?{rrule:first('RRULE')}:undefined,
    attendees:icsProperty(lines,'ATTENDEE').map(parseAttendee),
    cancelled:(first('STATUS')??'').toUpperCase()==='CANCELLED',
  };
}

async function davRequest(config:ConnectedAccountConfig,secret:Record<string,string>,url:string,method:string,body?:string,depth='1'):Promise<Response> {
  return fetch(url,{method,headers:{authorization:authorization(config.username,secret.password??''),depth,'content-type':'application/xml; charset=utf-8','user-agent':'WhiteLabelCRM/1.0'},body});
}
async function requireDav(config:ConnectedAccountConfig,secret:Record<string,string>,url:string,method:string,body?:string,depth='1'):Promise<Response> {
  const response=await davRequest(config,secret,url,method,body,depth);
  if(!response.ok)throw new Error(`CalDAV ${method} failed (${response.status} ${response.statusText})`);
  return response;
}
async function readSyncToken(config:ConnectedAccountConfig,secret:Record<string,string>,calendarUrl:string):Promise<string|null>{
  const response=await requireDav(config,secret,calendarUrl,'PROPFIND','<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:sync-token/></d:prop></d:propfind>','0');
  return xmlValues(await response.text(),'sync-token')[0]??null;
}

export class CalDavSyncAdapter implements CalendarSyncAdapter {
  async test(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<void> {
    await requireDav(config,secret,config.serverUrl,'PROPFIND','<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>','0');
  }

  async discover(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<RemoteCalendar[]> {
    const response=await requireDav(config,secret,config.serverUrl,'PROPFIND','<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/><d:sync-token/></d:prop></d:propfind>','1');
    const xml=await response.text();
    return responseBlocks(xml).flatMap((block)=>{
      if(!/<(?:[a-zA-Z0-9_-]+:)?calendar\b/i.test(block))return [];
      const href=xmlValues(block,'href')[0];if(!href)return [];
      return [{providerCalendarKey:new URL(href,config.serverUrl).toString(),displayName:xmlValues(block,'displayname')[0]??href,color:xmlValues(block,'calendar-color')[0],syncToken:xmlValues(block,'sync-token')[0]??null}];
    });
  }

  async fetchSince(config:ConnectedAccountConfig,secret:Record<string,string>,calendar:RemoteCalendar,cursor:string|null):Promise<CalendarSyncBatch> {
    if(cursor){
      const body=`<?xml version="1.0"?><d:sync-collection xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:sync-token>${escapeXml(cursor)}</d:sync-token><d:sync-level>1</d:sync-level><d:prop><d:getetag/><c:calendar-data/></d:prop></d:sync-collection>`;
      const response=await davRequest(config,secret,calendar.providerCalendarKey,'REPORT',body,'1');
      if(response.ok){
        const xml=await response.text();
        const events:RemoteCalendarEvent[]=[];const deletedResourceHrefs:string[]=[];
        for(const block of responseBlocks(xml)){
          const hrefValue=xmlValues(block,'href')[0];if(!hrefValue)continue;
          const href=new URL(hrefValue,calendar.providerCalendarKey).toString();
          if(/HTTP\/\d(?:\.\d)?\s+404\b/i.test(block)){deletedResourceHrefs.push(href);continue;}
          const data=xmlValues(block,'calendar-data')[0];if(!data)continue;
          const parsed=parseEvent(data,href,xmlValues(block,'getetag')[0]);if(parsed)events.push(parsed);
        }
        return {events,deletedResourceHrefs,nextCursor:xmlValues(xml,'sync-token').at(-1)??cursor};
      }
      if(response.status!==403&&response.status!==409)throw new Error(`CalDAV REPORT failed (${response.status} ${response.statusText})`);
    }
    const start=new Date(Date.now()-90*86400000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const end=new Date(Date.now()+365*86400000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const body=`<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}" end="${end}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const response=await requireDav(config,secret,calendar.providerCalendarKey,'REPORT',body,'1');
    const xml=await response.text();
    const events=responseBlocks(xml).flatMap((block)=>{
      const hrefValue=xmlValues(block,'href')[0];if(!hrefValue)return [];
      const href=new URL(hrefValue,calendar.providerCalendarKey).toString();
      const data=xmlValues(block,'calendar-data')[0];if(!data)return [];
      const parsed=parseEvent(data,href,xmlValues(block,'getetag')[0]);
      return parsed?[parsed]:[];
    });
    return {events,deletedResourceHrefs:[],nextCursor:await readSyncToken(config,secret,calendar.providerCalendarKey)};
  }
}
