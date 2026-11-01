import type { LanguageSetting, ResolvedLanguage } from "../types";
import { en, type TranslationKey } from "./en";
import { zh } from "./zh";

export type { TranslationKey };

const dictionaries: Record<ResolvedLanguage, Record<TranslationKey, string>> = {
  en,
  zh
};

let currentLanguage: ResolvedLanguage = detectObsidianLanguage();

/** Read Obsidian's rendered locale, falling back to the browser locale. */
export function detectObsidianLanguage(): ResolvedLanguage {
  let code = "";
  try {
    code =
      (typeof document !== "undefined" && document.documentElement.lang) ||
      (typeof navigator !== "undefined" && navigator.language) ||
      "";
  } catch {
    code = "";
  }

  return code.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function resolveLanguage(setting: LanguageSetting): ResolvedLanguage {
  return setting === "auto" ? detectObsidianLanguage() : setting;
}

export function setLanguage(setting: LanguageSetting): ResolvedLanguage {
  currentLanguage = resolveLanguage(setting);
  return currentLanguage;
}

export function getLanguage(): ResolvedLanguage {
  return currentLanguage;
}

export function locale(): string {
  return currentLanguage === "zh" ? "zh-CN" : "en-US";
}

/** Translate a key and interpolate {{placeholders}}. */
export function t(
  key: TranslationKey,
  values: Record<string, string | number> = {}
): string {
  const template = dictionaries[currentLanguage][key] ?? en[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
    const value = values[name];
    return value === undefined ? `{{${name}}}` : String(value);
  });
}

export function statusLabel(status: string): string {
  const map: Record<string, TranslationKey> = {
    draft: "status.draft",
    publish: "status.publish",
    pending: "status.pending",
    private: "status.private",
    future: "status.future"
  };
  const key = map[status];
  return key ? t(key) : t("status.other");
}

export function formatLabel(format: string): string {
  const key = `format.${format}` as TranslationKey;
  const dictionary = dictionaries[currentLanguage];
  return key in dictionary ? t(key) : format;
}
