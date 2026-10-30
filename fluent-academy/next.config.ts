import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy. Audio may be served from a CDN/object store when
// AUDIO_BASE_URL is configured, so its origin is allowed for media.
const audioOrigin = (() => {
  try {
    return process.env.AUDIO_BASE_URL ? new URL(process.env.AUDIO_BASE_URL).origin : "";
  } catch {
    return "";
  }
})();

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"} https://js.stripe.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `media-src 'self' blob: data: ${audioOrigin}`.trim(),
  "connect-src 'self' https://api.stripe.com",
  "frame-src https://js.stripe.com https://checkout.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Native/server-only packages that must not be bundled.
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client", "nodemailer"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Microphone is needed for speaking practice on our own origin only.
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
          ...(isProd
            ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
            : []),
        ],
      },
      {
        source: "/audio/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
