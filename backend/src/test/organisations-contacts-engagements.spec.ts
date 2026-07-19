import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDatabase, openDatabase, sqlite } from '../infrastructure/database/connection';
import { runMigrations } from '../infrastructure/database/migrate';
import { OrganisationRepository } from '../infrastructure/database/repositories/OrganisationRepository';
import { ContactRepository } from '../infrastructure/database/repositories/ContactRepository';
import { EngagementRepository } from '../infrastructure/database/repositories/EngagementRepository';
import { ContactService, EngagementService, OrganisationService } from '../application/services/CrmDomainServices';
import { OrganisationCreateSchema, ContactCreateSchema, EngagementCreateSchema, OrganisationUpdateSchema, ContactUpdateSchema, EngagementUpdateSchema } from 'shared';

let tempDir:string; const migrationsFolder=path.resolve(__dirname,'../../drizzle');
beforeEach(()=>{tempDir=fs.mkdtempSync(path.join(os.tmpdir(),'whitelabel-crm-test-')); const db = openDatabase(path.join(tempDir,'test.sqlite')); runMigrations(db,migrationsFolder);});
afterEach(()=>{closeDatabase(); fs.rmSync(tempDir,{recursive:true,force:true});});
const services=()=>{const o=new OrganisationRepository(), c=new ContactRepository(), e=new EngagementRepository(); return {org:new OrganisationService(o), contact:new ContactService(o,c), engagement:new EngagementService(o,c,e)} };

describe('shared crm schemas',()=>{
 it('normalizes organisation fields and rejects invalid input',()=>{const parsed=OrganisationCreateSchema.parse({name:' Acme ',website:'',country:' us ',legalName:' '}); expect(parsed).toMatchObject({name:'Acme',website:null,country:'US',legalName:null,status:'prospect'}); expect(()=>OrganisationCreateSchema.parse({name:' '})).toThrow(); expect(()=>OrganisationCreateSchema.parse({name:'A',website:'notaurl'})).toThrow(); expect(()=>OrganisationUpdateSchema.parse({id:'x'})).toThrow(); expect(()=>OrganisationUpdateSchema.parse({})).toThrow();});
 it('validates contact identity and engagement dates',()=>{expect(ContactCreateSchema.parse({organisationId:'00000000-0000-4000-8000-000000000001',email:' TEST@EXAMPLE.COM '})).toMatchObject({email:'test@example.com',status:'active',isPrimary:false}); expect(()=>ContactCreateSchema.parse({organisationId:'00000000-0000-4000-8000-000000000001',firstName:' '})).toThrow(); expect(()=>ContactUpdateSchema.parse({organisationId:'00000000-0000-4000-8000-000000000001'})).toThrow(); expect(()=>EngagementCreateSchema.parse({organisationId:'00000000-0000-4000-8000-000000000001',name:'E',type:'diagnostic',startDate:'2026-02-31'})).toThrow(); expect(()=>EngagementCreateSchema.parse({organisationId:'00000000-0000-4000-8000-000000000001',name:'E',type:'diagnostic',startDate:'2026-03-02',endDate:'2026-03-01'})).toThrow(); expect(()=>EngagementUpdateSchema.parse({organisationId:'x'})).toThrow();});
});

