# Backend and Supabase contracts

Suly Plus uses Supabase directly through the browser-safe publishable key and server-side Edge Functions.

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
6. reserves tracked stock and records inventory movements;
7. returns an order number and random tracking token.

Prices are always loaded from PostgreSQL. Values sent by the browser are identifiers and quantities only.

## Order tracking
- `get-order-status` requires the order number and its random public token.
- The response contains order status, payment status, totals, and item summaries only.
- Customer email, phone, and delivery address are not returned.

## Paymob
- `get-checkout-methods` tells the storefront whether Paymob secrets have been configured.
- `create-guest-order` creates a pending Paymob order, creates a Paymob Intention server-side, and returns only the hosted checkout URL and safe order summary.
- The secret key is sent only in the server-side `Authorization: Token` header when calling Paymob's Egypt Intention API.
- `paymob-webhook` verifies the Transaction Processed Callback HMAC-SHA512 using the documented field order, rejects malformed signatures, verifies the configured Integration ID, validates order reference, amount and currency, and updates payment state through a service-role-only database function.
- Duplicate transaction callbacks are idempotent. Failed transactions cancel pending orders and restore tracked inventory.
- The browser redirect is a user-experience route only; the verified Webhook is the payment source of truth.

## Current payment account model
Current Paymob environment variables configure one platform-level merchant account for the Suly Plus project. This is suitable only for controlled development/testing under that merchant account. It is not per-store merchant onboarding or marketplace settlement. Before enabling Paymob for independent sellers, implement a Paymob-approved submerchant/marketplace settlement model or encrypted per-store merchant credentials with independent ownership verification.

## Payment limitations
- Cash on delivery remains available.
- Payment methods beyond the configured Paymob Integration ID are not assumed to work. Validate HMAC field shapes for each merchant's enabled payment method before launch.
- Shipping fees, taxes, discounts, carrier tracking, refunds, and payouts are not enabled.

## Local configuration
Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` belong in `.env.local`. Never place service-role, Paymob secret, or HMAC keys in a Vite environment variable.
