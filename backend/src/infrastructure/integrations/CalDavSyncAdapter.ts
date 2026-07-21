import type { CalendarSyncAdapter,CalendarSyncBatch,ConnectedAccountConfig,EmailAddress,RemoteCalendar,RemoteCalendarEvent } from './ConnectedAdapters';

function authorization(username:string,password:string):string { return `Basic ${Buffer.from(`${username}:${password}`,'utf8').toString('base64')}`; }
function decodeXml(value:string):string { return value.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&'); }
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
    const [key,...parameterParts]=line.slice(0,index).split(';');void key;
    const params=Object.fromEntries(parameterParts.map((part)=>{const split=part.indexOf('=');return split<0?[part.toUpperCase(),'']:[part.slice(0,split).toUpperCase(),part.slice(split+1)];}));
    return {params,value:unescapeIcs(line.slice(index+1))};
  });
}
function parseIcsDate(value:string):string {
  if(/^\d{8}$/.test(value))return `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T00:00:00.000Z`;
  const match=value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if(!match)throw new Error(`Unsupported iCalendar date: ${value}`);
  const [,year,month,day,hour,minute,second,zulu]=match;
  const suffix=zulu?'Z':'';
  const parsed=Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}${suffix}`);
  if(!Number.isFinite(parsed))throw new Error(`Invalid iCalendar date: ${value}`);
  return new Date(parsed).toISOString();
}
function parseAttendee(value:{params:Record<string,string>;value:string}):EmailAddress & {responseStatus?:string} {
  return {name:value.params.CN?.replace(/^"|"$/g,''),address:value.value.replace(/^mailto:/i,'').toLowerCase(),responseStatus:value.params.PARTSTAT?.toLowerCase()};
}
function parseEvent(ics:string,href:string,etag?:string):RemoteCalendarEvent|null {
  const unfolded=unfoldIcs(ics);
  const event=unfolded.match(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/i)?.[1];
  if(!event)return null;
  const lines=event.split(/\r?\n/);
  const first=(name:string)=>icsProperty(lines,name)[0]?.value;
  const uid=first('UID')??href;
  const start=icsProperty(lines,'DTSTART')[0];
  const end=icsProperty(lines,'DTEND')[0];
  if(!start||!end)return null;
  return {
    providerEventKey:uid,
    etag,
    title:first('SUMMARY')??'(Untitled event)',
    description:first('DESCRIPTION'),
    location:first('LOCATION'),
    startsAt:parseIcsDate(start.value),
    endsAt:parseIcsDate(end.value),
    timezone:start.params.TZID??'UTC',
    recurrence:first('RRULE')?{rrule:first('RRULE')}:undefined,
    attendees:icsProperty(lines,'ATTENDEE').map(parseAttendee),
    cancelled:(first('STATUS')??'').toUpperCase()==='CANCELLED',
  };
}

async function davFetch(config:ConnectedAccountConfig,secret:Record<string,string>,url:string,method:string,body?:string,depth='1'):Promise<Response> {
  const response=await fetch(url,{method,headers:{authorization:authorization(config.username,secret.password??''),depth,'content-type':'application/xml; charset=utf-8','user-agent':'WhiteLabelCRM/1.0'},body});
  if(!response.ok)throw new Error(`CalDAV ${method} failed (${response.status} ${response.statusText})`);
  return response;
}

export class CalDavSyncAdapter implements CalendarSyncAdapter {
  async test(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<void> {
    await davFetch(config,secret,config.serverUrl,'PROPFIND','<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>','0');
  }

  async discover(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<RemoteCalendar[]> {
    const response=await davFetch(config,secret,config.serverUrl,'PROPFIND','<?xml version="1.0"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:a="http://apple.com/ns/ical/"><d:prop><d:displayname/><d:resourcetype/><a:calendar-color/></d:prop></d:propfind>','1');
    const xml=await response.text();
    return responseBlocks(xml).flatMap((block)=>{
      if(!/<(?:[a-zA-Z0-9_-]+:)?calendar\b/i.test(block))return [];
      const href=xmlValues(block,'href')[0];if(!href)return [];
      return [{providerCalendarKey:new URL(href,config.serverUrl).toString(),displayName:xmlValues(block,'displayname')[0]??href,color:xmlValues(block,'calendar-color')[0]}];
    });
  }

  async fetchSince(config:ConnectedAccountConfig,secret:Record<string,string>,calendar:RemoteCalendar,cursor:string|null):Promise<CalendarSyncBatch> {
    const since=cursor??new Date(Date.now()-90*86400000).toISOString();
    const start=since.replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const end=new Date(Date.now()+365*86400000).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const body=`<?xml version="1.0"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:getetag/><c:calendar-data/></d:prop><c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range start="${start}" end="${end}"/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
    const response=await davFetch(config,secret,calendar.providerCalendarKey,'REPORT',body,'1');
    const xml=await response.text();
    const events=responseBlocks(xml).flatMap((block)=>{
      const href=xmlValues(block,'href')[0]??calendar.providerCalendarKey;
      const data=xmlValues(block,'calendar-data')[0];
      if(!data)return [];
      const parsed=parseEvent(data,href,xmlValues(block,'getetag')[0]);
      return parsed?[parsed]:[];
    });
    const nextCursor=events.reduce((latest,event)=>event.startsAt>latest?event.startsAt:latest,since);
    return {events,nextCursor};
  }
}
