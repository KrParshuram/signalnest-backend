import { env } from "../config/env.js";

type LogContext = Record<string, unknown>;

function write(level: "info" | "warn" | "error", message: string, context: LogContext = {}) {
  const record = { timestamp: new Date().toISOString(), level, message, ...context };
  const line = JSON.stringify(record);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (env.LOG_LEVEL === "debug" || env.LOG_LEVEL === "info") console.log(line);
}

export const logger = {
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
