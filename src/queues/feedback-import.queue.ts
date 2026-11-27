import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../config/env.js";

let queueInstance: Queue | null = null;
let queueConnection: Redis | null = null;

export function getFeedbackImportQueue() {
  if (!queueInstance) {
    queueConnection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queueInstance = new Queue("feedback-imports", { connection: queueConnection });
  }
  return queueInstance;
}

export async function closeFeedbackImportQueue() {
  if (queueInstance) await queueInstance.close();
  queueInstance = null;
  if (queueConnection && queueConnection.status !== "end") {
    await queueConnection.quit().catch(() => undefined);
  }
  queueConnection = null;
}
