import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { logIn, requestPasswordReset, resetPassword, signUp } from "@/server/auth/service";
import { validateSessionToken } from "@/server/auth/session";
import { hashToken } from "@/server/auth/tokens";
import { readDevMailbox } from "@/server/email";
import { meta } from "../helpers";

const email = () => `auth-${crypto.randomUUID()}@example.com`;
const password = "correct horse battery staple";

describe("accounts and sessions", () => {
  it("stores an Argon2id hash, never the password", async () => {
    const e = email();
    const { user } = await signUp({ name: "Ada", email: e, password }, meta());
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(row.passwordHash).not.toContain(password);
  });

  it("rejects weak and common passwords and duplicate emails", async () => {
    await expect(signUp({ name: "A", email: email(), password: "short" }, meta())).rejects.toMatchObject({ status: 422 });
    await expect(signUp({ name: "A", email: email(), password: "password1234" }, meta())).rejects.toMatchObject({ status: 422 });
    const e = email();
    await signUp({ name: "A", email: e, password }, meta());
    await expect(signUp({ name: "A", email: e.toUpperCase(), password }, meta())).rejects.toMatchObject({ status: 409 });
  });

  it("logs in with the right password only, with the same error for unknown accounts", async () => {
    const e = email();
    await signUp({ name: "A", email: e, password }, meta());
    const ok = await logIn({ email: e, password }, meta());
    expect(ok.session.token).toBeTruthy();
    const wrong = await logIn({ email: e, password: "not the password at all" }, meta()).catch((err) => err);
    const unknown = await logIn({ email: email(), password }, meta()).catch((err) => err);
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.message).toBe(unknown.message);
  });

  it("stores only a hash of the session token and resolves the session from the raw token", async () => {
    const { user, session } = await signUp({ name: "A", email: email(), password }, meta());
    const rows = await db.session.findMany({ where: { userId: user.id } });
    expect(rows.some((r) => r.tokenHash === session.token)).toBe(false);
    expect(rows.some((r) => r.tokenHash === hashToken(session.token))).toBe(true);
    expect((await validateSessionToken(session.token))?.id).toBe(user.id);
    expect(await validateSessionToken("forged-token")).toBeNull();
  });

  it("resets a password with a single-use emailed token and signs out other sessions", async () => {
    const e = email();
    const { user, session } = await signUp({ name: "A", email: e, password }, meta());
    await expect(requestPasswordReset(email(), meta())).resolves.toEqual({ sent: true }); // unknown email: same answer
    await requestPasswordReset(e, meta());
    const mail = (await readDevMailbox(50)).find((m) => m.to === e);
    const token = decodeURIComponent(mail!.text.match(/token=([^\s]+)/)![1]!);
    await resetPassword({ token, password: "a brand new passphrase" }, meta());
    expect(await validateSessionToken(session.token)).toBeNull();
    await expect(resetPassword({ token, password: "another new passphrase" }, meta())).rejects.toMatchObject({ status: 400 });
    await expect(logIn({ email: e, password: "a brand new passphrase" }, meta())).resolves.toMatchObject({ user: { id: user.id } });
  });
});
