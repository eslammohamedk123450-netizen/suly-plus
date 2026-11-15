# Suly Plus

Multi-tenant e-commerce SaaS platform inspired by Shopify. Arabic RTL-first frontend, built to connect to an independently implemented backend.

## Stack
- React 18 + TypeScript
- Vite 6
- React Router 6
- Tailwind CSS 3
- Vitest + Testing Library

## Local development
1. Install Node.js (LTS) and Git.
2. Clone this repository.
3. Run `npm install`.
4. Copy `.env.example` to `.env.local` and set `VITE_API_BASE_URL` when the backend is available.
5. Run `npm run dev`.

## Commands
- `npm run dev` — local development server
- `npm run typecheck` — TypeScript validation
- `npm test` — unit tests
- `npm run build` — typecheck and production build
- `npm run preview` — preview production build

## Current implementation status
- Initial React/Vite/TypeScript project foundation and Arabic RTL design tokens.
- Public marketing routes, authentication placeholder routes, store setup placeholder, merchant dashboard sections, and public storefront route.
- Shared domain types, API client boundary, repository contracts and HTTP adapter skeleton.
- Basic input validation and unit tests.
- Backend integration contract documentation in docs/backend-contracts.md.

Authentication, tenant data, product persistence, checkout, payment, shipping, and live analytics are not active until a backend is implemented and connected. UI placeholders do not represent live data.

## Security and tenant boundaries
The frontend never treats a client-provided store ID as authorization. The backend must verify the session and authorize every operation against store ownership or membership. Keep service-role keys and all private credentials server-side.

## Database
This repository does not create or modify database schemas. Coordinate the API and data contracts with the backend implementation before enabling live features.
