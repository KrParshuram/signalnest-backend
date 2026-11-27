import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
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

router.get("/", async (req, res) => {
  const organizationId = z.string().uuid().parse(req.query.organizationId);
  if (!(await getMembership(req.userId!, organizationId))) {
    throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  }
  const brands = await prisma.brand.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });
  return res.json(brands);
});

router.post("/", async (req, res) => {
  const input = z.object({
    organizationId: z.string().uuid(),
    name: z.string().trim().min(2).max(100),
    websiteUrl: z.union([z.string().url(), z.literal("")]).optional(),
    industry: z.string().trim().max(80).optional(),
    description: z.string().trim().max(500).optional(),
  }).strict().parse(req.body);

  const membership = await getMembership(req.userId!, input.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (membership.role === "VIEWER") throw new HttpError(403, "FORBIDDEN", "You do not have permission to create brands.");

  const brand = await prisma.brand.create({
    data: {
      organizationId: input.organizationId,
      name: input.name,
      websiteUrl: input.websiteUrl || null,
      industry: input.industry,
      description: input.description,
    },
  });
  return res.status(201).json(brand);
});

export default router;
