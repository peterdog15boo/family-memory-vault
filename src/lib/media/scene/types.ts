/**
 * Scene analysis — labels + short captions for Ask AI visual search.
 */

export type SceneLabel = {
  name: string;
  confidence: number;
  parents?: string[];
};

export type SceneAnalysisResult = {
  caption: string;
  tags: string[];
  labels: SceneLabel[];
  provider: string;
};

export type SceneAnalysisStatus =
  | "pending"
  | "ready"
  | "failed"
  | "skipped";
