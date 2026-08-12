/**
 * Lightweight ring buffer of recent console.error messages for feedback context.
 * Opt-in: call ensureConsoleErrorBuffer() once from the feedback host.
 */

const MAX_ERRORS = 12;
const MAX_MESSAGE_LEN = 500;

let installed = false;
const recent: string[] = [];

function serializeArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (arg instanceof Error) {
    return arg.stack || arg.message || String(arg);
  }
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function ensureConsoleErrorBuffer(): void {
  if (typeof window === "undefined" || installed) return;
  installed = true;

  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    try {
      const message = args.map(serializeArg).join(" ").slice(0, MAX_MESSAGE_LEN);
      if (message.trim()) {
        recent.push(`${new Date().toISOString()} ${message}`);
        if (recent.length > MAX_ERRORS) recent.shift();
      }
    } catch {
      // never break console.error
    }
    original(...args);
  };
}

export function getRecentConsoleErrors(): string[] {
  return [...recent];
}
