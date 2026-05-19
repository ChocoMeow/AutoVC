import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import {
  channelFieldValue,
  getCreatorChannel,
} from '@/domain/naming/placeholders/context-access.ts';

export default {
  tokens: [
    'creatorchannel',
    'creatorchannel.name',
    'creatorchannel.id',
    'creatorchannel.mention',
    'creatorchannel.member_count',
    'creatorchannel.members_count',
    'creatorchannel.members',
  ],
  resolve(ctx, token) {
    const channel = getCreatorChannel(ctx);
    if (!channel) return '';

    if (token === 'creatorchannel') {
      return channel.name;
    }

    const prefix = 'creatorchannel.';
    if (!token.startsWith(prefix)) return '';
    return channelFieldValue(channel, token.slice(prefix.length));
  },
} satisfies PlaceholderModule;