describe('crm repositories/services',()=>{
 it('creates, lists, searches, archives and protects organisations',async()=>{const {org}=services(); const a=await org.create(OrganisationCreateSchema.parse({name:'Beta % Co',status:'active_client'})); await org.create(OrganisationCreateSchema.parse({name:'alpha'})); expect(a.id).toMatch(/[0-9a-f-]{36}/); expect(a.createdAt).toBeTruthy(); expect((await org.list({limit:50,offset:0})).map(o=>o.name)).toEqual(['alpha','Beta % Co']); expect(await org.list({search:'%',limit:50,offset:0})).toHaveLength(1); await org.archive(a.id); expect(await org.list({limit:50,offset:0})).toHaveLength(1); expect(await org.list({includeArchived:true,limit:50,offset:0})).toHaveLength(2); await expect(org.update(a.id,{name:'new'})).rejects.toThrow(/Archived/);});
 it('enforces contact creation, primary contact and archive rules',async()=>{const {org,contact}=services(); const o=await org.create({name:'Org',status:'prospect'} as any); const c1=await contact.create({organisationId:o.id,firstName:'A',isPrimary:true,status:'active'} as any); const c2=await contact.create({organisationId:o.id,lastName:'B',isPrimary:true,status:'active'} as any); expect((await contact.get(c1.id)).isPrimary).toBe(false); expect((await contact.get(c2.id)).isPrimary).toBe(true); await contact.update(c2.id,{status:'inactive'}); expect((await contact.get(c2.id)).isPrimary).toBe(false); await expect(contact.update(c1.id,{firstName:null,lastName:null,email:null})).rejects.toThrow(/At least one/); await contact.archive(c1.id); expect(await contact.list({organisationId:o.id,includeArchived:true,limit:50,offset:0})).toHaveLength(2); await org.archive(o.id); await expect(contact.create({organisationId:o.id,email:'x@y.com'} as any)).rejects.toThrow(/Archived/);});
 it('enforces engagement contact eligibility, date merging and archival',async()=>{const {org,contact,engagement}=services(); const o1=await org.create({name:'Org1',status:'prospect'} as any); const o2=await org.create({name:'Org2',status:'prospect'} as any); const c=await contact.create({organisationId:o1.id,email:'a@b.com'} as any); const other=await contact.create({organisationId:o2.id,email:'c@d.com'} as any); const e=await engagement.create({organisationId:o1.id,name:'Discovery',type:'diagnostic',startDate:'2026-01-01',primaryContactId:c.id} as any); await expect(engagement.update(e.id,{primaryContactId:other.id})).rejects.toThrow(/belong/); await expect(engagement.update(e.id,{startDate:'2026-02-01',endDate:'2026-01-01'})).rejects.toThrow(/End date/); expect((await engagement.update(e.id,{primaryContactId:null,endDate:null})).primaryContactId).toBeNull(); await engagement.archive(e.id); await expect(engagement.update(e.id,{name:'No'})).rejects.toThrow(/Archived/);});
 it('has expected migration tables, indexes, foreign key enforcement and no cascade delete',()=>{for(const t of ['organisations','contacts','engagements']) expect(sqlite.prepare("select name from sqlite_master where type='table' and name=?").get(t)).toBeTruthy(); expect(sqlite.pragma('foreign_keys')[0].foreign_keys).toBe(1); expect(sqlite.pragma('foreign_key_check')).toEqual([]); expect(sqlite.pragma('integrity_check')[0].integrity_check).toBe('ok'); const fk=sqlite.pragma('foreign_key_list(contacts)') as any[]; expect(fk[0].on_delete.toLowerCase()).toBe('restrict'); expect(sqlite.prepare("select name from sqlite_master where type='index' and name='contact_email_idx'").get()).toBeTruthy(); expect(sqlite.prepare("select sql from sqlite_master where type='index' and name='contact_email_idx'").get().sql).not.toMatch(/unique/i);});
});

