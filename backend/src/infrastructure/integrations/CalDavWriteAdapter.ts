import type { ConnectedAccountConfig, EmailAddress } from './ConnectedAdapters';
import type { CalendarWriteAdapter, CalendarWriteInput, CalendarWriteResult } from './OutboundAdapters';

function authorization(username:string,password:string):string {
  return `Basic ${Buffer.from(`${username}:${password}`,'utf8').toString('base64')}`;
}
function escapeIcs(value:string):string {
  return value.replace(/\\/g,'\\\\').replace(/\r?\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
}
function utc(value:string):string {
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))throw new Error(`Invalid calendar timestamp: ${value}`);
  return date.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
}
function attendee(value:EmailAddress):string {
  const cn=value.name?`;CN="${escapeIcs(value.name).replace(/"/g,"'")}"`:'';
  return `ATTENDEE${cn}:mailto:${value.address.toLowerCase()}`;
}
export function buildCalendarData(event:CalendarWriteInput):string {
  const lines=[
    'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//WhiteLabelCRM//WI7//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT',
    `UID:${escapeIcs(event.providerEventKey)}`,
    `DTSTAMP:${utc(new Date().toISOString())}`,
    `DTSTART:${utc(event.startsAt)}`,
    `DTEND:${utc(event.endsAt)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    ...(event.description?[`DESCRIPTION:${escapeIcs(event.description)}`]:[]),
    ...(event.location?[`LOCATION:${escapeIcs(event.location)}`]:[]),
    ...(typeof event.recurrence?.rrule==='string'?[`RRULE:${event.recurrence.rrule}`]:[]),
    ...event.attendees.map(attendee),
    `STATUS:${event.cancelled?'CANCELLED':'CONFIRMED'}`,
    'END:VEVENT','END:VCALENDAR','',
  ];
  return lines.join('\r\n');
}

async function write(
  config:ConnectedAccountConfig,
  secret:Record<string,string>,
  calendarUrl:string,
  event:CalendarWriteInput,
  mode:'create'|'update'|'cancel',
):Promise<CalendarWriteResult>{
  const generated=new URL(`${encodeURIComponent(event.providerEventKey)}.ics`,calendarUrl.endsWith('/')?calendarUrl:`${calendarUrl}/`).toString();
  const href=mode==='create'?generated:event.resourceHref;
  if(!href)throw new Error('Calendar resource href is unavailable; synchronize the calendar before modifying this event');
  const headers:Record<string,string>={
    authorization:authorization(config.username,secret.password??''),
    'content-type':'text/calendar; charset=utf-8',
    'user-agent':'WhiteLabelCRM/1.0',
  };
  if(mode==='create')headers['if-none-match']='*';
  else if(event.etag)headers['if-match']=event.etag;
  const response=await fetch(href,{method:'PUT',headers,body:buildCalendarData({...event,cancelled:mode==='cancel'||event.cancelled})});
  if(response.status===409||response.status===412)throw new Error('CALDAV_CONFLICT');
  if(!response.ok)throw new Error(`CalDAV PUT failed (${response.status} ${response.statusText})`);
  return {providerEventKey:event.providerEventKey,resourceHref:href,etag:response.headers.get('etag')};
}

export class CalDavWriteAdapter implements CalendarWriteAdapter {
  create(config:ConnectedAccountConfig,secret:Record<string,string>,calendarUrl:string,event:CalendarWriteInput){return write(config,secret,calendarUrl,event,'create');}
  update(config:ConnectedAccountConfig,secret:Record<string,string>,calendarUrl:string,event:CalendarWriteInput){return write(config,secret,calendarUrl,event,'update');}
  cancel(config:ConnectedAccountConfig,secret:Record<string,string>,calendarUrl:string,event:CalendarWriteInput){return write(config,secret,calendarUrl,event,'cancel');}
}
