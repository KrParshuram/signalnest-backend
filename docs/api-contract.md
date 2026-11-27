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
- `PATCH /feedback/:feedbackId` (source metadata and assignment only; original content is immutable)
- `GET /feedback/:feedbackId/notes`
- `POST /feedback/:feedbackId/notes`
- `POST /feedback/:feedbackId/restore`
- `DELETE /feedback/:feedbackId`
- `POST /feedback/import/csv` (multipart upload; returns validated preview)
- `POST /feedback/import/:jobId/confirm` (queues the reviewed import)
- `POST /feedback/import/url`
- `GET /feedback/import/:jobId` (preview and processing status)

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

## Feedback integrity rules

- Original content is immutable after creation.
- Source attribution and import/publication timestamps are retained.
- List responses are cursor-paginated and organization-scoped.
- Archive and restore are reversible status changes; they do not rewrite original feedback.
- Internal notes are private organization data and are never exposed through public testimonial/widget endpoints.

## CSV import contract

- Multipart fields: `organizationId`, `brandId`, and `file`.
- Upload limit: 5 MB and 1,000 data rows.
- Required content header: `content`, `original_content`, `feedback`, `review` or `message`.
- Optional headers: `author`, `author_name`, `display_name`, `source_url`, `url`, `link`, `published_at`, `date`, `created_at`, `external_id`, `review_id`.
- Preview validates rows and stores valid rows without creating feedback records.
- Confirmation is explicit and idempotent; it enqueues a BullMQ job.
- Worker processing is retryable and tracks row progress. A deterministic import-row key prevents duplicate creation after worker retries.
- Exact-content matches are linked through `duplicateOfId`; original content remains unchanged.
