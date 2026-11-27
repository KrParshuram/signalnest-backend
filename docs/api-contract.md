# API contract — initial boundary

Base path: `/api/v1`. Resource ownership and conventions are defined here; detailed schemas evolve with each implementation task.

## Authentication

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

Access tokens authenticate API requests. Refresh tokens are held in HttpOnly cookies and are never returned in JSON.

## Organizations and members

- `GET /organizations`
- `POST /organizations` (optionally accepts `initialBrand` to create the first brand atomically)
- `GET /organizations/:organizationId`
- `PATCH /organizations/:organizationId`
- `GET /organizations/:organizationId/members`
- `POST /organizations/:organizationId/members`
- `PATCH /organizations/:organizationId/members/:memberId`
- `DELETE /organizations/:organizationId/members/:memberId`

## Brands and sources

- `GET /brands?organizationId=...`
- `POST /brands`
- `GET /brands/:brandId`
- `PATCH /brands/:brandId`
- `DELETE /brands/:brandId`
- `GET /sources?organizationId=...`

## Feedback and imports

- `GET /feedback` — supports organization, brand, source, date range, sentiment, topic, status, text search, sorting and cursor pagination
- `POST /feedback`
- `GET /feedback/:feedbackId`
- `PATCH /feedback/:feedbackId` — source metadata and assignment only; original content is immutable
- `DELETE /feedback/:feedbackId` — permanent deletion is restricted to owners/admins
- `POST /feedback/:feedbackId/archive`
- `POST /feedback/:feedbackId/restore`
- `GET /feedback/:feedbackId/notes`
- `POST /feedback/:feedbackId/notes`
- `POST /feedback/import/csv` — multipart upload; returns validated preview
- `POST /feedback/import/url` — manual URL capture; URL plus user-provided feedback text
- `POST /feedback/import/:jobId/confirm` — queues the reviewed import
- `GET /feedback/import/:jobId` — preview and processing status
- `GET /topics?organizationId=...`
- `POST /topics`
- `PATCH /topics/:topicId`
- `DELETE /topics/:topicId`

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

## Feedback integrity rules

- Original content is immutable after creation.
- Source attribution and import/publication timestamps are retained.
- List responses are cursor-paginated and organization-scoped.
- Archive and restore are reversible status changes; they do not rewrite original feedback.
- Internal notes are private organization data and are never exposed through public testimonial/widget endpoints.
- Exact normalized-content hashes identify likely duplicates; duplicate records retain their original content and link to the first matching record.

## CSV import contract

- Multipart fields: `organizationId`, `brandId`, and `file`.
- Upload limit: 5 MB and 1,000 data rows.
- Required content header: `content`, `original_content`, `feedback`, `review` or `message`.
- Optional headers: `author`, `author_name`, `display_name`, `source_url`, `url`, `link`, `published_at`, `date`, `created_at`, `external_id`, `review_id`.
- Preview validates rows and stores valid rows without creating feedback records.
- Confirmation is explicit and idempotent; it enqueues a BullMQ job.
- Worker processing is retryable and tracks row progress. A deterministic import-row key prevents duplicate creation after worker retries.

## Manual URL capture

The URL capture endpoint accepts an organization, brand, HTTP/HTTPS source URL, and feedback text supplied by the user. It creates a preview import job; the user must explicitly confirm before the worker stores the feedback. Signalnest does not fetch or scrape the submitted page in this workflow.

## Error and pagination format

Errors use `{ "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message", "details": [] } }`.

Cursor-based list responses use `{ "data": [], "page": { "nextCursor": null, "hasMore": false } }`.
