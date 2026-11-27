# Backend task ledger

Status: **In progress**. A task is complete only after its acceptance checks pass.

## Phase 0 — Engineering foundation

- [x] BE-001 — API bootstrap, environment validation and health/readiness endpoints. **TypeScript build passed in GitHub Actions.**
- [ ] BE-002 — Prisma schema and reproducible database migrations for identity/workspaces/brands. **Initial schema committed; CI database sync and migration strategy under verification.**
- [x] BE-003 — Centralized validation, error handling, request IDs and structured logging. **TypeScript build passed; behavior tests are being added.**
- [ ] BE-004 — Automated unit/integration tests and CI. **CI build passed; PostgreSQL integration test run in progress.**
- [ ] BE-005 — Docker-based local PostgreSQL/Redis workflow and setup documentation. **Committed; local developer workflow not yet verified.**

## Phase 1 — Identity and workspace

- [ ] BE-101 — Registration, login, logout, refresh rotation and current-user endpoint. **Implemented; PostgreSQL integration test in progress.**
- [ ] BE-102 — Organization creation, listing and membership authorization. **Implemented; isolation test in progress.**
- [ ] BE-103 — Role-based permissions for OWNER, ADMIN, MANAGER, MEMBER and VIEWER. **Role model exists; complete policy enforcement pending.**
- [ ] BE-104 — Brand CRUD with organization isolation. **List/create implemented; detail/update/delete and tests pending.**

## Phase 2 — Feedback capture

- [ ] BE-201 — Feedback/source/topic persistence and immutable source content.
- [ ] BE-202 — Manual feedback create/read/update/archive APIs.
- [ ] BE-203 — CSV import validation, preview and asynchronous processing.
- [ ] BE-204 — URL capture with safe-fetch protections.
- [ ] BE-205 — Search, filtering, cursor pagination and source-aware duplicate detection.

## Phase 3 — Intelligence and social proof

- [ ] BE-301 — BullMQ worker and idempotent processing pipeline.
- [ ] BE-302 — Sentiment/topic/summary/feature-request analysis with confidence and versioning.
- [ ] BE-303 — Basic evidence-backed insights.
- [ ] BE-401 — Testimonial permission and approval workflow.
- [ ] BE-402 — Public Wall of Love/widget read API with strict publication filtering.

## Definition of done

- Acceptance criteria are met.
- Tests cover success, validation, authorization and failure paths.
- Lint/typecheck/build pass.
- Database migrations are reproducible.
- No secrets or sample customer data are committed.
- The relevant task ledger entry is updated with evidence of verification.
