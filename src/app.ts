import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { requestId } from "./middleware/request-id.js";
import { errorHandler, notFound } from "./middleware/errors.js";
import authRoutes from "./routes/auth.js";
import organizationRoutes from "./routes/organizations.js";
import brandRoutes from "./routes/brands.js";
import feedbackRoutes from "./routes/feedback.js";
import topicRoutes from "./routes/topics.js";
import sourceRoutes from "./routes/sources.js";

export const app = express();

app.disable("x-powered-by");
app.use(requestId);
app.use(helmet());
app.use(cors({
  origin: env.WEB_ORIGIN.split(",").map((origin) => origin.trim()),
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => res.status(200).json({
  status: "ok",
  service: "signalnest-api",
  timestamp: new Date().toISOString(),
}));

app.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return res.status(200).json({ status: "ready", requestId: req.requestId });
  } catch (error) {
    logger.error("Readiness check failed", { requestId: req.requestId, error: error instanceof Error ? error.message : String(error) });
    return res.status(503).json({ status: "not_ready", requestId: req.requestId });
  }
});

app.use("/api/v1", rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
}));

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/organizations", organizationRoutes);
app.use("/api/v1/brands", brandRoutes);
app.use("/api/v1/feedback", feedbackRoutes);
app.use("/api/v1/topics", topicRoutes);
app.use("/api/v1/sources", sourceRoutes);

app.use(notFound);
app.use(errorHandler);
