import "dotenv/config";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";
import { processFeedbackImport } from "./services/feedback-import.service.js";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<{ importJobId: string }>(
  "feedback-imports",
  async (job) => processFeedbackImport(job.data.importJobId),
  { connection, concurrency: 3 },
);

worker.on("completed", (job, result) => {
  logger.info("Feedback import completed", { jobId: job.id, result });
});
worker.on("failed", (job, error) => {
  logger.error("Feedback import failed", { jobId: job?.id, error: error.message });
});

async function shutdown(signal: string) {
  logger.info("Feedback worker shutting down", { signal });
  await worker.close();
  await connection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

logger.info("Signalnest feedback import worker started");
