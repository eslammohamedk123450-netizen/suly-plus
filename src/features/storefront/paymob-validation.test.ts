import { describe, expect, it } from 'vitest';
import { isPaymobIntegrationId } from '../../../supabase/functions/_shared/paymob.ts';

describe('Paymob integration ID validation', () => {
  it('accepts a numeric integration ID', () => {
    expect(isPaymobIntegrationId('123456')).toBe(true);
    expect(isPaymobIntegrationId('00123')).toBe(true);
  });

  it.each(['', 'abc', '12abc', '-123', '12.3', ' 123 ', '123\\n'])(
    'rejects invalid integration IDs: %s',
    (value) => {
      expect(isPaymobIntegrationId(value)).toBe(false);
    },
  );
});
