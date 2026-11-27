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

async function getAccessibleBrand(userId: string, brandId: string) {
  const brand = await prisma.brand.findUnique({ where: { id: brandId } });
  if (!brand) throw new HttpError(404, "BRAND_NOT_FOUND", "Brand not found.");
  const membership = await getMembership(userId, brand.organizationId);
  if (!membership) throw new HttpError(404, "BRAND_NOT_FOUND", "Brand not found.");
  return { brand, membership };
}

const createSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  websiteUrl: z.union([z.string().url(), z.literal("")]).optional(),
  industry: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
}).strict();

const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  websiteUrl: z.union([z.string().url(), z.literal("")]).optional(),
  industry: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one field must be provided.",
});

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
  const input = createSchema.parse(req.body);
  const membership = await getMembership(req.userId!, input.organizationId);
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  if (!permissions.manageBrands(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage brands.");
  }

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

router.get("/:brandId", async (req, res) => {
  const { brand } = await getAccessibleBrand(req.userId!, req.params.brandId);
  return res.json(brand);
});

router.patch("/:brandId", async (req, res) => {
  const { brand, membership } = await getAccessibleBrand(req.userId!, req.params.brandId);
  if (!permissions.manageBrands(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage brands.");
  }
  const input = updateSchema.parse(req.body);
  const updated = await prisma.brand.update({
    where: { id: brand.id },
    data: {
      ...input,
      ...(input.websiteUrl !== undefined ? { websiteUrl: input.websiteUrl || null } : {}),
    },
  });
  return res.json(updated);
});

router.delete("/:brandId", async (req, res) => {
  const { brand, membership } = await getAccessibleBrand(req.userId!, req.params.brandId);
  if (!permissions.manageBrands(membership.role)) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to manage brands.");
  }
  await prisma.brand.delete({ where: { id: brand.id } });
  return res.status(204).send();
});

export default router;
