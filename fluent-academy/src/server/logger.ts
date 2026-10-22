import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function threshold(): number {
  const lvl = (process.env.LOG_LEVEL as Level) || (process.env.NODE_ENV === "test" ? "warn" : "info");
  return order[lvl] ?? order.info;
}

const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|api[-_]?key/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function write(level: Level, source: string, message: string, context?: Record<string, unknown>) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    source,
    msg: message,
    ...(context ? { ctx: redact(context) } : {}),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);

  // Persist warnings and errors so administrators can see them in /admin/events.
  if (level === "warn" || level === "error") {
    void persist(level, source, message, context);
  }
}

async function persist(level: Level, source: string, message: string, context?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && !process.env.PERSIST_TEST_EVENTS) return;
  try {
    const { db } = await import("./db");
    await db.systemEvent.create({
      data: {
        level,
        source,
        message: message.slice(0, 2000),
        context: (redact(context ?? {}) as object) ?? {},
        requestId: typeof context?.requestId === "string" ? context.requestId : null,
      },
    });
  } catch {
    // Never let logging failures cascade.
  }
}

export function logger(source: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", source, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => write("info", source, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", source, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write("error", source, msg, ctx),
  };
}
