import { Router } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { permissions } from "../lib/permissions.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { getFeedbackImportQueue } from "../queues/feedback-import.queue.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
router.use(requireAuth);

async function getMembership(userId: string, organizationId: string) {
  return prisma.organizationMember.findFirst({
    where: { userId, organizationId, status: "ACTIVE" },
    select: { id: true, role: true },
  });
}

async function getFeedbackAccess(userId: string, feedbackId: string) {
  const feedback = await prisma.feedback.findUnique({ where: { id: feedbackId } });
  if (!feedback) throw new HttpError(404, "FEEDBACK_NOT_FOUND", "Feedback not found.");
  const membership = await getMembership(userId, feedback.organizationId);
  if (!membership) throw new HttpError(404, "FEEDBACK_NOT_FOUND", "Feedback not found.");
  if (membership.role === "MEMBER" && feedback.assignedToUserId !== userId) {
    throw new HttpError(404, "FEEDBACK_NOT_FOUND", "Feedback not found.");
  }
  return { feedback, membership };
}

const feedbackInclude = {
  brand: { select: { id: true, name: true } },
  source: { select: { id: true, name: true, type: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  topicAssignments: {
    include: { topic: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

const createSchema = z.object({
  organizationId: z.string().uuid(),
  brandId: z.string().uuid(),
  originalContent: z.string().trim().min(1).max(20_000),
  sourceId: z.string().uuid().optional(),
  sourceUrl: z.string().url().max(2048).optional(),
  authorDisplayName: z.string().trim().max(160).optional(),
  publishedAt: z.string().datetime().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  topicIds: z.array(z.string().uuid()).max(20).optional(),
}).strict();

const updateSchema = z.object({
  sourceUrl: z.union([z.string().url().max(2048), z.literal("")]).nullable().optional(),
  authorDisplayName: z.string().trim().max(160).nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one editable field must be provided.",
});

router.post("/import/url", async (req, res) => {
  const input = z.object({
    organizationId: z.string().uuid(),
    brandId: z.string().uuid(),
    url: z.string().url().max(2048),
    originalContent: z.string().trim().min(1).max(20_000),
    authorDisplayName: z.string().trim().max(160).optional(),
    publishedAt: z.string().datetime().optional(),
  }).strict().parse(req.body);
  const parsedUrl = new URL(input.url);
  if ((parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") || parsedUrl.username || parsedUrl.password) {
    throw new HttpError(400, "INVALID_SOURCE_URL", "Only HTTP and HTTPS source URLs are supported.");
  }
  const membership = await getMembership(req.userId!, input.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (!permissions.manageInsights(membership.role)) throw new HttpError(403, "FORBIDDEN", "Only owners, admins and managers can capture a URL.");
  const brand = await prisma.brand.findFirst({ where: { id: input.brandId, organizationId: input.organizationId }, select: { id: true } });
  if (!brand) throw new HttpError(404, "BRAND_NOT_FOUND", "Brand not found.");

  const previewData = [{
    originalContent: input.originalContent,
    sourceUrl: input.url,
    ...(input.authorDisplayName ? { authorDisplayName: input.authorDisplayName } : {}),
    ...(input.publishedAt ? { publishedAt: input.publishedAt } : {}),
  }];
  const importJob = await prisma.feedbackImportJob.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      createdByUserId: req.userId!,
      type: "URL",
      status: "PREVIEWED",
      fileName: parsedUrl.hostname,
      totalRows: 1,
      validRows: 1,
      invalidRows: 0,
      previewData: previewData as unknown as Prisma.InputJsonValue,
      errors: [],
    },
    select: { id: true, status: true, fileName: true, totalRows: true, validRows: true, invalidRows: true, createdAt: true },
  });
  return res.status(201).json({ ...importJob, preview: previewData });
});
router.post("/import/csv", upload.single("file"), async (req, res) => {
  const input = z.object({ organizationId: z.string().uuid(), brandId: z.string().uuid() }).strict().parse(req.body);
  const membership = await getMembership(req.userId!, input.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (!permissions.manageInsights(membership.role)) throw new HttpError(403, "FORBIDDEN", "Only owners, admins and managers can import feedback.");
  if (!req.file) throw new HttpError(400, "CSV_FILE_REQUIRED", "Choose a CSV file to upload.");
  if (!req.file.originalname.toLowerCase().endsWith(".csv")) throw new HttpError(400, "INVALID_FILE_TYPE", "Only .csv files can be imported.");
  const brand = await prisma.brand.findFirst({ where: { id: input.brandId, organizationId: input.organizationId }, select: { id: true } });
  if (!brand) throw new HttpError(404, "BRAND_NOT_FOUND", "Brand not found.");

  let records: Record<string, string>[];
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, bom: true, trim: true, max_record_size: 20_000 }) as Record<string, string>[];
  } catch {
    throw new HttpError(400, "INVALID_CSV", "The CSV file could not be parsed. Check its headers, quotes and row structure.");
  }
  if (records.length === 0) throw new HttpError(400, "CSV_EMPTY", "The CSV file does not contain any data rows.");
  if (records.length > 1000) throw new HttpError(413, "CSV_ROW_LIMIT", "A single import can contain at most 1,000 data rows.");

  const validRows: { originalContent: string; authorDisplayName?: string; sourceUrl?: string; publishedAt?: string; externalId?: string }[] = [];
  const errors: { rowNumber: number; reason: string }[] = [];
  const externalIds = new Set<string>();
  records.forEach((record, index) => {
    const row = Object.fromEntries(Object.entries(record).map(([key, value]) => [key.trim().toLowerCase().replace(/[\\s-]+/g, "_"), String(value ?? "").trim()]));
    const originalContent = row.original_content || row.content || row.feedback || row.review || row.message || "";
    if (!originalContent) { errors.push({ rowNumber: index + 2, reason: "Missing feedback content. Use a content, feedback, review or message column." }); return; }
    if (originalContent.length > 20_000) { errors.push({ rowNumber: index + 2, reason: "Feedback content exceeds 20,000 characters." }); return; }

    const sourceUrl = row.source_url || row.url || row.link || "";
    if (sourceUrl) {
      try {
        const parsedUrl = new URL(sourceUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") throw new Error("Invalid protocol");
      } catch { errors.push({ rowNumber: index + 2, reason: "Source URL must be a valid HTTP or HTTPS URL." }); return; }
    }

    const publishedAtRaw = row.published_at || row.date || row.created_at || "";
    let publishedAt: string | undefined;
    if (publishedAtRaw) {
      const date = new Date(publishedAtRaw);
      if (Number.isNaN(date.getTime())) { errors.push({ rowNumber: index + 2, reason: "Publication date is invalid." }); return; }
      publishedAt = date.toISOString();
    }

    const externalId = row.external_id || row.review_id || "";
    if (externalId && externalIds.has(externalId)) { errors.push({ rowNumber: index + 2, reason: "Duplicate external ID in this file." }); return; }
    if (externalId) externalIds.add(externalId);

    validRows.push({
      originalContent,
      ...(row.author || row.author_name || row.display_name ? { authorDisplayName: row.author || row.author_name || row.display_name } : {}),
      ...(sourceUrl ? { sourceUrl } : {}),
      ...(publishedAt ? { publishedAt } : {}),
      ...(externalId ? { externalId } : {}),
    });
  });

  if (validRows.length === 0) throw new HttpError(400, "CSV_NO_VALID_ROWS", "No valid feedback rows were found. Review the CSV errors and try again.", errors);
  const importJob = await prisma.feedbackImportJob.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      createdByUserId: req.userId!,
      type: "CSV",
      status: "PREVIEWED",
      fileName: req.file.originalname.slice(0, 255),
      totalRows: records.length,
      validRows: validRows.length,
      invalidRows: errors.length,
      previewData: validRows as unknown as Prisma.InputJsonValue,
      errors: errors as unknown as Prisma.InputJsonValue,
    },
    select: { id: true, status: true, fileName: true, totalRows: true, validRows: true, invalidRows: true, errors: true, createdAt: true },
  });
  return res.status(201).json({ ...importJob, preview: validRows.slice(0, 20) });
});

