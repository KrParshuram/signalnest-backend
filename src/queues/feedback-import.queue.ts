import { Queue } from "bullmq";
import IORedis from "ioredis";
import { env } from "../config/env.js";

let queueInstance: Queue | null = null;

export function getFeedbackImportQueue() {
  if (!queueInstance) {
    const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
    queueInstance = new Queue("feedback-imports", { connection });
  }
  return queueInstance;
}

export async function closeFeedbackImportQueue() {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
