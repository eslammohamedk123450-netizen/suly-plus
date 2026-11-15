# Backend integration contracts

This frontend does not create or modify database objects. Backend implementation must agree on these capabilities before live integration.

## Required capabilities
- Authentication: current session, sign in, sign up, sign out.
- Tenant stores: list owned stores, create a store, resolve a public store by slug.
- Catalog: list, retrieve, and create products scoped to a store.
- Orders and customers: paginated store-scoped reads.
- Inventory: variant-level stock quantities and atomic stock adjustments.
- Checkout: server-side price validation, inventory reservation, order creation, and payment-provider handoff.

## Tenant isolation
- Derive identity from a verified server session; never trust client-supplied owner IDs.
- Authorize every private operation against store membership or ownership on the server.
- Scope tenant-owned records by store ID and enforce isolation in the data layer, including RLS where applicable.
- Public storefront endpoints expose only published public-safe fields.
- Never expose service-role credentials to the browser.

## Product extensibility
The frontend model defines physical and digital product kinds. Physical variants include SKU, options, price in integer minor currency units, and inventory quantity. Digital file delivery and fulfillment are intentionally deferred.

## API conventions
- JSON request and response bodies.
- Errors use code and message fields.
- Paginated reads return items, total, page, and pageSize.
- Prices are integer minor units with an ISO currency code.
- Authenticated requests use secure HTTP-only session cookies and CSRF protection for state-changing requests.
- Proposed endpoint shapes are in src/services/repositories/httpRepositories.ts; they are not a claim that a server already exists.

## Environment
Set VITE_API_BASE_URL to the backend API origin. Only public browser-safe configuration belongs in Vite environment variables.
