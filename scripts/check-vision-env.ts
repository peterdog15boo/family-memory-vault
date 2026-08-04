/**
 * Print which vision-related env vars are configured (no secret values).
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

const keys = [
  "OPENAI_API_KEY",
  "OPENAI_BASE_URL",
  "AI_VISION_MODEL",
  "AI_GATEWAY_API_KEY",
  "NEON_AI_API_KEY",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_REGION",
  "REKOGNITION_ACCESS_KEY_ID",
  "REKOGNITION_SECRET_ACCESS_KEY",
  "REKOGNITION_REGION",
  "SCENE_ANALYSIS_ENABLED",
  "DATABASE_URL",
  "WORKER_SECRET",
] as const;

for (const key of keys) {
  const raw = process.env[key];
  const v = raw?.trim() ?? "";
  if (!v) {
    console.log(`${key}: MISSING`);
    continue;
  }
  const redact =
    key.includes("KEY") ||
    key.includes("SECRET") ||
    key === "DATABASE_URL";
  console.log(redact ? `${key}: set (${v.length} chars)` : `${key}: ${v}`);
}
