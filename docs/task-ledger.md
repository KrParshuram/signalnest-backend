# Backend task ledger

Status: **Not started** means no implementation has been committed. A task is complete only after its acceptance checks pass.

## Phase 0 — Engineering foundation

- [ ] BE-001 — Establish API bootstrap, configuration validation and health/readiness endpoints.
- [ ] BE-002 — Establish Prisma schema, migrations and database constraints for identity/workspaces/brands.
- [ ] BE-003 — Add centralized validation, error handling, request IDs and structured logging.
- [ ] BE-004 — Add automated unit/integration test setup and CI.
- [ ] BE-005 — Add Docker-based local PostgreSQL/Redis workflow and setup documentation.

## Phase 1 — Identity and workspace

- [ ] BE-101 — Registration, login, logout, refresh rotation and current-user endpoint.
- [ ] BE-102 — Organization creation, listing and membership authorization.
- [ ] BE-103 — Role-based permissions for OWNER, ADMIN, MANAGER, MEMBER and VIEWER.
- [ ] BE-104 — Brand CRUD with organization isolation.

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
