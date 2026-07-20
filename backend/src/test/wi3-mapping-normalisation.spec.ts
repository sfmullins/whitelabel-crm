import { describe, expect, it } from 'vitest';
import { normaliseLegacyCompany } from '../infrastructure/database/LegacyCustomerMappingRepository';

describe('WI3 legacy company normalisation', () => {
  it('preserves the first outer-trimmed display value while normalising only the key', () => {
    expect(normaliseLegacyCompany('  Ａｃｍｅ   Ltd  ')).toEqual({
      displayName: 'Ａｃｍｅ   Ltd',
      sourceKey: 'company:acme ltd',
    });
  });

  it('maps equivalent Unicode and whitespace variants to the same comparison key', () => {
    expect(normaliseLegacyCompany('Ａｃｍｅ   Ltd').sourceKey)
      .toBe(normaliseLegacyCompany('Acme Ltd').sourceKey);
  });
});
