import { afterEach, describe, expect, it, vi } from "vitest";
import {
  evaluateBrowserOrigin,
  isTrustedBrowserOrigin,
} from "@/lib/security/origin";

function makeRequest(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { method: "POST", headers });
}

describe("evaluateBrowserOrigin", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("trusts Origin that matches the request host (LAN iPhone case)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");

    const req = makeRequest("http://192.168.1.37:3000/api/upload-url", {
      Origin: "http://192.168.1.37:3000",
    });

    const decision = evaluateBrowserOrigin(req);
    expect(decision.trusted).toBe(true);
    expect(decision.reason).toBe("origin_matches_expected");
  });

  it("trusts Origin that matches NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vault.example.com");

    const req = makeRequest("https://vault.example.com/api/upload-url", {
      Origin: "https://vault.example.com",
    });

    expect(isTrustedBrowserOrigin(req)).toBe(true);
  });

  it("rejects mismatched Origin in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vault.example.com");

    const req = makeRequest("https://vault.example.com/api/upload-url", {
      Origin: "https://evil.example",
    });

    const decision = evaluateBrowserOrigin(req);
    expect(decision.trusted).toBe(false);
    expect(decision.reason).toBe("origin_mismatch");
  });

  it("allows ALLOWED_BROWSER_ORIGINS extras", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://vault.example.com");
    vi.stubEnv(
      "ALLOWED_BROWSER_ORIGINS",
      "https://preview.example.com, http://192.168.1.10:3000",
    );

    const req = makeRequest("https://vault.example.com/api/upload-url", {
      Origin: "http://192.168.1.10:3000",
    });

    expect(isTrustedBrowserOrigin(req)).toBe(true);
  });
});
