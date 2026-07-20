import { describe, expect, it } from 'vitest';
import {
  ContactCreateSchema,
  ContactUpdateSchema,
  EngagementCreateSchema,
  EngagementUpdateSchema,
  OrganisationCreateSchema,
  OrganisationUpdateSchema,
} from 'shared';

describe('CRM shared contracts', () => {
  it('normalizes organisation optional fields and rejects invalid updates', () => {
    const parsed = OrganisationCreateSchema.parse({
      name: ' Acme ',
      website: '',
      country: ' us ',
      legalName: ' ',
    });

    expect(parsed).toMatchObject({
      name: 'Acme',
      website: null,
      country: 'US',
      legalName: null,
      status: 'prospect',
    });
    expect(() => OrganisationCreateSchema.parse({ name: ' ' })).toThrow();
    expect(() => OrganisationCreateSchema.parse({ name: 'A', website: 'notaurl' })).toThrow();
    expect(() => OrganisationUpdateSchema.parse({ id: 'x' })).toThrow();
    expect(() => OrganisationUpdateSchema.parse({})).toThrow();
  });

  it('validates contact identity, immutable fields and email normalization', () => {
    const parsed = ContactCreateSchema.parse({
      organisationId: '00000000-0000-4000-8000-000000000001',
      email: ' TEST@EXAMPLE.COM ',
    });

    expect(parsed).toMatchObject({
      email: 'test@example.com',
      status: 'active',
      isPrimary: false,
    });
    expect(() => ContactCreateSchema.parse({
      organisationId: '00000000-0000-4000-8000-000000000001',
      firstName: ' ',
    })).toThrow();
    expect(() => ContactUpdateSchema.parse({
      organisationId: '00000000-0000-4000-8000-000000000001',
    })).toThrow();
  });

  it('validates engagement calendar dates and immutable update fields', () => {
    expect(() => EngagementCreateSchema.parse({
      organisationId: '00000000-0000-4000-8000-000000000001',
      name: 'Discovery',
      type: 'diagnostic',
      startDate: '2026-02-31',
    })).toThrow();
    expect(() => EngagementCreateSchema.parse({
      organisationId: '00000000-0000-4000-8000-000000000001',
      name: 'Discovery',
      type: 'diagnostic',
      startDate: '2026-03-02',
      endDate: '2026-03-01',
    })).toThrow();
    expect(() => EngagementUpdateSchema.parse({ organisationId: 'x' })).toThrow();
  });
});
