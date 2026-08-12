/**
 * Nested message tree + interpolation values for `t()`.
 */

export type MessageValue = string | { [key: string]: MessageValue };

export type MessageTree = {
  [key: string]: MessageValue;
};

export type TranslationValues = Record<
  string,
  string | number | boolean | null | undefined
>;

export type TranslateFn = (
  key: string,
  values?: TranslationValues,
) => string;
