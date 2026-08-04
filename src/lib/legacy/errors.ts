export class LegacyError extends Error {
  readonly code?: "not_found" | "validation" | "forbidden";

  constructor(
    message: string,
    options?: { code?: LegacyError["code"] },
  ) {
    super(message);
    this.name = "LegacyError";
    this.code = options?.code;
  }
}
