export class MediaError extends Error {
  readonly code?:
    | "not_found"
    | "forbidden"
    | "validation"
    | "conflict"
    | "unsafe";

  constructor(
    message: string,
    options?: {
      code?:
        | "not_found"
        | "forbidden"
        | "validation"
        | "conflict"
        | "unsafe";
    },
  ) {
    super(message);
    this.name = "MediaError";
    this.code = options?.code;
  }
}
