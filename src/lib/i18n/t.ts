import type { MessageTree, TranslationValues } from "@/lib/i18n/types";

function getByPath(tree: MessageTree, key: string): unknown {
  const parts = key.split(".").filter(Boolean);
  let current: unknown = tree;
  for (const part of parts) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function interpolate(template: string, values?: TranslationValues): string {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value == null) return `{${name}}`;
    return String(value);
  });
}

/**
 * Look up a dotted message key. Missing keys fall back to `fallbackTree`,
 * then to the key itself so UI never crashes.
 */
export function translate(
  tree: MessageTree,
  key: string,
  values?: TranslationValues,
  fallbackTree?: MessageTree,
): string {
  const direct = getByPath(tree, key);
  if (typeof direct === "string") return interpolate(direct, values);

  if (fallbackTree && fallbackTree !== tree) {
    const fallback = getByPath(fallbackTree, key);
    if (typeof fallback === "string") return interpolate(fallback, values);
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[i18n] Missing message: ${key}`);
  }
  return key;
}

export function hasMessage(tree: MessageTree, key: string): boolean {
  return typeof getByPath(tree, key) === "string";
}
