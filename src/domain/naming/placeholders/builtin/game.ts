import { ActivityType, type GuildMember } from 'discord.js';
import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import { getTempChannel } from '@/domain/naming/placeholders/context-access.ts';
import { resolvePlaceholder } from '@/domain/naming/placeholders/safe-resolve.ts';

const GAME_LIST_MAX = 64;

function formatChannelGames(members: Iterable<GuildMember>, fallback: string): string {
  const names = new Set<string>();
  for (const member of members) {
    if (member.user.bot) continue;
    for (const activity of member.presence?.activities ?? []) {
      if (activity.type === ActivityType.Playing && activity.name) names.add(activity.name);
    }
  }
  if (!names.size) return fallback;

  let text = [...names].join(', ');
  if (text.length > GAME_LIST_MAX) text = `${text.slice(0, GAME_LIST_MAX - 1)}…`;
  return text;
}

export default {
  volatile: true,
  presence: true,
  tokens: ['game'],
  resolve(ctx, _token) {
    const fallback = ctx.settings.gameFallback;
    const channel = getTempChannel(ctx);
    if (!channel?.isVoiceBased()) return fallback;

    return resolvePlaceholder(fallback, () =>
      formatChannelGames(channel.members.values(), fallback),
    );
  },
} satisfies PlaceholderModule;
