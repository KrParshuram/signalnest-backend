import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res) => {
  const organizationId = z.string().uuid().parse(req.query.organizationId);
  const membership = await prisma.organizationMember.findFirst({
    where: { userId: req.userId!, organizationId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!membership) throw new HttpError(404, "ORGANIZATION_NOT_FOUND", "Organization not found.");

  const sources = await prisma.source.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "desc" }, { name: "asc" }],
    include: { _count: { select: { feedback: true } } },
  });
  return res.json(sources);
});

export default router;
