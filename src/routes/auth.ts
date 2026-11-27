import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createAccessToken, createRefreshToken, hashToken } from "../lib/tokens.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errors.js";
import { env } from "../config/env.js";

const router = Router();
const cookieName = "signalnest_refresh";
const cookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/api/v1/auth",
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
};

const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const passwordSchema = z.string().min(10).max(128);

async function issueRefreshSession(userId: string, res: import("express").Response) {
  const refresh = createRefreshToken(userId);
  await prisma.refreshToken.create({
    data: { userId, tokenHash: refresh.tokenHash, expiresAt: refresh.expiresAt },
  });
  res.cookie(cookieName, refresh.token, cookieOptions);
}

router.post("/register", async (req, res) => {
  const input = z.object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    password: passwordSchema,
  }).strict().parse(req.body);

  const passwordHash = await bcrypt.hash(input.password, 12);
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash },
      select: { id: true, name: true, email: true, createdAt: true },
    });
    await issueRefreshSession(user.id, res);
    return res.status(201).json({ user, accessToken: createAccessToken(user.id) });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
      throw new HttpError(409, "EMAIL_ALREADY_REGISTERED", "An account with this email already exists.");
    }
    throw error;
  }
});

router.post("/login", async (req, res) => {
  const input = z.object({ email: emailSchema, password: passwordSchema }).strict().parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
    throw new HttpError(401, "INVALID_CREDENTIALS", "Email or password is incorrect.");
  }

  await issueRefreshSession(user.id, res);
  const memberships = await prisma.organizationMember.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: "asc" },
  });
  return res.json({
    user: { id: user.id, name: user.name, email: user.email },
    accessToken: createAccessToken(user.id),
    organizations: memberships.map(({ organization, role }) => ({ ...organization, role })),
  });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies?.[cookieName] as string | undefined;
  if (!token) throw new HttpError(401, "REFRESH_SESSION_MISSING", "Refresh session not found.");

  const tokenHash = hashToken(token);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt <= new Date()) {
    res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
    throw new HttpError(401, "REFRESH_SESSION_INVALID", "Refresh session is invalid or expired.");
  }

  const nextRefresh = createRefreshToken(stored.userId);
  await prisma.$transaction(async (tx) => {
    const revoked = await tx.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new HttpError(401, "REFRESH_SESSION_REUSED", "Refresh session is no longer valid.");
    await tx.refreshToken.create({
      data: { userId: stored.userId, tokenHash: nextRefresh.tokenHash, expiresAt: nextRefresh.expiresAt },
    });
  });

  res.cookie(cookieName, nextRefresh.token, cookieOptions);
  return res.json({ accessToken: createAccessToken(stored.userId) });
});

router.post("/logout", async (req, res) => {
  const token = req.cookies?.[cookieName] as string | undefined;
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  res.clearCookie(cookieName, { ...cookieOptions, maxAge: undefined });
  return res.status(204).send();
});

router.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: {
      id: true, name: true, email: true,
      memberships: {
        where: { status: "ACTIVE" },
        select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
      },
    },
  });
  if (!user) throw new HttpError(404, "USER_NOT_FOUND", "User not found.");
  return res.json({
    user: { id: user.id, name: user.name, email: user.email },
    organizations: user.memberships.map(({ organization, role }) => ({ ...organization, role })),
  });
});

export default router;
