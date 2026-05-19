import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import { getGuild } from '@/domain/naming/placeholders/context-access.ts';

export default {
  tokens: ['guild', 'guild.name', 'guild.id', 'guild.members'],
  resolve(ctx, token) {
    const guild = getGuild(ctx);
    switch (token) {
      case 'guild':
      case 'guild.name':
        return guild.name;
      case 'guild.id':
        return guild.id;
      case 'guild.members':
        return String(guild.memberCount);
      default:
        return guild.name;
    }
  },
} satisfies PlaceholderModule;
