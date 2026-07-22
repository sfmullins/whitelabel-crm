import { afterEach,describe,expect,it,vi } from 'vitest';
import { CalDavSyncAdapter } from '../infrastructure/integrations/CalDavSyncAdapter';
import { parseEmailSyncCursor,serializeEmailSyncCursor } from '../infrastructure/integrations/ConnectedAdapters';

describe('WI6-WI7 release hardening contracts',()=>{
  afterEach(()=>{vi.restoreAllMocks();});

  it('preserves UIDVALIDITY and failed UID retry state',()=>{
    const encoded=serializeEmailSyncCursor({mailbox:'INBOX',uidValidity:'9981',lastUid:55,failedUids:[42,42,51]});
    expect(parseEmailSyncCursor(encoded,'INBOX')).toEqual({mailbox:'INBOX',uidValidity:'9981',lastUid:55,failedUids:[42,51]});
    expect(parseEmailSyncCursor('42','INBOX')).toEqual({mailbox:'INBOX',uidValidity:null,lastUid:42,failedUids:[]});
  });

  it('converts TZID calendar wall time and preserves the server resource href',async()=>{
    const calendarXml=`<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/calendars/primary/random-resource-name.ics</d:href>
          <d:propstat><d:prop>
            <d:getetag>"etag-1"</d:getetag>
            <c:calendar-data>BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:stable-event-uid\r\nDTSTART;TZID=Europe/Dublin:20260722T090000\r\nDTEND;TZID=Europe/Dublin:20260722T100000\r\nSUMMARY:Timezone review\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n</c:calendar-data>
          </d:prop></d:propstat>
        </d:response>
      </d:multistatus>`;
    const tokenXml=`<?xml version="1.0"?><d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:sync-token>token-1</d:sync-token></d:prop></d:propstat></d:response></d:multistatus>`;
    vi.spyOn(globalThis,'fetch')
      .mockResolvedValueOnce(new Response(calendarXml,{status:207}))
      .mockResolvedValueOnce(new Response(tokenXml,{status:207}));
    const adapter=new CalDavSyncAdapter();
    const batch=await adapter.fetchSince(
      {id:'calendar-account',serverUrl:'https://dav.example/',username:'user@example.test',settings:{}},
      {password:'secret'},
      {providerCalendarKey:'https://dav.example/calendars/primary/',displayName:'Primary'},
      null,
    );
    expect(batch.events).toHaveLength(1);
    expect(batch.events[0].startsAt).toBe('2026-07-22T08:00:00.000Z');
    expect(batch.events[0].endsAt).toBe('2026-07-22T09:00:00.000Z');
    expect(batch.events[0].resourceHref).toBe('https://dav.example/calendars/primary/random-resource-name.ics');
    expect(batch.nextCursor).toBe('token-1');
  });
});
