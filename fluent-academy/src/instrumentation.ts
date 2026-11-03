import type { Instrumentation } from "next";

export async function register() {
  // Nothing to initialise eagerly; the logger and database client are created lazily.
}

/** Records unhandled server errors (render, route handlers, server actions) in the event log. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { logger } = await import("./server/logger");
  const error = err as Error & { digest?: string };
  logger("next").error(error.message || "Unhandled request error", {
    digest: error.digest,
    path: request.path,
    method: request.method,
    routePath: context.routePath,
    routeType: context.routeType,
    requestId: (request.headers["x-request-id"] as string | undefined) ?? undefined,
  });
};
