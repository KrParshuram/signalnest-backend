import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../lib/tokens.js";

declare global {
  namespace Express {
    interface Request { userId?: string }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required.", requestId: req.requestId } });
  }

  try {
    req.userId = verifyAccessToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "The access token is invalid or expired.", requestId: req.requestId } });
  }
}
