import "server-only";
import { hash, verify } from "@node-rs/argon2";

// OWASP-recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 200;

const COMMON = new Set([
  "password", "password1", "password123", "1234567890", "12345678910", "qwertyuiop", "iloveyou12",
  "letmein123", "welcome123", "abcdefghij", "0123456789", "passw0rd12", "administrator", "fluentacademy",
]);

const COMMON_STEMS = new Set([
  "password", "passw0rd", "qwerty", "qwertyuiop", "azerty", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon",
  "football", "baseball", "sunshine", "princess", "abc", "abcdef", "abcdefgh", "trustno1", "changeme", "secret", "motdepasse",
  "contraseña", "contrasena", "passwort", "hallo", "bonjour", "hola", "fluent", "fluentacademy",
]);

export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters.`;
  const lower = password.toLowerCase();
  // Common passwords, including the usual "word + digits/symbols" variations (password1234, Qwerty123!).
  const stem = lower.replace(/[\d!@#$%^&*._-]+$/, "");
  if (COMMON.has(lower) || COMMON.has(stem) || COMMON_STEMS.has(stem) || /^\d+$/.test(password)) {
    return "This password is too common. Choose something less predictable.";
  }
  if (/^(.)\1+$/.test(password)) return "Avoid repeating a single character.";
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase()) && email.split("@")[0]!.length >= 4) {
    return "Avoid using your email name in your password.";
  }
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// A valid hash of a random string, used to equalise timing when an email is unknown.
let dummyHash: string | null = null;
export async function burnPasswordCheck(password: string) {
  dummyHash ??= await hash("fluent-academy-timing-equaliser", OPTIONS);
  await verifyPassword(dummyHash, password);
}
