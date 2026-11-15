export interface CartLine {
  productId: string;
  quantity: number;
}

function cartKey(storeSlug: string) {
  return `suly_cart_${storeSlug}`;
}

export function readCart(storeSlug: string): CartLine[] {
  try {
    const raw = localStorage.getItem(cartKey(storeSlug));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is CartLine =>
      Boolean(line)
      && typeof line.productId === 'string'
      && /^[0-9a-f-]{36}$/i.test(line.productId)
      && Number.isInteger(line.quantity)
      && line.quantity > 0
      && line.quantity <= 100
    );
  } catch {
    return [];
  }
}

export function writeCart(storeSlug: string, cart: CartLine[]) {
  try {
    localStorage.setItem(cartKey(storeSlug), JSON.stringify(cart));
  } catch {
    // The checkout page can still use the current in-memory cart.
  }
}

export function addCartItem(storeSlug: string, productId: string): CartLine[] {
  const current = readCart(storeSlug);
  const existing = current.find(line => line.productId === productId);
  const next = existing
    ? current.map(line => line.productId === productId ? { ...line, quantity: Math.min(100, line.quantity + 1) } : line)
    : [...current, { productId, quantity: 1 }];
  writeCart(storeSlug, next);
  return next;
}

export function clearCart(storeSlug: string) {
  try {
    localStorage.removeItem(cartKey(storeSlug));
  } catch {
    // Ignore browser storage restrictions.
  }
}
