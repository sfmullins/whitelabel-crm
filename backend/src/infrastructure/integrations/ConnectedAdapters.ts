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
export interface RemoteEmailMessage {
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
}
export interface RemoteCalendarEvent {
  providerEventKey:string;
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
export interface CalendarSyncBatch { events:RemoteCalendarEvent[];nextCursor:string; }

export interface CalendarSyncAdapter {
  test(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<void>;
  discover(config:ConnectedAccountConfig,secret:Record<string,string>):Promise<RemoteCalendar[]>;
  fetchSince(config:ConnectedAccountConfig,secret:Record<string,string>,calendar:RemoteCalendar,cursor:string|null):Promise<CalendarSyncBatch>;
}
