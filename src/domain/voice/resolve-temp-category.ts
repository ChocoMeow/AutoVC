import type { VoiceChannel } from 'discord.js';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';

/** Category parent for new temporary voice channels. */
export function resolveTempChannelParentId(
  settings: GuildSettingsRecord,
  creatorChannel: VoiceChannel,
): string | undefined {
  return (
    settings.tempCategoryId ??
    settings.categoryId ??
    creatorChannel.parentId ??
    undefined
  );
}
