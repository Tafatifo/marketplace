import "server-only";
import { NextResponse } from "next/server";
import { z, type ZodType } from "zod";
import { env } from "./env";
import { logger } from "./logger";

const log = logger("http");

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, "bad_request", message, details);
export const unauthorized = (message = "Please sign in to continue.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You do not have access to this resource.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (message: string) => new HttpError(409, "conflict", message);
export const tooMany = (message: string, retryAfter?: number) =>
  new HttpError(429, "rate_limited", message, retryAfter ? { retryAfter } : undefined);
export const paymentRequired = (message: string, details?: unknown) =>
  new HttpError(402, "upgrade_required", message, details);

export function json<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** Parse and validate a JSON request body. Rejects oversized bodies. */
export async function parseJson<S extends ZodType>(req: Request, schema: S, maxBytes = 64 * 1024): Promise<z.infer<S>> {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > maxBytes) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  let raw: unknown;
  try {
    const text = await req.text();
    if (text.length > maxBytes) throw new HttpError(413, "payload_too_large", "Request body is too large.");
    raw = text ? JSON.parse(text) : {};
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw badRequest("Request body must be valid JSON.");
  }
  return validate(schema, raw);
}

export function validate<S extends ZodType>(schema: S, value: unknown): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(
      422,
      "validation_failed",
      "Some fields are invalid.",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }
  return result.data;
}

/**
 * Same-origin check for state-changing requests. Session cookies are
 * SameSite=Lax, and this additionally rejects cross-site form posts and fetches.
 */
export function assertSameOrigin(req: Request) {
  const method = req.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (curl, tests) do not send Origin; browsers always do for fetch/POST.
    const fetchSite = req.headers.get("sec-fetch-site");
    if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
      throw forbidden("Cross-site request blocked.");
    }
    return;
  }
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(env().APP_URL).origin);
  } catch {}
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  if (!allowed.has(origin)) throw forbidden("Cross-site request blocked.");
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

/**
 * Wraps a route handler with origin checks and uniform error handling.
 * Unknown errors are logged with a request id and returned as a generic 500 so
 * internal details never leak to clients.
 */
export function route<C = unknown>(handler: Handler<C>, opts: { skipOriginCheck?: boolean } = {}): Handler<C> {
  return async (req, ctx) => {
    const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
    try {
      if (!opts.skipOriginCheck) assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err, requestId, req);
    }
  };
}

export function errorResponse(err: unknown, requestId: string, req?: Request) {
  if (err instanceof HttpError) {
    const headers: Record<string, string> = { "x-request-id": requestId };
    const retry = (err.details as { retryAfter?: number } | undefined)?.retryAfter;
    if (err.status === 429 && retry) headers["retry-after"] = String(retry);
    return NextResponse.json(
      { error: { code: err.code, message: err.message, details: err.details ?? null } },
      { status: err.status, headers },
    );
  }
  log.error("Unhandled route error", {
    requestId,
    path: req ? new URL(req.url).pathname : undefined,
    method: req?.method,
    error: err,
  });
  return NextResponse.json(
    { error: { code: "internal_error", message: "Something went wrong on our side. Please try again.", requestId } },
    { status: 500, headers: { "x-request-id": requestId } },
  );
}

/**
 * The client's IP for rate limiting. X-Forwarded-For is client-controlled except for the
 * entries appended by our own proxies, so only the entry added by the outermost trusted
 * proxy is used (TRUSTED_PROXY_HOPS, default 1). With 0 the header is ignored entirely —
 * use that when the app is exposed directly without a reverse proxy.
 */
export function clientIp(req: Request): string {
  const hops = env().TRUSTED_PROXY_HOPS;
  if (hops === 0) return "direct";
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const chain = fwd.split(",").map((s) => s.trim()).filter(Boolean);
    const ip = chain[Math.max(0, chain.length - hops)];
    if (ip) return ip;
  }
  return req.headers.get("x-real-ip") ?? "unknown";
}
