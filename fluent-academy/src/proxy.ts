import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route protection: signed-out visitors are sent to /login before a
 * protected page renders. The authoritative session check happens on the server
 * in every protected layout and API route (src/server/auth/current.ts).
 */
const PROTECTED = [
  "/dashboard",
  "/learn",
  "/review",
  "/vocabulary",
  "/reading",
  "/listening",
  "/coach",
  "/speaking",
  "/progress",
  "/assessments",
  "/achievements",
  "/settings",
  "/billing",
  "/onboarding",
  "/admin",
];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isProtected && !request.cookies.get("fa_session")?.value) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  const res = NextResponse.next({ request: { headers } });
  res.headers.set("x-request-id", requestId);
  if (isProtected) res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|audio/|icon.svg|favicon.ico).*)"],
};
