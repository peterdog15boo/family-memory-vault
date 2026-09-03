import type { AppLocale } from "@/lib/i18n/locales";
import type { MessageTree, MessageValue } from "@/lib/i18n/types";
import { de } from "@/lib/i18n/dictionaries/de";
import { enUS } from "@/lib/i18n/dictionaries/en-US";
import { es } from "@/lib/i18n/dictionaries/es";
import { esMissing } from "@/lib/i18n/dictionaries/extras/es-missing";
import { newKeysByLocale } from "@/lib/i18n/dictionaries/extras/new-keys";
import { newKeysRound2ByLocale } from "@/lib/i18n/dictionaries/extras/new-keys-round2";
import { newKeysRound3ByLocale } from "@/lib/i18n/dictionaries/extras/new-keys-round3";
import { newKeysRound4CjkByLocale } from "@/lib/i18n/dictionaries/extras/new-keys-round4-cjk";
import { newKeysRound4RomanceByLocale } from "@/lib/i18n/dictionaries/extras/new-keys-round4-romance";
import { newKeysRound5ByLocale } from "@/lib/i18n/dictionaries/extras/new-keys-round5";
import { newKeysRound6ByLocale } from "@/lib/i18n/dictionaries/extras/new-keys-round6";
import { sharedMissingByLocale } from "@/lib/i18n/dictionaries/extras/shared-missing";
import { termsChromeByLocale } from "@/lib/i18n/dictionaries/extras/terms-chrome";
import { fr } from "@/lib/i18n/dictionaries/fr";
import { it } from "@/lib/i18n/dictionaries/it";
import { ja } from "@/lib/i18n/dictionaries/ja";
import { ko } from "@/lib/i18n/dictionaries/ko";
import { nl } from "@/lib/i18n/dictionaries/nl";
import { ptBR } from "@/lib/i18n/dictionaries/pt-BR";
import { zhCN } from "@/lib/i18n/dictionaries/zh-CN";

export const dictionaries: Record<AppLocale, MessageTree> = {
  "en-US": enUS,
  es,
  fr,
  de,
  "pt-BR": ptBR,
  "zh-CN": zhCN,
  ja,
  ko,
  it,
  nl,
};

/** Deep-merge so partial locale overrides keep English keys they omit. */
export function deepMergeMessages(
  base: MessageTree,
  overlay: MessageTree,
): MessageTree {
  const out: MessageTree = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const baseChild = base[key];
      const baseTree: MessageTree =
        baseChild && typeof baseChild === "object" && !Array.isArray(baseChild)
          ? (baseChild as MessageTree)
          : {};
      out[key] = deepMergeMessages(baseTree, value as MessageTree);
    }
  }
  return out;
}

function extrasFor(locale: Exclude<AppLocale, "en-US">): MessageTree {
  const shared =
    locale === "es"
      ? esMissing
      : (sharedMissingByLocale[locale] ?? {});
  const round1 = newKeysByLocale[locale] ?? {};
  const round2 = newKeysRound2ByLocale[locale] ?? {};
  const round3 = newKeysRound3ByLocale[locale] ?? {};
  const round4Romance =
    (newKeysRound4RomanceByLocale as Partial<Record<AppLocale, MessageTree>>)[
      locale
    ] ?? {};
  const round4Cjk =
    (newKeysRound4CjkByLocale as Partial<Record<AppLocale, MessageTree>>)[
      locale
    ] ?? {};
  const round5 = newKeysRound5ByLocale[locale] ?? {};
  const round6 = newKeysRound6ByLocale[locale] ?? {};
  const termsChrome = termsChromeByLocale[locale] ?? {};
  return [
    shared,
    round1,
    round2,
    round3,
    round4Romance,
    round4Cjk,
    round5,
    round6,
    termsChrome,
  ].reduce((acc, layer) => deepMergeMessages(acc, layer), {} as MessageTree);
}

/** Gap-fill overlays for keys added after the initial locale pass. */
const dictionaryExtras: Partial<Record<AppLocale, MessageTree>> = {
  es: extrasFor("es"),
  fr: extrasFor("fr"),
  de: extrasFor("de"),
  "pt-BR": extrasFor("pt-BR"),
  "zh-CN": extrasFor("zh-CN"),
  ja: extrasFor("ja"),
  ko: extrasFor("ko"),
  it: extrasFor("it"),
  nl: extrasFor("nl"),
};

export function getDictionary(locale: AppLocale): MessageTree {
  if (locale === "en-US") return enUS;
  const overlay = dictionaries[locale];
  if (!overlay) return enUS;
  const merged = deepMergeMessages(enUS, overlay);
  const extras = dictionaryExtras[locale];
  return extras ? deepMergeMessages(merged, extras) : merged;
}

export type { MessageValue };
