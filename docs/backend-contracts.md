# Backend and Supabase contracts

Suly Plus currently uses Supabase directly through the browser-safe publishable key and server-side Edge Functions. The old generic HTTP repository adapter remains only as an unused compatibility boundary.

## Authentication
- Supabase Auth manages registration, sessions, sign-in, and sign-out.
- Profile rows are created from the Auth user trigger.
- Store membership and role are stored in `public.store_members`.

## Tenant isolation
- Every store-owned row contains `store_id`.
- RLS is enabled on every application table in the exposed `public` schema.
- Public storefront reads expose only active stores and published products.
- Merchant reads and writes are checked against store membership and role.
- The browser never receives a service-role or Secret API key.

## Catalog and inventory
- Product and variant records are persisted in PostgreSQL.
- Product creation and its initial variant are created together through a database RPC.
- Product images are stored in the `store-assets` bucket. Upload paths begin with the store UUID.
- Inventory movements record stock changes.

## Checkout
The public storefront stores cart line IDs and quantities in browser storage. It does not store trusted prices.

The checkout form invokes `create-guest-order`. That Edge Function:
1. validates the customer, address, product IDs, and quantities;
2. applies per-IP rate limiting;
3. calls a server-only database function;
4. lets PostgreSQL load current active product prices and lock inventory rows;
5. creates/updates the customer and inserts the order and order items;
6. decrements tracked stock and writes inventory movements;
7. returns an order number and random tracking token.

The database function is executable only by the server role. It ignores prices from the browser because the browser never submits them as authoritative values.

## Order tracking
- `get-order-status` requires the order number and its random public token.
- The response contains order status, totals, and item summaries only.
- Customer email, phone, and delivery address are not returned.
- The lookup RPC is executable only by the server role.

## Payments and fulfillment
- Cash on delivery is currently the only enabled payment method.
- `payment_transactions` stores the payment ledger for future provider integration.
- Online payment must be initiated and confirmed server-side. A provider webhook signature must be verified before changing `payment_status`.
- Shipping fees, tax, discounts, carrier tracking, and notifications are not enabled yet.

## Local configuration
Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in `.env.local`. Never place service-role or secret keys in a Vite environment variable.
