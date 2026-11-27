# Signalnest Backend

Backend application for Signalnest, the customer feedback intelligence and social-proof platform.

## Stack

- Node.js 22 + TypeScript + Express 5
- PostgreSQL + Prisma 6
- Redis + BullMQ for asynchronous imports
- Zod request and environment validation

## Local development

Requirements: Node.js 22+, npm, Docker Desktop.

1. Copy `.env.example` to `.env`.
2. Set distinct random values for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (at least 32 characters each).
3. Start infrastructure: `docker compose up -d`.
4. Install dependencies: `npm install`.
5. Generate Prisma client and sync the development database: `npx prisma db push`.
6. Start the API: `npm run dev`.
7. In a second terminal, start the background worker: `npm run build` then `npm run worker`.

The API listens on `http://localhost:4000`. Liveness: `GET /health`. Database readiness: `GET /ready`. Versioned endpoints use `/api/v1`.

## Implemented capabilities

- Environment validation, structured JSON logs, request IDs, CORS allowlist, Helmet, body limits and rate limiting.
- Email/password registration and login, HttpOnly refresh cookie, refresh-token rotation, replay rejection and logout.
- Organization creation/listing and membership-scoped access.
- Atomic initial organization + first brand + default topic creation.
- Brand CRUD with organization isolation and role checks.
- Organization-scoped topic and source listing.
- Manual feedback create/read/update/archive/restore, source attribution, immutable original content and private notes.
- Search, brand/source/sentiment/topic/status/date filters, sorting and cursor pagination.
- Content-hash duplicate linking and member inbox restriction to assigned feedback.
- CSV upload preview, row-level validation, explicit confirmation and a retry-safe BullMQ worker.
- Manual URL capture with HTTP/HTTPS validation and user-provided feedback text; no automatic scraping.

## Not implemented yet

AI classification, evidence-backed insights, actions, testimonials, widgets and external integrations remain on the task ledger. The CSV/URL processing service is integration-tested; live BullMQ queue transport verification remains pending.

See [Architecture](docs/architecture.md), [API contract](docs/api-contract.md), and [Task ledger](docs/task-ledger.md).
