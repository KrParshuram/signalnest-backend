import { Router } from "express";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth);

const createSchema = z.object({
  name: z.string().trim().min(2).max(100),
  defaultCurrency: z.string().length(3).default("USD"),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  initialBrand: z.object({
    name: z.string().trim().min(2).max(100),
    websiteUrl: z.string().url().optional(),
    industry: z.string().trim().max(80).optional(),
    description: z.string().trim().max(500).optional(),
  }).strict().optional(),
}).strict();

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "workspace";
}

router.get("/", async (req, res) => {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: req.userId!, status: "ACTIVE" },
    select: {
      role: true, status: true,
      organization: { include: { _count: { select: { members: true, brands: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
  return res.json(memberships.map(({ organization, role, status }) => ({ ...organization, role, memberStatus: status })));
});

router.post("/", async (req, res) => {
  const input = createSchema.parse(req.body);
  const slug = `${slugify(input.name)}-${randomBytes(3).toString("hex")}`;
  const organization = await prisma.organization.create({
    data: {
      name: input.name,
      slug,
      defaultCurrency: input.defaultCurrency.toUpperCase(),
      timezone: input.timezone,
      members: { create: { userId: req.userId!, role: "OWNER", status: "ACTIVE" } },
      ...(input.initialBrand ? {
        brands: {
          create: {
            name: input.initialBrand.name,
            websiteUrl: input.initialBrand.websiteUrl,
            industry: input.initialBrand.industry,
            description: input.initialBrand.description,
          },
        },
      } : {}),
    },
    include: { brands: true },
  });
  return res.status(201).json(organization);
});

router.get("/:organizationId", async (req, res) => {
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: req.userId!, organizationId: req.params.organizationId, status: "ACTIVE" },
    select: { role: true, organization: true },
  });
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");
  return res.json({ ...membership.organization, role: membership.role });
});

export default router;
