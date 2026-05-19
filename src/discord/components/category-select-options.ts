import { ChannelType, type Guild } from 'discord.js';

export function guildCategorySelectOptions(
  guild: Guild,
): { label: string; value: string }[] {
  return [...guild.channels.cache.values()]
    .filter((ch) => ch.type === ChannelType.GuildCategory)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 24)
    .map((ch) => ({
      label: ch.name.slice(0, 100),
      value: ch.id,
    }));
}
