import "dotenv/config";
import { env } from "./config/env.js";
import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { logger } from "./lib/logger.js";

const server = app.listen(env.PORT, () => {
  logger.info("Signalnest API listening", { port: env.PORT, environment: env.NODE_ENV });
});

async function shutdown(signal: string) {
  logger.info("Shutdown signal received", { signal });
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
