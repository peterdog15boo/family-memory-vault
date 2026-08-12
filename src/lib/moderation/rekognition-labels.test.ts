import { describe, expect, it } from "vitest";
import { scoreFromRekognitionLabels } from "@/lib/moderation/providers/ai-moderation";

describe("scoreFromRekognitionLabels", () => {
  it("does not treat swimwear or suggestive family photos as explicit nudity", () => {
    const result = scoreFromRekognitionLabels([
      { Name: "Female Swimwear Or Underwear", Confidence: 99 },
      { Name: "Suggestive", Confidence: 92 },
      { Name: "Barechested Male", Confidence: 88 },
      { Name: "Revealing Clothes", Confidence: 80 },
    ]);
    expect(result.nudityScore).toBe(0);
    expect(result.csamScore).toBe(0);
  });

  it("ignores Rekognition beach-wear taxonomy that used to auto-adult", () => {
    const result = scoreFromRekognitionLabels([
      { Name: "Swimwear or Underwear", ParentName: "", Confidence: 94.15 },
      {
        Name: "Female Swimwear or Underwear",
        ParentName: "Swimwear or Underwear",
        Confidence: 94.15,
      },
      {
        Name: "Non-Explicit Nudity of Intimate parts and Kissing",
        ParentName: "",
        Confidence: 90.57,
      },
      {
        Name: "Non-Explicit Nudity",
        ParentName: "Non-Explicit Nudity of Intimate parts and Kissing",
        Confidence: 90.57,
      },
      {
        Name: "Partially Exposed Female Breast",
        ParentName: "Non-Explicit Nudity",
        Confidence: 90.57,
      },
    ]);
    expect(result.nudityScore).toBe(0);
    expect(result.csamScore).toBe(0);
  });

  it("does not treat non-explicit nudity as explicit nudity", () => {
    const result = scoreFromRekognitionLabels([
      { Name: "Non-Explicit Nudity", Confidence: 95 },
    ]);
    expect(result.nudityScore).toBe(0);
  });

  it("still scores explicit sexual labels", () => {
    const result = scoreFromRekognitionLabels([
      { Name: "Explicit Nudity", Confidence: 91 },
      { Name: "Female Swimwear Or Underwear", Confidence: 99 },
    ]);
    expect(result.nudityScore).toBeCloseTo(0.91);
  });

  it("does not false-match short names like Male against barechested male", () => {
    const result = scoreFromRekognitionLabels([
      { Name: "Male", Confidence: 99 },
    ]);
    expect(result.nudityScore).toBe(0);
  });
});