router.post("/import/:jobId/confirm", async (req, res) => {
  const importJob = await prisma.feedbackImportJob.findUnique({ where: { id: req.params.jobId } });
  if (!importJob) throw new HttpError(404, "IMPORT_NOT_FOUND", "Import job not found.");
  const membership = await getMembership(req.userId!, importJob.organizationId);
  if (!membership) throw new HttpError(404, "IMPORT_NOT_FOUND", "Import job not found.");
  if (!permissions.manageInsights(membership.role)) throw new HttpError(403, "FORBIDDEN", "Only owners, admins and managers can confirm imports.");
  if (importJob.status !== "PREVIEWED") throw new HttpError(409, "IMPORT_NOT_PREVIEWED", "This import is no longer awaiting confirmation.");

  const updated = await prisma.feedbackImportJob.updateMany({
    where: { id: importJob.id, status: "PREVIEWED" },
    data: { status: "QUEUED" },
  });
  if (updated.count !== 1) throw new HttpError(409, "IMPORT_ALREADY_CONFIRMED", "This import has already been confirmed.");

  try {
    const queue = getFeedbackImportQueue();
    await queue.add("process-feedback-import", { importJobId: importJob.id }, {
      jobId: importJob.id,
      attempts: 3,
      backoff: { type: "exponential", delay: 3000 },
      removeOnComplete: 100,
      removeOnFail: 1000,
    });
  } catch {
    await prisma.feedbackImportJob.update({ where: { id: importJob.id }, data: { status: "FAILED", failureReason: "Unable to queue import. Please retry or contact support." } });
    throw new HttpError(503, "IMPORT_QUEUE_UNAVAILABLE", "Import processing is temporarily unavailable. Please try again.");
  }

  return res.status(202).json({ id: importJob.id, status: "QUEUED", validRows: importJob.validRows });
});

