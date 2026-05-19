import { ChannelType, type Guild } from 'discord.js';

export function modLogChannelSelectOptions(
  guild: Guild,
): { label: string; value: string; description?: string }[] {
  const channels = [...guild.channels.cache.values()]
    .filter(
      (ch) =>
        ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement,
    )
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 24);

  return channels.map((ch) => ({
    label: `#${ch.name}`.slice(0, 100),
    value: ch.id,
    description: ch.parent ? `Category: ${ch.parent.name}` : 'No category',
  }));
}
