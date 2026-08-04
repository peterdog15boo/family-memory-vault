/**
 * Memory domain errors (kept separate so HTTP helpers can import without
 * pulling the full DB helper module into every consumer graph unnecessarily).
 */
export class MemoryError extends Error {
  readonly code?: "not_found" | "forbidden" | "validation";

  constructor(
    message: string,
    options?: { code?: "not_found" | "forbidden" | "validation" },
  ) {
    super(message);
    this.name = "MemoryError";
    this.code = options?.code;
  }
}
