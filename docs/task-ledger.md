# Backend task ledger

Status: **In progress**. A task is complete only after its acceptance checks pass.

## Phase 0 — Engineering foundation

- [x] BE-001 — API bootstrap, environment validation and health/readiness endpoints. **GitHub Actions build passed.**
- [ ] BE-002 — Prisma schema and reproducible database migrations for identity/workspaces/brands. **Initial schema committed and PostgreSQL schema sync passed; migration files/workflow still pending.**
- [x] BE-003 — Centralized validation, error handling, request IDs and structured logging. **TypeScript build passed.**
- [x] BE-004 — Automated unit/integration tests and CI. **PostgreSQL-backed integration suite passed in GitHub Actions; expanded fixture-isolation version is being re-run.**
- [ ] BE-005 — Docker-based local PostgreSQL/Redis workflow and setup documentation. **Committed; local developer workflow not yet verified.**

## Phase 1 — Identity and workspace

- [x] BE-101 — Registration, login, logout, refresh rotation and current-user endpoint. **Integration-tested, including refresh-token replay rejection.**
- [x] BE-102 — Organization creation, listing and membership authorization. **Integration-tested, including cross-organization access denial.**
- [ ] BE-103 — Role-based permissions for OWNER, ADMIN, MANAGER, MEMBER and VIEWER. **Role model exists; centralized policy and full role matrix tests pending.**
- [ ] BE-104 — Brand CRUD with organization isolation. **List/create and organization isolation implemented; detail/update/delete pending.**

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
