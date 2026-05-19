import {
  DEFAULT_LOCALE_ID,
  LOCALE_MESSAGES,
  type LocaleId,
} from '@/i18n/locales/index.ts';
import type { MessageKey } from '@/i18n/types.ts';

export type TranslateVars = Record<string, string | number>;

function getNested(obj: unknown, path: string): string | undefined {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

export type Translator = (key: MessageKey, vars?: TranslateVars) => string;

export function createTranslator(locale: LocaleId): Translator {
  const bundle = LOCALE_MESSAGES[locale] ?? LOCALE_MESSAGES[DEFAULT_LOCALE_ID];
  const fallback = LOCALE_MESSAGES[DEFAULT_LOCALE_ID];

  return (key, vars) => {
    const text = getNested(bundle, key) ?? getNested(fallback, key) ?? key;
    return interpolate(text, vars);
  };
}

export function localeDisplayName(locale: LocaleId): string {
  return LOCALE_MESSAGES[locale]?.meta.name ?? locale;
}
