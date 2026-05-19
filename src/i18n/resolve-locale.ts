import { DEFAULT_LOCALE_ID, isLocaleId, type LocaleId } from '@/i18n/locales/index.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';

export function resolveGuildLocale(
  settings: Pick<GuildSettingsRecord, 'locale'> | undefined,
  configDefault: string = DEFAULT_LOCALE_ID,
): LocaleId {
  const fromConfig = isLocaleId(configDefault) ? configDefault : DEFAULT_LOCALE_ID;
  const raw = settings?.locale;
  if (typeof raw === 'string' && isLocaleId(raw)) return raw;
  return fromConfig;
}
