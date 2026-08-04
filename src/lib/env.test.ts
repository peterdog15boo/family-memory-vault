import { afterEach, describe, expect, it, vi } from "vitest";

describe("assertProductionEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("no-ops outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { assertProductionEnv } = await import("@/lib/env");
    expect(() => assertProductionEnv()).not.toThrow();
  });

  it("throws when required production vars are missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("R2_ACCESS_KEY_ID", "");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "");
    vi.stubEnv("R2_BUCKET_NAME", "");
    vi.stubEnv("WORKER_SECRET", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");

    const { assertProductionEnv } = await import("@/lib/env");
    expect(() => assertProductionEnv()).toThrow(/Production environment invalid/);
  });

  it("rejects http app URL and insecure TLS in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_x");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_x");
    vi.stubEnv("DATABASE_URL", "postgres://x");
    vi.stubEnv("R2_ACCESS_KEY_ID", "x");
    vi.stubEnv("R2_SECRET_ACCESS_KEY", "x");
    vi.stubEnv("R2_BUCKET_NAME", "bucket");
    vi.stubEnv("R2_ACCOUNT_ID", "acct");
    vi.stubEnv("WORKER_SECRET", "secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://insecure.example");
    vi.stubEnv("ALLOW_INSECURE_TLS", "true");

    const { assertProductionEnv } = await import("@/lib/env");
    expect(() => assertProductionEnv()).toThrow(/https:\/\//);
  });
});
