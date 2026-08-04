import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev = process.env.NODE_ENV === "development";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  // SAMEORIGIN in development so local shell-qa iframes can exercise breakpoints.
  { key: "X-Frame-Options", value: isDev ? "SAMEORIGIN" : "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  // Effective only when served over HTTPS (production).
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Avoid picking a parent folder lockfile as the workspace root
  outputFileTracingRoot: path.join(__dirname),
  // Keep native/binary packages out of the webpack bundle so paths stay real.
  serverExternalPackages: ["ffmpeg-static", "sharp"],
  // Do not advertise the Next.js stack in responses.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
