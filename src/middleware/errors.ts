import type { ErrorRequestHandler, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger.js";

export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string, public details?: unknown) {
    super(message);
    this.name = "HttpError";
  }
}

export function notFound(req: Request, res: Response) {
  return res.status(404).json({
    error: { code: "NOT_FOUND", message: "The requested resource was not found.", requestId: req.requestId },
  });
}

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  if (res.headersSent) return;

  if (error instanceof Error && error.name === "MulterError") {
    const code = "code" in error ? String(error.code) : "";
    const status = code === "LIMIT_FILE_SIZE" ? 413 : 400;
    return res.status(status).json({
      error: {
        code: code === "LIMIT_FILE_SIZE" ? "UPLOAD_TOO_LARGE" : "INVALID_UPLOAD",
        message: code === "LIMIT_FILE_SIZE" ? "The uploaded file exceeds the 5 MB limit." : "The uploaded file could not be processed.",
        requestId: req.requestId,
      },
    });
  }

  if (error instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed.",
        details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        requestId: req.requestId,
      },
    });
  }

  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}), requestId: req.requestId },
    });
  }

  logger.error("Unhandled request error", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    error: error instanceof Error ? error.message : String(error),
  });

  return res.status(500).json({
    error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred.", requestId: req.requestId },
  });
};
