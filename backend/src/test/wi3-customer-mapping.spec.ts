import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LegacyCustomerMappingRepository } from '../infrastructure/database/LegacyCustomerMappingRepository';
import { OrganisationRepository } from '../infrastructure/database/repositories/OrganisationRepository';
import { cleanupTempDatabase, setupTempDatabase, sqlite } from './crm/helpers';

const now = '2026-07-20T10:00:00.000Z';

function insertCustomer(input: {
  id: string;
  company: string | null;
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  mobile?: string | null;
}) {
  sqlite.prepare(`
    insert into customers (
      id, first_name, last_name, company, email, phone, mobile,
      address, notes, tags, created_at, updated_at
    ) values (
      @id, @firstName, @lastName, @company, @email, @phone, @mobile,
      'Preserved address', 'Preserved notes', '["preserved"]', @now, @now
    )
  `).run({
    id: input.id,
    firstName: input.firstName ?? 'Legacy',
    lastName: input.lastName ?? 'Customer',
    company: input.company,
    email: input.email,
    phone: input.phone ?? null,
    mobile: input.mobile ?? null,
    now,
  });
}

describe('WI3 legacy customer mapping', () => {
  beforeEach(setupTempDatabase);
  afterEach(cleanupTempDatabase);

  it('does not fuzzy-merge with manual organisations and preserves source data', async () => {
    const manual = await new OrganisationRepository().create({
      name: 'Acme Ltd',
      status: 'active_client',
    });
    const customerId = '00000000-0000-4000-8000-000000000501';
    insertCustomer({
      id: customerId,
      company: '  Acme   Ltd  ',
      email: '  CUSTOMER@EXAMPLE.COM  ',
      phone: '01 111 1111',
      mobile: '087 222 2222',
    });
    const before = sqlite.prepare('select * from customers where id = ?').get(customerId);

    const repository = new LegacyCustomerMappingRepository(sqlite);
    const mapping = repository.ensureCustomerMapping(customerId);
    expect(mapping).not.toBeNull();
    expect(mapping?.organisationId).not.toBe(manual.id);

    expect(sqlite.prepare('select name, status, source from organisations where id = ?')
      .get(mapping?.organisationId)).toEqual({
      name: 'Acme   Ltd',
      status: 'active_client',
      source: 'legacy_customer_import',
    });
    expect(sqlite.prepare('select display_name from legacy_organisation_mappings where organisation_id = ?')
      .get(mapping?.organisationId)).toEqual({ display_name: 'Acme   Ltd' });
    expect(sqlite.prepare('select email, phone, is_primary from contacts where id = ?')
      .get(mapping?.contactId)).toEqual({
      email: 'customer@example.com',
      phone: '087 222 2222',
      is_primary: 1,
    });
    expect(sqlite.prepare('select * from customers where id = ?').get(customerId)).toEqual(before);

    expect(repository.ensureCustomerMapping(customerId)).toEqual(mapping);
    expect(sqlite.prepare('select count(*) as count from organisations').get()).toEqual({ count: 2 });
    expect(sqlite.prepare('select count(*) as count from contacts').get()).toEqual({ count: 1 });
  });

  it('shares exact normalised company mappings and removes arbitrary imported primaries', () => {
    const firstId = '00000000-0000-4000-8000-000000000511';
    const secondId = '00000000-0000-4000-8000-000000000512';
    insertCustomer({ id: firstId, company: 'Ａｃｍｅ Ltd', email: 'first@example.com' });

    const repository = new LegacyCustomerMappingRepository(sqlite);
    const first = repository.ensureCustomerMapping(firstId);
    expect(sqlite.prepare('select is_primary from contacts where id = ?').get(first?.contactId))
      .toEqual({ is_primary: 1 });

    insertCustomer({ id: secondId, company: 'acme   ltd', email: 'second@example.com' });
    const second = repository.ensureCustomerMapping(secondId);
    expect(second?.organisationId).toBe(first?.organisationId);
    expect(sqlite.prepare(`
      select is_primary
      from contacts
      where organisation_id = ?
      order by id
    `).all(first?.organisationId)).toEqual([
      { is_primary: 0 },
      { is_primary: 0 },
    ]);
  });

  it('creates a dedicated primary-contact organisation for an individual customer', () => {
    const customerId = '00000000-0000-4000-8000-000000000521';
    insertCustomer({
      id: customerId,
      company: null,
      email: 'individual@example.com',
      firstName: 'Individual',
      lastName: 'Person',
    });

    const mapping = new LegacyCustomerMappingRepository(sqlite).ensureCustomerMapping(customerId);
    expect(sqlite.prepare(`
      select lom.source_key, lom.source_type, o.name, c.is_primary
      from legacy_organisation_mappings lom
      join organisations o on o.id = lom.organisation_id
      join contacts c on c.id = ?
      where lom.organisation_id = ?
    `).get(mapping?.contactId, mapping?.organisationId)).toEqual({
      source_key: `individual_customer:${customerId}`,
      source_type: 'individual_customer',
      name: 'Individual Person',
      is_primary: 1,
    });
  });

  it('rolls back organisation and mapping creation when contact creation fails', () => {
    const customerId = '00000000-0000-4000-8000-000000000531';
    insertCustomer({
      id: customerId,
      company: 'Rollback Ltd',
      email: 'rollback@example.com',
    });
    const before = sqlite.prepare('select * from customers where id = ?').get(customerId);
    sqlite.exec(`
      create trigger fail_rollback_contact
      before insert on contacts
      when NEW.email = 'rollback@example.com'
      begin
        select raise(abort, 'injected contact failure');
      end;
    `);

    const repository = new LegacyCustomerMappingRepository(sqlite);
    expect(() => repository.ensureCustomerMapping(customerId)).toThrow(/injected contact failure/);
    expect(sqlite.prepare('select count(*) as count from organisations').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from contacts').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from legacy_organisation_mappings').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select count(*) as count from legacy_customer_crm_mappings').get()).toEqual({ count: 0 });
    expect(sqlite.prepare('select * from customers where id = ?').get(customerId)).toEqual(before);
  });
});
