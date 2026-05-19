import { ChannelType, type Guild, type VoiceChannel } from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import type { GuildConfigRow } from '@/infra/repositories/guild-config.repo.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';

export async function ensureGuildConfigured(
  app: AppContext,
  guildId: string,
): Promise<GuildConfigRow> {
  const { guildConfigRepo, guildCache } = app;

  const existing = await guildConfigRepo.findById(guildId);
  if (existing) {
    guildCache.set(guildId, existing.settings);
    return existing;
  }

  const row = await guildConfigRepo.upsert(guildId);
  guildCache.set(guildId, row.settings);
  return row;
}

function resolveUniqueCreatorName(guild: Guild, baseName: string): string {
  const taken = new Set(
    guild.channels.cache
      .filter((c) => c.isVoiceBased())
      .map((c) => c.name),
  );

  if (!taken.has(baseName)) return baseName;

  for (let i = 2; i < 100; i++) {
    const candidate = `${baseName} ${i}`;
    if (!taken.has(candidate)) return candidate;
  }

  return `${baseName} ${Date.now()}`;
}

export async function createCreatorVoiceChannel(
  app: AppContext,
  guild: Guild,
  settings: GuildSettingsRecord,
): Promise<VoiceChannel> {
  const parentId =
    settings.categoryId ??
    app.creatorIndex
      .listByGuild(guild.id)
      .map((c) => guild.channels.cache.get(c.channelId)?.parentId)
      .find((id): id is string => Boolean(id)) ??
    undefined;

  const { creator } = app.config.defaults;
  const name = resolveUniqueCreatorName(guild, creator.channelName);

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildVoice,
    parent: parentId ?? undefined,
    userLimit: creator.userLimit,
    reason: creator.createReason,
  });

  if (settings.tempPermissionSync === 'category' && parentId) {
    await channel.lockPermissions().catch(() => undefined);
  }

  return channel;
}
