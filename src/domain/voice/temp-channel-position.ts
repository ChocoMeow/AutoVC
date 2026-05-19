import { ChannelType, type Guild, type VoiceChannel } from 'discord.js';
import type { TempChannelPosition } from '@/domain/settings/guild-settings.ts';

function voiceSiblingsInParent(guild: Guild, parentId: string | null): VoiceChannel[] {
  return [...guild.channels.cache.values()].filter(
    (ch): ch is VoiceChannel =>
      ch.type === ChannelType.GuildVoice && (ch.parentId ?? null) === parentId,
  );
}

/** Discord channel position for a new temp voice channel in its parent. */
export function resolveTempChannelPosition(
  guild: Guild,
  mode: TempChannelPosition,
  creatorChannel: VoiceChannel,
  parentId: string | null | undefined,
): number {
  const targetParent = parentId ?? null;
  const siblings = voiceSiblingsInParent(guild, targetParent);

  if (mode === 'top') {
    if (!siblings.length) return 0;
    return Math.min(...siblings.map((ch) => ch.position));
  }

  if (mode === 'bottom') {
    if (!siblings.length) return 0;
    return Math.max(...siblings.map((ch) => ch.position)) + 1;
  }

  // belowCreator — same category as creator when possible
  const sameParentAsCreator = (creatorChannel.parentId ?? null) === targetParent;
  if (sameParentAsCreator) {
    return creatorChannel.position + 1;
  }

  if (!siblings.length) return 0;
  return Math.max(...siblings.map((ch) => ch.position)) + 1;
}
