import type { AppContext } from '@/app-context.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import { resolveGuildLocale } from '@/i18n/resolve-locale.ts';
import { createTranslator, type Translator } from '@/i18n/translator.ts';

export function guildTranslator(
  app: AppContext,
  guildId: string,
  settings?: GuildSettingsRecord,
): Translator {
  const resolved = settings ?? app.guildCache.get(guildId);
  const locale = resolveGuildLocale(resolved, app.config.defaults.guild.locale);
  return createTranslator(locale);
}
