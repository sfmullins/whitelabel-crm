export interface ConnectedAccountConfig {
  id:string;
  serverUrl:string;
  username:string;
  settings:Record<string,unknown>;
}

export interface EmailAddress { name?:string;address:string; }
export interface RemoteAttachment {
  filename:string;
  mimeType:string;
  contentBase64:string;
  contentId?:string;
  inline?:boolean;
}

export interface EmailSyncCursor {
  mailbox:string;
  uidValidity:string|null;
  lastUid:number;
  failedUids:number[];
}

export function parseEmailSyncCursor(value:string|null,mailbox:string):EmailSyncCursor {
  if(!value)return {mailbox,uidValidity:null,lastUid:0,failedUids:[]};
  if(/^\d+$/.test(value))return {mailbox,uidValidity:null,lastUid:Number(value),failedUids:[]};
  try{
    const parsed=JSON.parse(value) as Partial<EmailSyncCursor>;
    return {
      mailbox:typeof parsed.mailbox==='string'?parsed.mailbox:mailbox,
      uidValidity:typeof parsed.uidValidity==='string'?parsed.uidValidity:null,
      lastUid:Number.isInteger(parsed.lastUid)&&Number(parsed.lastUid)>=0?Number(parsed.lastUid):0,
      failedUids:Array.isArray(parsed.failedUids)?[...new Set(parsed.failedUids.map(Number).filter((uid)=>Number.isInteger(uid)&&uid>0))]:[],
    };
  }catch{return {mailbox,uidValidity:null,lastUid:0,failedUids:[]};}
}
export function serializeEmailSyncCursor(value:EmailSyncCursor):string {
  return JSON.stringify({...value,failedUids:[...new Set(value.failedUids)].sort((a,b)=>a-b)});
}

export interface RemoteEmailMessage {
  uid:number;
  providerMessageKey:string;
  providerThreadKey:string;
  rfcMessageId?:string;
  direction:'inbound'|'outbound';
  from:EmailAddress;
  to:EmailAddress[];
  cc?:EmailAddress[];
  bcc?:EmailAddress[];
  subject?:string;
  bodyText:string;
  bodyHtml?:string;
  sentAt:string;
  receivedAt:string;
  isRead:boolean;
  headers?:Record<string,string>;
  attachments?:RemoteAttachment[];
}
export interface EmailSyncBatch { messages:RemoteEmailMessage[];nextCursor:string; }

export interface EmailSyncAdapter {
  test(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<void>;
  fetchSince(config:ConnectedAccountConfig,secret:Record<string,string>,cursor:string|null):Promise<EmailSyncBatch>;
}

export interface RemoteCalendar {
  providerCalendarKey:string;
  displayName:string;
  color?:string;
  syncToken?:string|null;
}
export interface RemoteCalendarEvent {
  providerEventKey:string;
  resourceHref:string;
  etag?:string;
  title:string;
  description?:string;
  location?:string;
  startsAt:string;
  endsAt:string;
  timezone:string;
  recurrence?:Record<string,unknown>;
  attendees:Array<EmailAddress & { responseStatus?:string }>;
  cancelled:boolean;
}
export interface CalendarSyncBatch {
  events:RemoteCalendarEvent[];
  nextCursor:string|null;
  deletedResourceHrefs:string[];
}

export interface CalendarSyncAdapter {
  test(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<void>;
  discover(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<RemoteCalendar[]>;
  fetchSince(config:ConnectedAccountConfig,secret:Record<string,string>,calendar:RemoteCalendar,cursor:string|null):Promise<CalendarSyncBatch>;
}
