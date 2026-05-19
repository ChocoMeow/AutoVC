import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import { getTempChannel } from '@/domain/naming/placeholders/context-access.ts';

export default {
  volatile: true,
  tokens: ['count'],
  resolve(ctx, _token) {
    if (ctx.memberCountInNewChannel !== undefined) {
      return String(ctx.memberCountInNewChannel);
    }
    const channel = getTempChannel(ctx);
    if (channel?.isVoiceBased()) {
      return String(channel.members.size);
    }
    return '';
  },
} satisfies PlaceholderModule;
