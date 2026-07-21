import type { ConnectedAccountConfig, EmailAddress } from './ConnectedAdapters';

export interface OutboundAttachment {
  filename: string;
  mimeType: string;
  content: Buffer;
}

export interface OutboundEmail {
  messageId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  bodyText: string;
  bodyHtml?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  attachments?: OutboundAttachment[];
}

export interface EmailSendResult {
  providerMessageKey: string;
  accepted: string[];
  rejected: string[];
}

export interface EmailSendAdapter {
  send(config: ConnectedAccountConfig, secret: Record<string,string>, message: OutboundEmail): Promise<EmailSendResult>;
}

export interface CalendarWriteInput {
  providerEventKey: string;
  etag?: string | null;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  attendees: EmailAddress[];
  recurrence?: Record<string,unknown> | null;
  cancelled?: boolean;
}

export interface CalendarWriteResult {
  providerEventKey: string;
  etag: string | null;
}

export interface CalendarWriteAdapter {
  create(config: ConnectedAccountConfig, secret: Record<string,string>, calendarUrl: string, event: CalendarWriteInput): Promise<CalendarWriteResult>;
  update(config: ConnectedAccountConfig, secret: Record<string,string>, calendarUrl: string, event: CalendarWriteInput): Promise<CalendarWriteResult>;
  cancel(config: ConnectedAccountConfig, secret: Record<string,string>, calendarUrl: string, event: CalendarWriteInput): Promise<CalendarWriteResult>;
}

export interface FutureChannelAdapter {
  readonly channel: 'sms'|'whatsapp'|'teams'|'slack'|'voip';
  readonly liveConnectivity: false;
  normalizeExternalRecord(input: unknown): never;
}

export const FUTURE_CHANNELS = ['sms','whatsapp','teams','slack','voip'] as const;
