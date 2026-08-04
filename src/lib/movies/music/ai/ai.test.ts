import { describe, expect, it } from "vitest";
import {
  buildAiSoundtrackLabel,
  buildAiSoundtrackPrompt,
} from "@/lib/movies/music/ai/prompt";
import { clampAiSoundtrackDurationMs } from "@/lib/movies/music/ai/generate";
import {
  getMusicGenerationProvider,
  listMusicGenerationProviders,
} from "@/lib/movies/music/ai/registry";
import { getCatalogPlan } from "@/lib/plans/catalog";
import { normalizeMovieSettings } from "@/lib/movies/settings";

describe("AI soundtrack prompt", () => {
  it("builds an instrumental family-movie prompt from theme", () => {
    const prompt = buildAiSoundtrackPrompt({
      themeId: "cinematic",
      userPrompt: "warm family piano",
    });
    expect(prompt.toLowerCase()).toContain("instrumental");
    expect(prompt.toLowerCase()).toContain("no vocals");
    expect(prompt).toContain("warm family piano");
    expect(prompt.toLowerCase()).toMatch(/cinematic|strings|memorial/);
  });

  it("labels tracks as AI-generated", () => {
    expect(buildAiSoundtrackLabel(null)).toBe("AI-generated soundtrack");
    expect(buildAiSoundtrackLabel("soft holiday")).toContain(
      "AI-generated soundtrack",
    );
    expect(buildAiSoundtrackLabel("soft holiday")).toContain("soft holiday");
  });
});

describe("AI soundtrack duration clamp", () => {
  it("clamps short and long requests", () => {
    expect(clampAiSoundtrackDurationMs(5)).toBeGreaterThanOrEqual(10_000);
    expect(clampAiSoundtrackDurationMs(45)).toBe(45_000);
    expect(clampAiSoundtrackDurationMs(9999)).toBeLessThanOrEqual(600_000);
  });
});

describe("music generation registry", () => {
  it("lists swappable providers including ElevenLabs and Suno stub", () => {
    const ids = listMusicGenerationProviders().map((p) => p.id);
    expect(ids).toContain("elevenlabs");
    expect(ids).toContain("suno_partner");
  });

  it("resolves elevenlabs by id", () => {
    expect(getMusicGenerationProvider("elevenlabs").displayName).toMatch(
      /ElevenLabs/,
    );
  });
});

describe("plan catalog AI soundtrack flags", () => {
  it("gates Free off and Family on", () => {
    expect(getCatalogPlan("free").features.aiSoundtrack).toBe(false);
    expect(getCatalogPlan("family").features.aiSoundtrack).toBe(true);
    expect(getCatalogPlan("family").features.maxAiSoundtracksPerMonth).toBe(5);
    expect(
      getCatalogPlan("family_plus").features.maxAiSoundtracksPerMonth,
    ).toBe(25);
  });
});

describe("movie settings AI flags", () => {
  it("normalizes musicAiGenerated on uploads", () => {
    const n = normalizeMovieSettings({
      musicSource: "upload",
      musicUploadKey: "movies/u/music/x.mp3",
      musicLabel: "AI-generated soundtrack · warm piano",
      musicAiGenerated: true,
      musicAiProvider: "elevenlabs",
    });
    expect(n.musicAiGenerated).toBe(true);
    expect(n.musicAiProvider).toBe("elevenlabs");
    expect(n.musicSource).toBe("upload");
  });
});