async function requestJson(
  baseUrl: string,
  pathName: string,
  options: RequestInit = {},
) {
  const response = await fetch(`${baseUrl}${pathName}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(options.headers ?? {}),
    },
  });
  const body = await response.json();
  return { response, body };
}

describe('crm API routes', () => {
  it('exercises organisation, contact and engagement route validation and state changes', async () => {
    const { startServer } = await import('../server');
    const server = await startServer({ host: '127.0.0.1', port: 0 });

    try {
      const missingOrganisation = await requestJson(
        server.url,
        '/api/organisations/00000000-0000-4000-8000-000000000001',
      );
      expect(missingOrganisation.response.status).toBe(404);
      expect(missingOrganisation.body).toMatchObject({ error: 'NOT_FOUND' });

      const malformedId = await requestJson(server.url, '/api/organisations/not-a-uuid');
      expect(malformedId.response.status).toBe(400);
      expect(malformedId.body).toMatchObject({ error: 'VALIDATION_ERROR' });

      const invalidBody = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: '', unexpected: true }),
      });
      expect(invalidBody.response.status).toBe(400);
      expect(invalidBody.body).toMatchObject({ error: 'VALIDATION_ERROR' });

      const createdOrganisation = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: ' API Org ', country: 'gb' }),
      });
      expect(createdOrganisation.response.status).toBe(201);
      expect(createdOrganisation.response.headers.get('content-type')).toContain('application/json');
      expect(createdOrganisation.body).toMatchObject({ name: 'API Org', country: 'GB' });

      const organisationId = createdOrganisation.body.id as string;
      const listedOrganisations = await requestJson(server.url, '/api/organisations?search=API&limit=10&offset=0');
      expect(listedOrganisations.response.status).toBe(200);
      expect(listedOrganisations.body).toHaveLength(1);

      const invalidQuery = await requestJson(server.url, '/api/organisations?includeArchived=yes');
      expect(invalidQuery.response.status).toBe(400);

      const patchedOrganisation = await requestJson(server.url, `/api/organisations/${organisationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active_client' }),
      });
      expect(patchedOrganisation.response.status).toBe(200);
      expect(patchedOrganisation.body.status).toBe('active_client');

      const mismatchedContactBody = await requestJson(
        server.url,
        `/api/organisations/${organisationId}/contacts`,
        {
          method: 'POST',
          body: JSON.stringify({ organisationId, email: 'blocked@example.com' }),
        },
      );
      expect(mismatchedContactBody.response.status).toBe(400);

      const contact = await requestJson(server.url, `/api/organisations/${organisationId}/contacts`, {
        method: 'POST',
        body: JSON.stringify({ email: 'PERSON@EXAMPLE.COM', isPrimary: true }),
      });
      expect(contact.response.status).toBe(201);
      expect(contact.body).toMatchObject({ email: 'person@example.com', isPrimary: true });

      const inactivatedContact = await requestJson(server.url, `/api/contacts/${contact.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'inactive' }),
      });
      expect(inactivatedContact.response.status).toBe(200);
      expect(inactivatedContact.body.isPrimary).toBe(false);

      const inactivePrimary = await requestJson(server.url, `/api/contacts/${contact.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isPrimary: true }),
      });
      expect(inactivePrimary.response.status).toBe(409);

      const reactivatedContact = await requestJson(server.url, `/api/contacts/${contact.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'active', isPrimary: true }),
      });
      expect(reactivatedContact.response.status).toBe(200);

      const listedContacts = await requestJson(server.url, `/api/organisations/${organisationId}/contacts`);
      expect(listedContacts.response.status).toBe(200);
      expect(listedContacts.body).toHaveLength(1);

      const engagement = await requestJson(server.url, `/api/organisations/${organisationId}/engagements`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Discovery',
          type: 'diagnostic',
          startDate: '2026-03-01',
          primaryContactId: contact.body.id,
        }),
      });
      expect(engagement.response.status).toBe(201);
      expect(engagement.body.primaryContactId).toBe(contact.body.id);

      const otherOrganisation = await requestJson(server.url, '/api/organisations', {
        method: 'POST',
        body: JSON.stringify({ name: 'Other Org' }),
      });
      const otherContact = await requestJson(
        server.url,
        `/api/organisations/${otherOrganisation.body.id}/contacts`,
        {
          method: 'POST',
          body: JSON.stringify({ email: 'other@example.com' }),
        },
      );

      const crossOrganisationPrimary = await requestJson(server.url, `/api/engagements/${engagement.body.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ primaryContactId: otherContact.body.id }),
      });
      expect(crossOrganisationPrimary.response.status).toBe(409);
      expect(JSON.stringify(crossOrganisationPrimary.body)).not.toMatch(/sqlite|stack|constraint/i);

      const archiveEngagement = await requestJson(server.url, `/api/engagements/${engagement.body.id}/archive`, {
        method: 'POST',
      });
      expect(archiveEngagement.response.status).toBe(200);
      expect(archiveEngagement.body.archivedAt).toBeTruthy();

      const listedEngagements = await requestJson(server.url, `/api/organisations/${organisationId}/engagements`);
      expect(listedEngagements.body).toHaveLength(0);
      const listedArchivedEngagements = await requestJson(
        server.url,
        `/api/organisations/${organisationId}/engagements?includeArchived=true`,
      );
      expect(listedArchivedEngagements.body).toHaveLength(1);

      const archiveContact = await requestJson(server.url, `/api/contacts/${contact.body.id}/archive`, {
        method: 'POST',
      });
      expect(archiveContact.response.status).toBe(200);
      expect(archiveContact.body.isPrimary).toBe(false);

      const archiveOrganisation = await requestJson(server.url, `/api/organisations/${organisationId}/archive`, {
        method: 'POST',
      });
      expect(archiveOrganisation.response.status).toBe(200);
      expect(archiveOrganisation.body.archivedAt).toBeTruthy();

      const conflict = await requestJson(server.url, `/api/organisations/${organisationId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Archived edit' }),
      });
      expect(conflict.response.status).toBe(409);
    } finally {
      await server.close();
    }
  });
});
