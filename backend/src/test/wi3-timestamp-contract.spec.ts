import { describe, expect, it } from 'vitest';
import { ActivityCreateBodySchema, IsoTimestampSchema } from 'shared';

describe('WI3 timestamp contracts', () => {
  it('normalises valid ISO-8601 offsets to UTC', () => {
    expect(IsoTimestampSchema.parse('2026-07-20T11:30:00+01:00'))
      .toBe('2026-07-20T10:30:00.000Z');
  });

  it.each([
    'July 20, 2026 10:30',
    '2026-07-20 10:30:00',
    '2026-07-20T10:30:00',
    'not-a-time',
  ])('rejects non-ISO or timezone-less activity timestamps: %s', (value) => {
    expect(() => ActivityCreateBodySchema.parse({
      type: 'note',
      body: 'Timestamp validation',
      occurredAt: value,
    })).toThrow();
  });
});
