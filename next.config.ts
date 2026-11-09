import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

/**
 * Content-Security-Policy WITHOUT nonces (the Next.js docs' "Without Nonces"
 * policy), so pages keep their prerendered static shells (Cache Components).
 *
 * Trade-off, verified by e2e/security.spec.ts: Next.js streams page data in
 * inline <script> tags, so script-src needs 'unsafe-inline'. Nonces would
 * remove that but force every page to render per request. The experimental
 * SRI option was tried and is not applied in Turbopack builds.
 * Everything else stays strict: no third-party scripts, no eval in production,
 * no plugins, no framing, no <base> hijack, forms only to us and Stripe.
 * The codebase never renders raw HTML (no dangerouslySetInnerHTML), and React
 * escapes all output, which is what makes inline scripts unexploitable here.
 * form-action allows Stripe because the checkout redirect follows a form POST.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Docker builds set BUILD_STANDALONE=1 for a minimal server bundle.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  experimental: {
    // Document uploads go through a Server Action: 10 MB files + multipart overhead.
    serverActions: { bodySizeLimit: "11mb" },
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