router.get("/import/:jobId", async (req, res) => {
  const importJob = await prisma.feedbackImportJob.findUnique({ where: { id: req.params.jobId } });
  if (!importJob) throw new HttpError(404, "IMPORT_NOT_FOUND", "Import job not found.");
  const membership = await getMembership(req.userId!, importJob.organizationId);
  if (!membership) throw new HttpError(404, "IMPORT_NOT_FOUND", "Import job not found.");
  return res.json({
    id: importJob.id, type: importJob.type, status: importJob.status, fileName: importJob.fileName,
    totalRows: importJob.totalRows, validRows: importJob.validRows, invalidRows: importJob.invalidRows,
    processedRows: importJob.processedRows, errors: importJob.errors, failureReason: importJob.failureReason,
    createdAt: importJob.createdAt, completedAt: importJob.completedAt,
    ...(importJob.status === "PREVIEWED" ? { preview: importJob.previewData } : {}),
  });
});
router.get("/", async (req, res) => {
  const query = z.object({
    organizationId: z.string().uuid(),
    brandId: z.string().uuid().optional(),
    sourceId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"]).optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
    fromDate: z.string().datetime().optional(),
    toDate: z.string().datetime().optional(),
    sortBy: z.enum(["createdAt", "publishedAt"]).default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
    search: z.string().trim().max(200).optional(),
    cursor: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  }).strict().parse(req.query);

  const membership = await getMembership(req.userId!, query.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");

  const where = {
    organizationId: query.organizationId,
    ...(membership.role === "MEMBER" ? { assignedToUserId: req.userId! } : {}),
    status: query.status,
    ...(query.brandId ? { brandId: query.brandId } : {}),
    ...(query.sourceId ? { sourceId: query.sourceId } : {}),
    ...(query.sentiment ? { sentiment: query.sentiment } : {}),
    ...(query.fromDate || query.toDate ? { createdAt: { ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}), ...(query.toDate ? { lte: new Date(query.toDate) } : {}) } } : {}),
    ...(query.topicId ? { topicAssignments: { some: { topicId: query.topicId } } } : {}),
    ...(query.search ? {
      OR: [
        { originalContent: { contains: query.search, mode: "insensitive" as const } },
        { authorDisplayName: { contains: query.search, mode: "insensitive" as const } },
        { sourceUrl: { contains: query.search, mode: "insensitive" as const } },
      ],
    } : {}),
  };

  const rows = await prisma.feedback.findMany({
    where,
    include: feedbackInclude,
    orderBy: query.sortBy === "publishedAt"
      ? [{ publishedAt: query.sortOrder }, { id: query.sortOrder }]
      : [{ createdAt: query.sortOrder }, { id: query.sortOrder }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > query.limit;
  const data = hasMore ? rows.slice(0, query.limit) : rows;
  return res.json({
    data,
    page: { nextCursor: hasMore ? data[data.length - 1]?.id ?? null : null, hasMore },
  });
});

router.post("/", async (req, res) => {
  const input = createSchema.parse(req.body);
  const membership = await getMembership(req.userId!, input.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (!permissions.createFeedback(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to create feedback.");
  }
  if (membership.role === "MEMBER" && input.assignedToUserId && input.assignedToUserId !== req.userId) {
    throw new HttpError(403, "FORBIDDEN", "Members can only create feedback assigned to themselves.");
  }

  const brand = await prisma.brand.findFirst({
    where: { id: input.brandId, organizationId: input.organizationId },
    select: { id: true },
  });
  if (!brand) throw new HttpError(404, "BRAND_NOT_FOUND", "Brand not found.");

  if (input.topicIds && new Set(input.topicIds).size !== input.topicIds.length) {
    throw new HttpError(400, "DUPLICATE_TOPICS", "A topic can only be assigned once.");
  }
  if (input.topicIds?.length) {
    const topics = await prisma.topic.count({ where: { id: { in: input.topicIds }, organizationId: input.organizationId } });
    if (topics !== input.topicIds.length) throw new HttpError(400, "INVALID_TOPICS", "One or more topics do not belong to this organization.");
  }

  if (input.assignedToUserId) {
    const assignee = await getMembership(input.assignedToUserId, input.organizationId);
    if (!assignee) throw new HttpError(400, "INVALID_ASSIGNEE", "The assigned user is not an active member of this organization.");
  }

  let sourceId = input.sourceId;
  if (sourceId) {
    const source = await prisma.source.findFirst({
      where: { id: sourceId, organizationId: input.organizationId, isActive: true },
      select: { id: true },
    });
    if (!source) throw new HttpError(404, "SOURCE_NOT_FOUND", "Source not found.");
  } else {
    const source = await prisma.source.upsert({
      where: {
        organizationId_type_name: {
          organizationId: input.organizationId,
          type: "MANUAL",
          name: "Manual entry",
        },
      },
      create: { organizationId: input.organizationId, type: "MANUAL", name: "Manual entry" },
      update: { isActive: true },
      select: { id: true },
    });
    sourceId = source.id;
  }

  const contentHash = createHash("sha256").update(input.originalContent.normalize("NFKC").toLowerCase().replace(/\\s+/g, " ").trim()).digest("hex");
  const duplicate = await prisma.feedback.findFirst({ where: { organizationId: input.organizationId, contentHash }, orderBy: { createdAt: "asc" }, select: { id: true } });

  const feedback = await prisma.feedback.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      sourceId,
      createdByUserId: req.userId!,
      assignedToUserId: membership.role === "MEMBER" ? req.userId! : input.assignedToUserId ?? null,
      originalContent: input.originalContent,
      contentHash,
      duplicateOfId: duplicate?.id ?? null,
      sourceUrl: input.sourceUrl,
      authorDisplayName: input.authorDisplayName,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
      ...(input.topicIds?.length ? { topicAssignments: { create: input.topicIds.map((topicId) => ({ topicId, origin: "HUMAN" as const })) } } : {}),
    },
    include: feedbackInclude,
  });

  return res.status(201).json(feedback);
});

router.get("/:feedbackId", async (req, res) => {
  const { feedback } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  const result = await prisma.feedback.findUnique({
    where: { id: feedback.id },
    include: { ...feedbackInclude, notes: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } } },
  });
  return res.json(result);
});

