import type { CreatorChannelIndex } from '@/infra/cache/creator-channel-index.ts';
import type { GuildConfigCache } from '@/infra/cache/guild-config-cache.ts';
import type { TempChannelMeta } from '@/infra/cache/temp-channel-registry.ts';
import {
  parseGuildSettings,
  type GuildSettingsRecord,
} from '@/domain/settings/guild-settings.ts';

export function mergeSettings(
  guild: Record<string, unknown>,
  creator: Record<string, unknown>,
  baseDefaults: GuildSettingsRecord,
): GuildSettingsRecord {
  return parseGuildSettings({ ...guild, ...creator }, baseDefaults);
}

/** Cached guild + creator merge (no DB) — for hot paths like presence updates. */
export function mergeSettingsForTemp(
  guildCache: GuildConfigCache,
  creatorIndex: CreatorChannelIndex,
  baseDefaults: GuildSettingsRecord,
  meta: TempChannelMeta,
): GuildSettingsRecord | null {
  const guildSettings = guildCache.get(meta.guildId);
  if (!guildSettings) return null;
  const creator = creatorIndex.get(meta.creatorChannelId);
  return mergeSettings(guildSettings, creator?.settings ?? {}, baseDefaults);
}
