import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { emailDeliveryMode, env } from "./env";
import { logger } from "./logger";

const log = logger("email");

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const DEV_MAILBOX = path.resolve(process.cwd(), "storage/dev-mailbox");

/**
 * Sends transactional email through SMTP when SMTP_URL is configured.
 * In development without SMTP, messages are written to storage/dev-mailbox and
 * listed at /dev/mailbox so flows like password recovery can be tested locally.
 * In production without SMTP, sending fails loudly instead of silently dropping mail.
 */
export async function sendEmail(msg: OutgoingEmail): Promise<{ delivered: boolean; mode: string }> {
  const mode = emailDeliveryMode();
  if (mode === "smtp") {
    const transport = nodemailer.createTransport(env().SMTP_URL!);
    await transport.sendMail({ from: env().EMAIL_FROM, ...msg });
    return { delivered: true, mode };
  }
  if (mode === "dev-log") {
    await fs.mkdir(DEV_MAILBOX, { recursive: true });
    const file = path.join(DEV_MAILBOX, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`);
    await fs.writeFile(file, JSON.stringify({ ...msg, sentAt: new Date().toISOString() }, null, 2));
    log.info("Development email written to storage/dev-mailbox (no SMTP configured)", { to: msg.to, subject: msg.subject });
    return { delivered: true, mode };
  }
  log.error("Email delivery is not configured (SMTP_URL missing)", { subject: msg.subject });
  return { delivered: false, mode };
}

export async function readDevMailbox(limit = 20) {
  try {
    const files = (await fs.readdir(DEV_MAILBOX)).filter((f) => f.endsWith(".json")).sort().reverse().slice(0, limit);
    return Promise.all(
      files.map(async (f) => JSON.parse(await fs.readFile(path.join(DEV_MAILBOX, f), "utf8")) as OutgoingEmail & { sentAt: string }),
    );
  } catch {
    return [];
  }
}
