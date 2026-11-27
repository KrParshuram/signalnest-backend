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
    select: { role: true },
  });
}

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 64) || "topic";
}

const createSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
}).strict();

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(300).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

router.get("/", async (req, res) => {
  const organizationId = z.string().uuid().parse(req.query.organizationId);
  if (!(await getMembership(req.userId!, organizationId))) {
    throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  const topics = await prisma.topic.findMany({
    where: { organizationId },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });
  return res.json(topics);
});

router.post("/", async (req, res) => {
  const input = createSchema.parse(req.body);
  const membership = await getMembership(req.userId!, input.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (!permissions.manageInsights(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage topics.");
  }

  try {
    const topic = await prisma.topic.create({
      data: {
        organizationId: input.organizationId,
        name: input.name,
        slug: slugify(input.name),
        description: input.description,
      },
    });
    return res.status(201).json(topic);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "TOPIC_ALREADY_EXISTS", "A topic with this name already exists.");
    }
    throw error;
  }
});

router.patch("/:topicId", async (req, res) => {
  const input = updateSchema.parse(req.body);
  const topic = await prisma.topic.findUnique({ where: { id: req.params.topicId } });
  if (!topic) throw new HttpError(404, "TOPIC_NOT_FOUND", "Topic not found.");
  const membership = await getMembership(req.userId!, topic.organizationId);
  if (!membership) throw new HttpError(404, "TOPIC_NOT_FOUND", "Topic not found.");
  if (!permissions.manageInsights(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage topics.");
  }

  try {
    const updated = await prisma.topic.update({
      where: { id: topic.id },
      data: {
        ...(input.name !== undefined ? { name: input.name, slug: slugify(input.name) } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return res.json(updated);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "TOPIC_ALREADY_EXISTS", "A topic with this name already exists.");
    }
    throw error;
  }
});

router.delete("/:topicId", async (req, res) => {
  const topic = await prisma.topic.findUnique({ where: { id: req.params.topicId } });
  if (!topic) throw new HttpError(404, "TOPIC_NOT_FOUND", "Topic not found.");
  const membership = await getMembership(req.userId!, topic.organizationId);
  if (!membership) throw new HttpError(404, "TOPIC_NOT_FOUND", "Topic not found.");
  if (!permissions.manageInsights(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage topics.");
  }
  await prisma.topic.delete({ where: { id: topic.id } });
  return res.status(204).send();
});

export default router;
