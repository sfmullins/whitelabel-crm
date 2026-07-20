import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseLegacyCustomerNotes } from '../infrastructure/database/wi3LegacyActivityBackfill';

const fallback = '2026-07-20T10:00:00.000Z';

describe('WI3 legacy note parser', () => {
  it('preserves exact source segments across mixed line endings', () => {
    const prefix = 'Free text before the first marker.\r\n\r\n';
    const first = '[Note logged on 2026-07-18T09:30:00Z]:\rFirst line\rSecond line\r\n\r\n';
    const second = '[Note logged on not parseable]:\nFinal line\r\n';
    const source = `${prefix}${first}${second}`;

    const segments = parseLegacyCustomerNotes(source, fallback);

    expect(segments).toHaveLength(3);
    expect(segments[0]).toMatchObject({
      rawSegment: prefix,
      body: 'Free text before the first marker.',
      occurredAt: fallback,
    });
    expect(segments[1]).toMatchObject({
      rawSegment: first,
      body: 'First line\rSecond line',
      occurredAt: '2026-07-18T09:30:00.000Z',
    });
    expect(segments[2].rawSegment).toBe(second);
    expect(segments[2].body).toContain('Legacy timestamp: not parseable');
    expect(segments[2].body).toContain('Final line');

    expect(createHash('sha256').update(segments[1].rawSegment).digest('hex'))
      .toBe(createHash('sha256').update(first).digest('hex'));
  });

  it('retains malformed markers as fallback text', () => {
    const malformed = '[Note logged maybe]\r\nBody that must survive';
    expect(parseLegacyCustomerNotes(malformed, fallback)).toEqual([{
      ordinal: 0,
      rawSegment: malformed,
      body: malformed,
      occurredAt: fallback,
    }]);
  });
});
