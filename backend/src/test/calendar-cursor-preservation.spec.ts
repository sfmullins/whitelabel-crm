import path from 'node:path';
import { afterEach,beforeEach,describe,expect,it } from 'vitest';
import { cleanupTempDatabase,setupTempDatabase } from './crm/helpers';
import { runSeed } from '../infrastructure/database/seed';
import { getRuntimePaths } from '../config/runtimePaths';
import { ConnectedCommunicationsRepository } from '../infrastructure/database/ConnectedCommunicationsRepository';
import { ConnectedCommunicationsService } from '../application/services/ConnectedCommunicationsService';
import { CredentialVault } from '../infrastructure/security/CredentialVault';
import type { CalendarSyncAdapter,EmailSyncAdapter } from '../infrastructure/integrations/ConnectedAdapters';

const noEmail:EmailSyncAdapter={async test(){},async fetchSince(){return {messages:[],nextCursor:'0'};}};

describe('per-calendar cursor preservation',()=>{
  beforeEach(async()=>{setupTempDatabase();await runSeed();});
  afterEach(cleanupTempDatabase);

  it('uses the stored pre-discovery token rather than the server current token',async()=>{
    const cursors:Array<string|null>=[];let fetches=0;
    const calendar:CalendarSyncAdapter={
      async test(){},
      async discover(){return [{providerCalendarKey:'https://dav.example/calendars/primary/',displayName:'Primary',syncToken:'server-current-token'}];},
      async fetchSince(_config,_secret,_calendar,cursor){cursors.push(cursor);fetches+=1;return {events:[],deletedResourceHrefs:[],nextCursor:`stored-token-${fetches}`};},
    };
    const repository=new ConnectedCommunicationsRepository();const vault=new CredentialVault(path.join(getRuntimePaths().dataDirectory,'calendar-cursor-vault'));
    const service=new ConnectedCommunicationsService(repository,vault,noEmail,calendar);
    const account=service.createAccount({kind:'calendar',name:'Cursor calendar',serverUrl:'https://dav.example/',username:'user@example.test',password:'secret',settings:{}});
    await service.syncAccount(String(account.id));
    await service.syncAccount(String(account.id));
    expect(cursors).toEqual([null,'stored-token-1']);
    expect(repository.listCalendars(String(account.id))[0].syncCursor).toBe('stored-token-2');
  });
});
