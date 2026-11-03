import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { env } from "../env";

/** 256-bit random token encoded for URLs and cookies. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Tokens are stored only as SHA-256 digests, so a database leak does not expose live sessions. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Keyed hash for IP addresses so we can rate-limit and audit without storing raw IPs. */
export function hashIp(ip: string): string {
  const secret = env().APP_SECRET ?? "fluent-academy-development-secret";
  return createHmac("sha256", secret).update(ip).digest("hex").slice(0, 32);
}
