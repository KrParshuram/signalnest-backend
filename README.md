# Signalnest Backend

Backend application for Signalnest, the customer feedback intelligence and social-proof platform.

## Product scope

The backend owns authentication, organizations and memberships, brands, feedback ingestion, AI processing, insights, actions, testimonials, widgets, integrations and audit history. It is a modular monolith; background processing runs in a separate worker process.

## Architecture

- Node.js + TypeScript + Express
- PostgreSQL + Prisma
- Redis + BullMQ for asynchronous imports and AI processing
- Zod for request and environment validation
- REST API under `/api/v1`

See [Architecture](docs/architecture.md), [API contract](docs/api-contract.md), and [Task ledger](docs/task-ledger.md).

## Engineering rules

1. All business records are scoped to an organization.
2. Resolve and verify organization membership and role before accessing organization data.
3. Preserve original feedback and source attribution; analysis and display copy are separate records.
4. Imports and background jobs must be idempotent.
5. Expensive AI work must not run inside request/response handlers.
6. Public endpoints expose only explicitly approved and published content.
7. Never commit credentials, tokens, customer data, or local environment files.

## Local development

The exact setup commands and environment variables will be documented alongside the foundation implementation. Do not assume production readiness until CI, migrations and integration tests pass.
