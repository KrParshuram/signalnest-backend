# Backend architecture

## Architectural style

Signalnest starts as a modular monolith. Domain modules live in one API application and one worker application. Modules may share infrastructure, but must not bypass each other's service boundaries with ad-hoc database access.

## Runtime components

- **HTTP API:** authentication, authorization, validation, domain commands and queries.
- **Worker:** CSV/URL import jobs, normalization, duplicate checks and AI processing.
- **PostgreSQL:** durable source of truth.
- **Redis/BullMQ:** job transport, retries and failed-job visibility.
- **Object storage:** later use for uploaded source files and generated assets.

## Domain modules

1. Identity: users, sessions and authentication.
2. Organizations: workspaces, memberships and roles.
3. Brands: organization-owned business identities.
4. Sources: source configuration and connection state.
5. Feedback: immutable original customer content and normalized metadata.
6. Imports: CSV and URL capture, validation and job lifecycle.
7. Intelligence: sentiment, topics, summaries and evidence.
8. Insights: trends and recurring patterns.
9. Social proof: testimonial approval, Wall of Love and widgets.
10. Platform: audit, rate limits, observability and usage controls.

## Data isolation

Every business query must be constrained by an organization membership established from the authenticated principal. A client-supplied organization ID is a selector, never proof of access. Brand and feedback queries must include the verified organization boundary. Authorization is server-side.

## Feedback integrity

- Original content and source attribution are preserved.
- Normalized content, AI analysis and display copy are separate from the original.
- AI results include model/version and confidence metadata.
- Reprocessing must be possible without overwriting source evidence.
- Duplicate handling is idempotent and source-aware.

## API conventions

- Base path: `/api/v1`.
- JSON request and response bodies.
- Consistent error envelope: `{ "error": { "code": "...", "message": "...", "details": ... } }`.
- Validate all external input at the boundary.
- Use cursor pagination for potentially large collections.
- Return explicit status codes; do not leak stack traces.
- Use UTC timestamps in ISO 8601 format.

## Security baseline

- Password hashes use a modern password hashing function.
- Short-lived access tokens and rotating, revocable refresh sessions.
- HttpOnly, Secure-in-production, SameSite refresh cookies.
- Rate limiting on authentication and public endpoints.
- CORS allowlist, Helmet, request-size limits and schema validation.
- Secrets are stored outside the database or encrypted at rest.
- Public widget reads return approved testimonials only.
