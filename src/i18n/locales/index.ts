/**
 * Register locales here to enable them server-wide.
 * 1. Add `src/i18n/locales/<id>.ts` matching the Messages shape from en.ts
 * 2. Import and add to LOCALE_MESSAGES below
 */
import { en } from '@/i18n/locales/en.ts';
import { zhTW } from '@/i18n/locales/zh-TW.ts';
import type { Messages } from '@/i18n/types.ts';

export const LOCALE_MESSAGES = {
  en,
  'zh-TW': zhTW,
} as const satisfies Record<string, Messages>;

export const LOCALE_IDS = Object.keys(LOCALE_MESSAGES) as (keyof typeof LOCALE_MESSAGES)[];

export type LocaleId = (typeof LOCALE_IDS)[number];

export const DEFAULT_LOCALE_ID: LocaleId = 'en';

export function isLocaleId(value: string): value is LocaleId {
  return value in LOCALE_MESSAGES;
}
