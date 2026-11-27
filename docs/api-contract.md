# API contract — initial boundary

Base path: `/api/v1`. This document defines resource ownership and conventions; endpoint schemas are added with each implementation task.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

The access token authenticates API requests. The refresh token is held in an HttpOnly cookie and is never returned in JSON.

## Organizations and members

- `GET /organizations`
- `POST /organizations` (optionally accepts `initialBrand` to create the first brand atomically)
- `GET /organizations/:organizationId`
- `PATCH /organizations/:organizationId`
- `GET /organizations/:organizationId/members`
- `POST /organizations/:organizationId/members`
- `PATCH /organizations/:organizationId/members/:memberId`
- `DELETE /organizations/:organizationId/members/:memberId`

## Brands

- `GET /brands?organizationId=...`
- `POST /brands`
- `GET /brands/:brandId`
- `PATCH /brands/:brandId`
- `DELETE /brands/:brandId`

## Feedback and imports

- `GET /feedback`
- `POST /feedback`
- `GET /feedback/:feedbackId`
- `PATCH /feedback/:feedbackId`
- `DELETE /feedback/:feedbackId`
- `POST /feedback/import/csv`
- `POST /feedback/import/url`
- `GET /feedback/import/:jobId`

List queries will support organization, brand, source, date range, sentiment, topic and text filters, with cursor pagination.

## Insights and social proof

- `GET /insights/overview`
- `GET /insights/trends`
- `GET /insights/topics`
- `GET /testimonials`
- `POST /testimonials`
- `POST /testimonials/:testimonialId/approve`
- `POST /testimonials/:testimonialId/reject`
- `GET /widgets`
- `POST /widgets`
- `GET /public/widgets/:publicKey`

The public widget endpoint must filter to approved, published testimonials and expose no private feedback metadata.

## Error and pagination format

Errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": [] } }`.

Cursor-based list responses use `{ "data": [], "page": { "nextCursor": null, "hasMore": false } }`. Exact schemas will be committed with their endpoint implementation.
