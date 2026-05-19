import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import { modLogChannelSide } from '@/domain/naming/placeholders/context-access.ts';

const OLD_PREFIX = 'oldchannel';
const NEW_PREFIX = 'newchannel';

function resolveModLogToken(
  ctx: Parameters<PlaceholderModule['resolve']>[0],
  token: string,
  side: 'old' | 'new',
): string {
  const mod = ctx.modLog;
  if (!mod) return '';

  const prefix = side === 'old' ? OLD_PREFIX : NEW_PREFIX;
  if (token === prefix) {
    return modLogChannelSide(side, mod.event, ctx, 'name');
  }

  const dot = `${prefix}.`;
  if (!token.startsWith(dot)) return '';
  return modLogChannelSide(side, mod.event, ctx, token.slice(dot.length));
}

export default {
  tokens: [
    'oldchannel',
    'oldchannel.name',
    'oldchannel.id',
    'oldchannel.mention',
    'oldchannel.member_count',
    'oldchannel.members_count',
    'oldchannel.members',
    'newchannel',
    'newchannel.name',
    'newchannel.id',
    'newchannel.mention',
    'newchannel.member_count',
    'newchannel.members_count',
    'newchannel.members',
  ],
  resolve(ctx, token) {
    if (token === 'oldchannel' || token.startsWith('oldchannel.')) {
      return resolveModLogToken(ctx, token, 'old');
    }
    if (token === 'newchannel' || token.startsWith('newchannel.')) {
      return resolveModLogToken(ctx, token, 'new');
    }
    return '';
  },
} satisfies PlaceholderModule;