router.patch("/:feedbackId", async (req, res) => {
  const { feedback, membership } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  if (!permissions.manageFeedback(membership.role, feedback.assignedToUserId, req.userId!)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to update feedback.");
  }
  const input = updateSchema.parse(req.body);

  if (membership.role === "MEMBER" && input.assignedToUserId !== undefined) {
    throw new HttpError(403, "FORBIDDEN", "Members cannot reassign feedback.");
  }

  if (input.assignedToUserId) {
    const assignee = await getMembership(input.assignedToUserId, feedback.organizationId);
    if (!assignee) throw new HttpError(400, "INVALID_ASSIGNEE", "The assigned user is not an active member of this organization.");
  }

  const updated = await prisma.feedback.update({
    where: { id: feedback.id },
    data: {
      ...(input.sourceUrl !== undefined ? { sourceUrl: input.sourceUrl || null } : {}),
      ...(input.authorDisplayName !== undefined ? { authorDisplayName: input.authorDisplayName } : {}),
      ...(input.publishedAt !== undefined ? { publishedAt: input.publishedAt ? new Date(input.publishedAt) : null } : {}),
      ...(input.assignedToUserId !== undefined ? { assignedToUserId: input.assignedToUserId } : {}),
    },
    include: feedbackInclude,
  });
  return res.json(updated);
});

