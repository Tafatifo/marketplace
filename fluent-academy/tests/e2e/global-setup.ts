/**
 * Warms up routes so the development server's on-demand compilation doesn't
 * cause navigation timeouts in the first tests. Harmless against a production build.
 */
export default async function globalSetup() {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  for (const path of ["/", "/signup", "/login", "/onboarding", "/dashboard", "/learn", "/learn/fr-a1-u01-l01", "/coach", "/vocabulary", "/progress", "/settings", "/admin", "/pricing", "/languages"]) {
    await fetch(base + path, { redirect: "manual" }).catch(() => {});
  }
}
