import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { permissions } from "../lib/permissions.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const router = Router();
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
}).strict();

const updateSchema = z.object({
  sourceUrl: z.union([z.string().url().max(2048), z.literal("")]).nullable().optional(),
  authorDisplayName: z.string().trim().max(160).nullable().optional(),
  publishedAt: z.string().datetime().nullable().optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one editable field must be provided.",
});

router.get("/", async (req, res) => {
  const query = z.object({
    organizationId: z.string().uuid(),
    brandId: z.string().uuid().optional(),
    sourceId: z.string().uuid().optional(),
    topicId: z.string().uuid().optional(),
    sentiment: z.enum(["POSITIVE", "NEGATIVE", "NEUTRAL", "UNKNOWN"]).optional(),
    status: z.enum(["ACTIVE", "ARCHIVED"]).default("ACTIVE"),
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
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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

  const feedback = await prisma.feedback.create({
    data: {
      organizationId: input.organizationId,
      brandId: input.brandId,
      sourceId,
      createdByUserId: req.userId!,
      assignedToUserId: membership.role === "MEMBER" ? req.userId! : input.assignedToUserId ?? null,
      originalContent: input.originalContent,
      sourceUrl: input.sourceUrl,
      authorDisplayName: input.authorDisplayName,
      publishedAt: input.publishedAt ? new Date(input.publishedAt) : null,
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
