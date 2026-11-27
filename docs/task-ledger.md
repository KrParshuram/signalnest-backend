# Backend task ledger

Status: **In progress**. A task is complete only after its acceptance checks pass.

## Phase 0 — Engineering foundation

- [x] BE-001 — API bootstrap, environment validation and health/readiness endpoints. **GitHub Actions build passed.**
- [ ] BE-002 — Prisma schema and reproducible database migrations for identity/workspaces/brands/feedback. **Schema synchronization is validated in CI; checked-in migration history is still pending.**
- [x] BE-003 — Centralized validation, error handling, request IDs and structured logging. **TypeScript build passed.**
- [x] BE-004 — Automated integration tests and CI. **PostgreSQL-backed identity, workspace, role, feedback, topics, URL preview and CSV preview tests are included.**
- [ ] BE-005 — Docker-based local PostgreSQL/Redis workflow and setup documentation. **Committed; local developer workflow not yet verified.**

## Phase 1 — Identity and workspace

- [x] BE-101 — Registration, login, logout, refresh rotation and current-user endpoint. **Integration-tested, including refresh-token replay rejection.**
- [x] BE-102 — Organization creation, listing and membership authorization. **Integration-tested; initial brand and default topics are created atomically with the workspace.**
- [ ] BE-103 — Role-based permissions for OWNER, ADMIN, MANAGER, MEMBER and VIEWER. **Brand and feedback policies are enforced; full member/integration/action permission matrix remains.**
- [x] BE-104 — Brand CRUD with organization isolation. **List/create/read/update/delete implemented and integration-tested.**

## Phase 2 — Feedback capture

- [x] BE-201 — Feedback/source/topic persistence and immutable source content. **Schema and API implemented; source content cannot be changed through PATCH.**
- [x] BE-202 — Manual feedback create/read/update/archive/restore APIs, internal notes and permanent deletion policy. **Implemented and integration-tested.**
- [ ] BE-203 — CSV import validation, preview and asynchronous processing. **Preview validation, explicit confirmation route, BullMQ producer and retry-safe worker are implemented; CSV/URL processor service is integration-tested against PostgreSQL. Live BullMQ transport confirmation remains.**
- [x] BE-204 — Manual URL capture with safe HTTP/HTTPS scheme validation. **User supplies both the source URL and feedback text; no automatic page scraping.**
- [x] BE-205 — Search, filtering, cursor pagination and duplicate detection. **Organization-scoped search, brand/source/sentiment/topic/status/date filters, sorting, cursor pagination and normalized-content duplicate linking implemented.**

## Phase 3 — Intelligence and social proof

- [ ] BE-301 — BullMQ worker and idempotent processing pipeline. **Feedback import worker and retry-safe row identity implemented and processor-tested; production worker operations, live queue transport verification and monitoring remain.**
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
