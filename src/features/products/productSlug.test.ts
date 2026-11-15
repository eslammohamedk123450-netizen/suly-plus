import { describe, expect, it } from 'vitest';
import { createProductSlug } from './productSlug';

describe('createProductSlug', () => {
  it('keeps Arabic and Latin letters and normalizes spaces', () => {
    expect(createProductSlug('  قميص قطني Blue 2  ', 'product-x')).toBe('قميص-قطني-blue-2');
  });

  it('removes punctuation at the edges', () => {
    expect(createProductSlug('---Summer Shirt!!!', 'product-x')).toBe('summer-shirt');
  });

  it('uses a stable fallback when the name contains no letters or numbers', () => {
    expect(createProductSlug('!!!', 'product-123')).toBe('product-123');
  });
});
