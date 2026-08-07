/**
 * Set R2 bucket CORS for browser uploads (desktop + phone on LAN).
 * Usage: npx tsx scripts/setup-r2-cors.ts
 *
 * Origins come from:
 * - built-in localhost ports
 * - NEXT_PUBLIC_APP_URL / APP_URL
 * - ALLOWED_BROWSER_ORIGINS / R2_CORS_ORIGINS (comma-separated)
 * - this machine's LAN IPv4 on port 3000 (for iPhone testing)
 */
import { networkInterfaces } from "node:os";
import { config } from "dotenv";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

config({ path: ".env.local", override: true });

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function lanOrigins(port = 3000): string[] {
  const out: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      out.push(`http://${entry.address}:${port}`);
    }
  }
  return out;
}

function collectOrigins(): string[] {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3002",
    // Production app hosts (browser PUTs to R2 need these).
    "https://www.familymemoryvault.ai",
    "https://familymemoryvault.ai",
  ]);

  for (const envName of [
    "NEXT_PUBLIC_APP_URL",
    "APP_URL",
    "ALLOWED_BROWSER_ORIGINS",
    "R2_CORS_ORIGINS",
  ] as const) {
    const raw = process.env[envName]?.trim();
    if (!raw) continue;
    for (const part of raw.split(",")) {
      const origin = normalizeOrigin(part);
      if (origin) origins.add(origin);
    }
  }

  for (const origin of lanOrigins(3000)) {
    origins.add(origin);
  }

  // Explicit CLI extras: npx tsx scripts/setup-r2-cors.ts http://192.168.1.10:3000
  for (const arg of process.argv.slice(2)) {
    const origin = normalizeOrigin(arg);
    if (origin) origins.add(origin);
  }

  return [...origins].sort();
}

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!accessKeyId || !secretAccessKey || !bucket || !endpoint) {
    throw new Error("Missing R2 env vars in .env.local");
  }

  const allowedOrigins = collectOrigins();
  const client = new S3Client({
    region: process.env.R2_REGION || "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });

  try {
    const existing = await client.send(
      new GetBucketCorsCommand({ Bucket: bucket }),
    );
    console.log("Previous CORS rules:", JSON.stringify(existing.CORSRules, null, 2));
  } catch {
    console.log("No existing CORS rules (or unable to read).");
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: ["GET", "PUT", "HEAD"],
            AllowedHeaders: ["*"],
            ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
            MaxAgeSeconds: 3600,
          },
        ],
      },
    }),
  );

  console.log(`CORS configured on bucket "${bucket}". AllowedOrigins:`);
  for (const origin of allowedOrigins) {
    console.log(`  - ${origin}`);
  }
}

main().catch((error) => {
  console.error("Failed to set CORS:", error);
  const code =
    error && typeof error === "object" && "Code" in error
      ? String((error as { Code?: string }).Code)
      : "";
  if (code === "AccessDenied" || /Access Denied/i.test(String(error))) {
    console.error(`
Object API tokens often cannot change bucket CORS.

Fix via Cloudflare dashboard instead:
  1. https://dash.cloudflare.com → R2 → bucket "family-memory-vault" → Settings
  2. CORS Policy → Add CORS policy → JSON tab
  3. Paste scripts/r2-cors-production.json and Save

Or create an API token with Account → Workers R2 Storage → Edit, then:
  npx wrangler r2 bucket cors set family-memory-vault --file scripts/r2-cors-production.json
`);
  }
  process.exit(1);
});
