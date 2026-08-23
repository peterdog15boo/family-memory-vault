/**
 * Set R2 bucket CORS for browser uploads (desktop + phone on LAN).
 * Usage: npx tsx scripts/setup-r2-cors.ts
 *
 * Prefer Cloudflare API token (Account → Workers R2 Storage → Edit):
 *   CLOUDFLARE_API_TOKEN=… npx tsx scripts/setup-r2-cors.ts
 *
 * Falls back to S3 PutBucketCors with R2_ACCESS_KEY_ID (often AccessDenied
 * for object-only tokens).
 *
 * Origins come from:
 * - built-in localhost ports + production hosts
 * - NEXT_PUBLIC_APP_URL / APP_URL
 * - ALLOWED_BROWSER_ORIGINS / R2_CORS_ORIGINS (comma-separated)
 * - this machine's LAN IPv4 on port 3000 (for iPhone testing)
 * - CLI args: npx tsx scripts/setup-r2-cors.ts http://192.168.1.10:3000
 */
import { networkInterfaces } from "node:os";
import { config } from "dotenv";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

config({ path: ".env.local", override: true });

const ALLOWED_METHODS = ["GET", "PUT", "HEAD"] as const;
const ALLOWED_HEADERS = [
  "Content-Type",
  "Content-Length",
  "Content-MD5",
  "x-amz-content-sha256",
  "x-amz-checksum-crc32",
  "x-amz-sdk-checksum-algorithm",
  "*",
];
const EXPOSE_HEADERS = ["ETag", "Content-Length", "Content-Type"];
const MAX_AGE_SECONDS = 3600;

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

  for (const arg of process.argv.slice(2)) {
    const origin = normalizeOrigin(arg);
    if (origin) origins.add(origin);
  }

  return [...origins].sort();
}

async function putCorsViaCloudflareApi(
  accountId: string,
  bucket: string,
  allowedOrigins: string[],
): Promise<boolean> {
  const token =
    process.env.CLOUDFLARE_API_TOKEN?.trim() ||
    process.env.CF_API_TOKEN?.trim();
  if (!token) return false;

  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/cors`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        rules: [
          {
            id: "family-memory-vault-browser-uploads",
            allowed: {
              origins: allowedOrigins,
              methods: [...ALLOWED_METHODS],
              headers: ALLOWED_HEADERS,
            },
            exposeHeaders: EXPOSE_HEADERS,
            maxAgeSeconds: MAX_AGE_SECONDS,
          },
        ],
      }),
    },
  );
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    errors?: Array<{ message?: string }>;
  };
  if (!res.ok || !json.success) {
    const detail =
      json.errors?.map((e) => e.message).filter(Boolean).join("; ") ||
      `HTTP ${res.status}`;
    throw new Error(`Cloudflare API CORS update failed: ${detail}`);
  }
  console.log("Applied CORS via Cloudflare Management API.");
  return true;
}

async function putCorsViaS3(
  endpoint: string,
  bucket: string,
  allowedOrigins: string[],
): Promise<void> {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
  }

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
    console.log(
      "Previous CORS rules:",
      JSON.stringify(existing.CORSRules, null, 2),
    );
  } catch {
    console.log("No existing CORS rules (or unable to read via S3 API).");
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedOrigins: allowedOrigins,
            AllowedMethods: [...ALLOWED_METHODS],
            AllowedHeaders: ALLOWED_HEADERS,
            ExposeHeaders: EXPOSE_HEADERS,
            MaxAgeSeconds: MAX_AGE_SECONDS,
          },
        ],
      },
    }),
  );
  console.log("Applied CORS via S3 PutBucketCors.");
}

async function main() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET_NAME;
  const endpoint =
    process.env.R2_ENDPOINT ||
    (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);

  if (!bucket || !endpoint) {
    throw new Error("Missing R2_BUCKET_NAME / R2_ENDPOINT (or R2_ACCOUNT_ID)");
  }

  const allowedOrigins = collectOrigins();

  let applied = false;
  if (accountId) {
    try {
      applied = await putCorsViaCloudflareApi(
        accountId,
        bucket,
        allowedOrigins,
      );
    } catch (error) {
      console.warn(
        "Cloudflare API path failed; trying S3 PutBucketCors…",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!applied) {
    await putCorsViaS3(endpoint, bucket, allowedOrigins);
  }

  console.log(`CORS configured on bucket "${bucket}". AllowedOrigins:`);
  for (const origin of allowedOrigins) {
    console.log(`  - ${origin}`);
  }
  console.log(
    "\nBrowser uploads can PUT directly to R2 from those origins (GET/HEAD too).",
  );
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

Fix options:
  1. Set CLOUDFLARE_API_TOKEN (Account → Workers R2 Storage → Edit) and re-run:
       npx tsx scripts/setup-r2-cors.ts
  2. Dashboard: R2 → family-memory-vault → Settings → CORS Policy
       Paste scripts/r2-cors-production.json and Save
  3. Wrangler (after wrangler login):
       npx wrangler r2 bucket cors set family-memory-vault --file scripts/r2-cors-production.json
`);
  }
  process.exit(1);
});
