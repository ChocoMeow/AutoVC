import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import {
  channelFieldValue,
  getTempChannel,
} from '@/domain/naming/placeholders/context-access.ts';

export default {
  volatile: true,
  tokens: [
    'channel',
    'channel.name',
    'channel.id',
    'channel.members',
    'channel.mention',
  ],
  resolve(ctx, token) {
    const channel = getTempChannel(ctx);
    if (!channel) return '';

    if (token === 'channel') {
      return channel.name;
    }

    const prefix = 'channel.';
    if (!token.startsWith(prefix)) return channel.name;
    return channelFieldValue(channel, token.slice(prefix.length));
  },
} satisfies PlaceholderModule;
