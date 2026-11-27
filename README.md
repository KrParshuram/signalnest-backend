# Signalnest Backend

Backend application for Signalnest, the customer feedback intelligence and social-proof platform.

## Product scope

The backend owns authentication, organizations and memberships, brands, feedback ingestion, AI processing, insights, actions, testimonials, widgets, integrations and audit history. It is a modular monolith; background processing runs in a separate worker process.

## Stack

- Node.js 22 + TypeScript + Express 5
- PostgreSQL + Prisma 6
- Redis (reserved for asynchronous workers)
- Zod request and environment validation

## Local development

Requirements: Node.js 22+, npm, Docker Desktop.

1. Copy `.env.example` to `.env`.
2. Set distinct random values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (at least 32 characters each).
3. Start local infrastructure: `docker compose up -d`.
4. Install dependencies: `npm install`.
5. Generate Prisma client and synchronize the development database: `npx prisma db push`.
6. Start the API: `npm run dev`.

The API listens on `http://localhost:4000`. Liveness: `GET /health`. Database readiness: `GET /ready`. Versioned endpoints use `/api/v1`.

## Current implementation

- API bootstrap with CORS allowlist, Helmet, request IDs, JSON body limits and rate limiting.
- Environment validation and structured JSON logs.
- Liveness and database readiness endpoints.
- Email/password registration and login, HttpOnly refresh cookie, refresh-token rotation and logout.
- Organization creation/listing and membership-scoped access.
- Brand listing and creation with organization membership checks.

Database migrations, worker processing, feedback capture and the remaining PRD modules are tracked in [the task ledger](docs/task-ledger.md).

## Engineering rules

1. All business records are scoped to an organization.
2. A client-supplied organization ID is a selector, never proof of access.
3. Preserve original feedback and source attribution; analysis and display copy are separate records.
4. Imports and background jobs must be idempotent.
5. Expensive AI work must not run inside request/response handlers.
6. Public endpoints expose only explicitly approved and published content.
7. Never commit credentials, tokens, customer data, or local environment files.

See [Architecture](docs/architecture.md) and [API contract](docs/api-contract.md).
