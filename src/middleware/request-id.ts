import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

declare global {
  namespace Express {
    interface Request { requestId: string }
  }
}

export function requestId(req: Request, res: Response, next: NextFunction) {
  const supplied = req.header("x-request-id");
  req.requestId = supplied && /^[a-zA-Z0-9._-]{1,100}$/.test(supplied) ? supplied : randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
