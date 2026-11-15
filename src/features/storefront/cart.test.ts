import { beforeEach, describe, expect, it } from 'vitest';
import { addCartItem, clearCart, readCart, writeCart } from './cart';

const store = 'test-store';
const productA = '123e4567-e89b-12d3-a456-426614174000';
const productB = '123e4567-e89b-12d3-a456-426614174001';

describe('storefront cart', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('adds items and increments an existing product line', () => {
    addCartItem(store, productA);
    const cart = addCartItem(store, productA);
    expect(cart).toEqual([{ productId: productA, quantity: 2 }]);
  });

  it('keeps carts isolated by store slug', () => {
    writeCart(store, [{ productId: productA, quantity: 1 }]);
    writeCart('another-store', [{ productId: productB, quantity: 3 }]);
    expect(readCart(store)).toEqual([{ productId: productA, quantity: 1 }]);
    expect(readCart('another-store')).toEqual([{ productId: productB, quantity: 3 }]);
  });

  it('clears only the selected store cart', () => {
    writeCart(store, [{ productId: productA, quantity: 1 }]);
    writeCart('another-store', [{ productId: productB, quantity: 2 }]);
    clearCart(store);
    expect(readCart(store)).toEqual([]);
    expect(readCart('another-store')).toEqual([{ productId: productB, quantity: 2 }]);
  });

  it('ignores malformed or invalid stored data', () => {
    localStorage.setItem('suly_cart_test-store', JSON.stringify([{ productId: 'bad', quantity: 1 }]));
    expect(readCart(store)).toEqual([]);
  });
});
