import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  LegacyCustomerCrmMappingSchema,
  type LegacyCustomerCrmMapping,
  type LegacyOrganisationSourceType,
} from 'shared';
import type { ILegacyCustomerMappingRepository } from '../../application/interfaces/IRepositories';
import { getSqliteConnection } from './connection';

type CustomerRow = {
  id: string;
  first_name: string;
  last_name: string;
  company: string | null;
  email: string;
  phone: string | null;
  mobile: string | null;
};

type MappingRow = {
  customer_id: string;
  organisation_id: string;
  contact_id: string;
  created_at: string;
};

function nullableTrimmed(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normaliseLegacyCompany(value: string): { displayName: string; sourceKey: string } {
  const displayName = value.trim().normalize('NFKC').replace(/\s+/g, ' ');
  return {
    displayName,
    sourceKey: `company:${displayName.toLocaleLowerCase('en')}`,
  };
}

function mapRow(row: MappingRow): LegacyCustomerCrmMapping {
  return LegacyCustomerCrmMappingSchema.parse({
    customerId: row.customer_id,
    organisationId: row.organisation_id,
    contactId: row.contact_id,
    createdAt: row.created_at,
  });
}

export class LegacyCustomerMappingRepository implements ILegacyCustomerMappingRepository {
  constructor(private readonly connection: Database.Database = getSqliteConnection()) {}

  getCustomerMapping(customerId: string): LegacyCustomerCrmMapping | null {
    const row = this.connection.prepare(`
      select customer_id, organisation_id, contact_id, created_at
      from legacy_customer_crm_mappings
      where customer_id = ?
    `).get(customerId) as MappingRow | undefined;
    return row ? mapRow(row) : null;
  }

  ensureCustomerMapping(customerId: string): LegacyCustomerCrmMapping | null {
    const execute = () => {
      const existing = this.connection.prepare(`
        select customer_id, organisation_id, contact_id, created_at
        from legacy_customer_crm_mappings
        where customer_id = ?
      `).get(customerId) as MappingRow | undefined;

      if (existing) {
        const integrity = this.connection.prepare(`
          select
            exists(select 1 from organisations where id = @organisationId) as has_organisation,
            exists(select 1 from contacts where id = @contactId and organisation_id = @organisationId) as has_contact
        `).get({
          organisationId: existing.organisation_id,
          contactId: existing.contact_id,
        }) as { has_organisation: number; has_contact: number };

        if (!integrity.has_organisation || !integrity.has_contact) {
          throw new Error(`Legacy customer mapping ${customerId} references missing CRM records`);
        }
        return mapRow(existing);
      }

      const customer = this.connection.prepare(`
        select id, first_name, last_name, company, email, phone, mobile
        from customers
        where id = ?
      `).get(customerId) as CustomerRow | undefined;

      if (!customer) return null;

      const company = nullableTrimmed(customer.company);
      let sourceType: LegacyOrganisationSourceType;
      let sourceKey: string;
      let displayName: string;
      let organisationId: string;

      if (company) {
        const normalised = normaliseLegacyCompany(company);
        sourceType = 'company';
        sourceKey = normalised.sourceKey;
        displayName = normalised.displayName;
      } else {
        sourceType = 'individual_customer';
        sourceKey = `individual_customer:${customer.id}`;
        const fullName = `${customer.first_name ?? ''} ${customer.last_name ?? ''}`.trim();
        displayName = fullName || nullableTrimmed(customer.email) || `Legacy customer ${customer.id}`;
      }

      const organisationMapping = this.connection.prepare(`
        select organisation_id
        from legacy_organisation_mappings
        where source_key = ?
      `).get(sourceKey) as { organisation_id: string } | undefined;

      const now = new Date().toISOString();
      if (organisationMapping) {
        organisationId = organisationMapping.organisation_id;
      } else {
        organisationId = randomUUID();
        this.connection.prepare(`
          insert into organisations (
            id, name, legal_name, website, industry, employee_band,
            annual_revenue_band, country, status, source,
            created_at, updated_at, archived_at
          ) values (
            @id, @name, null, null, null, null,
            null, null, 'active_client', 'legacy_customer_import',
            @now, @now, null
          )
        `).run({ id: organisationId, name: displayName, now });

        this.connection.prepare(`
          insert into legacy_organisation_mappings (
            source_key, source_type, organisation_id, display_name, created_at
          ) values (?, ?, ?, ?, ?)
        `).run(sourceKey, sourceType, organisationId, displayName, now);
      }

      let shouldBePrimary = sourceType === 'individual_customer';
      if (sourceType === 'company') {
        const matchingCustomers = this.connection.prepare(`
          select id, company
          from customers
          where company is not null and trim(company) <> ''
        `).all() as Array<{ id: string; company: string }>;
        shouldBePrimary = matchingCustomers.filter((row) =>
          normaliseLegacyCompany(row.company).sourceKey === sourceKey
        ).length === 1;
      }

      if (shouldBePrimary) {
        const existingPrimary = this.connection.prepare(`
          select id
          from contacts
          where organisation_id = ?
            and is_primary = 1
            and status = 'active'
            and archived_at is null
          limit 1
        `).get(organisationId);
        if (existingPrimary) shouldBePrimary = false;
      }

      const contactId = randomUUID();
      this.connection.prepare(`
        insert into contacts (
          id, organisation_id, first_name, last_name, job_title,
          email, phone, is_primary, status,
          created_at, updated_at, archived_at
        ) values (
          @id, @organisationId, @firstName, @lastName, null,
          @email, @phone, @isPrimary, 'active',
          @now, @now, null
        )
      `).run({
        id: contactId,
        organisationId,
        firstName: nullableTrimmed(customer.first_name),
        lastName: nullableTrimmed(customer.last_name),
        email: nullableTrimmed(customer.email)?.toLocaleLowerCase('en') ?? null,
        phone: nullableTrimmed(customer.mobile) ?? nullableTrimmed(customer.phone),
        isPrimary: shouldBePrimary ? 1 : 0,
        now,
      });

      this.connection.prepare(`
        insert into legacy_customer_crm_mappings (
          customer_id, organisation_id, contact_id, created_at
        ) values (?, ?, ?, ?)
      `).run(customer.id, organisationId, contactId, now);

      if (sourceType === 'company' && !shouldBePrimary) {
        this.connection.prepare(`
          update contacts
          set is_primary = 0, updated_at = @now
          where id in (
            select contact_id
            from legacy_customer_crm_mappings
            where organisation_id = @organisationId
          )
        `).run({ organisationId, now });
      }

      return mapRow({
        customer_id: customer.id,
        organisation_id: organisationId,
        contact_id: contactId,
        created_at: now,
      });
    };

    return this.connection.inTransaction
      ? execute()
      : this.connection.transaction(execute)();
  }
}
