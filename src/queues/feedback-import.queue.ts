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
  const queue = queueInstance;
  const connection = queueConnection;
  queueInstance = null;
  queueConnection = null;

  if (connection && connection.status !== "end") connection.disconnect();
  if (queue) await queue.close().catch(() => undefined);
}
