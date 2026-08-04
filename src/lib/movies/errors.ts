export class MovieError extends Error {
  /** When false, the worker should complete the queue job without retrying. */
  readonly retryable: boolean;
  /** Machine-readable reason for API status mapping. */
  readonly code?:
    | "quota_exceeded"
    | "plan_limit"
    | "not_found"
    | "validation"
    | "unsafe";

  constructor(
    message: string,
    options?: {
      retryable?: boolean;
      code?:
        | "quota_exceeded"
        | "plan_limit"
        | "not_found"
        | "validation"
        | "unsafe";
    },
  ) {
    super(message);
    this.name = "MovieError";
    this.retryable = options?.retryable ?? true;
    this.code = options?.code;
  }
}
