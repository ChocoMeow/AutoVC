import type { Guild } from 'discord.js';
import type { CreatorConfig } from '@/infra/cache/creator-channel-index.ts';

export function creatorChannelSelectOptions(
  guild: Guild,
  creators: CreatorConfig[],
  description: string,
): { label: string; value: string; description: string }[] {
  return creators.slice(0, 25).map((c) => {
    const ch = guild.channels.cache.get(c.channelId);
    return {
      label: (ch?.name ?? c.channelId).slice(0, 100),
      value: c.channelId,
      description: c.label ?? description,
    };
  });
}