router.post("/:feedbackId/archive", async (req, res) => {
  const { feedback, membership } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  if (!permissions.manageFeedback(membership.role, feedback.assignedToUserId, req.userId!)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to archive feedback.");
  }
  const updated = await prisma.feedback.update({
    where: { id: feedback.id },
    data: { status: "ARCHIVED", archivedAt: new Date() },
    select: { id: true, status: true, archivedAt: true },
  });
  return res.json(updated);
});

router.post("/:feedbackId/restore", async (req, res) => {
  const { feedback, membership } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  if (!permissions.manageFeedback(membership.role, feedback.assignedToUserId, req.userId!)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to restore feedback.");
  }
  const updated = await prisma.feedback.update({
    where: { id: feedback.id },
    data: { status: "ACTIVE", archivedAt: null },
    select: { id: true, status: true, archivedAt: true },
  });
  return res.json(updated);
});


router.delete("/:feedbackId", async (req, res) => {
  const { feedback, membership } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    throw new HttpError(403, "FORBIDDEN", "Only organization owners and admins can permanently delete feedback.");
  }
  await prisma.feedback.delete({ where: { id: feedback.id } });
  return res.status(204).send();
});

router.get("/:feedbackId/notes", async (req, res) => {
  const { feedback } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  const notes = await prisma.feedbackNote.findMany({
    where: { organizationId: feedback.organizationId, feedbackId: feedback.id },
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return res.json(notes);
});

router.post("/:feedbackId/notes", async (req, res) => {
  const { feedback, membership } = await getFeedbackAccess(req.userId!, req.params.feedbackId);
  if (!permissions.manageFeedback(membership.role, feedback.assignedToUserId, req.userId!)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to add feedback notes.");
  }
  const input = z.object({ body: z.string().trim().min(1).max(5_000) }).strict().parse(req.body);
  const note = await prisma.feedbackNote.create({
    data: {
      organizationId: feedback.organizationId,
      feedbackId: feedback.id,
      userId: req.userId!,
      body: input.body,
    },
    include: { user: { select: { id: true, name: true } } },
  });
  return res.status(201).json(note);
});

export default router;
