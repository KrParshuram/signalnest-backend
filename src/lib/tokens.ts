import crypto from "node:crypto";
import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export function createAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: "signalnest-api",
    audience: "signalnest-web",
  });
}

export function verifyAccessToken(token: string): string {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: "signalnest-api",
    audience: "signalnest-web",
  }) as jwt.JwtPayload;
  if (typeof payload.sub !== "string" || !payload.sub) throw new Error("Invalid access token.");
  return payload.sub;
}

export function createRefreshToken(userId: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  return { token, tokenHash, expiresAt, userId };
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
