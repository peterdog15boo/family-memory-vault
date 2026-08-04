/**
 * Structured JSON logging for production observability.
 *
 * Logs are single-line JSON so log drains (Cloudflare, Vercel, Datadog, etc.)
 * can parse `event`, `level`, and domain fields without custom scrapers.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

const SENSITIVE_KEY =
  /^(password|secret|token|authorization|cookie|api[_-]?key|rawBody)$/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (value == null) return value;
  if (typeof value === "string") {
    // Avoid dumping long signed URLs / keys into logs.
    if (value.length > 500) return `${value.slice(0, 80)}…[truncated]`;
    return value;
  }
  if (typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY.test(key)) {
      out[key] = "[redacted]";
    } else {
      out[key] = redact(child, depth + 1);
    }
  }
  return out;
}

function emit(level: LogLevel, event: string, fields?: LogFields): void {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    env: process.env.NODE_ENV ?? "unknown",
    service: "family-memory-vault",
    ...(fields ? (redact(fields) as LogFields) : {}),
  };

  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") {
    if (process.env.LOG_LEVEL === "debug") console.debug(line);
  } else console.info(line);
}

export const logger = {
  debug: (event: string, fields?: LogFields) => emit("debug", event, fields),
  info: (event: string, fields?: LogFields) => emit("info", event, fields),
  warn: (event: string, fields?: LogFields) => emit("warn", event, fields),
  error: (event: string, fields?: LogFields) => emit("error", event, fields),
};

/** Normalize unknown errors for log fields. */
export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      ...(process.env.NODE_ENV !== "production" && error.stack
        ? { errorStack: error.stack.split("\n").slice(0, 8).join("\n") }
        : {}),
    };
  }
  return { errorMessage: String(error) };
}

/**
 * Time an async operation and emit success/failure logs.
 */
export async function withTiming<T>(
  event: string,
  fields: LogFields,
  fn: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info(event, {
      ...fields,
      ok: true,
      durationMs: Date.now() - started,
    });
    return result;
  } catch (error) {
    logger.error(event, {
      ...fields,
      ok: false,
      durationMs: Date.now() - started,
      ...errorFields(error),
    });
    throw error;
  }
}
