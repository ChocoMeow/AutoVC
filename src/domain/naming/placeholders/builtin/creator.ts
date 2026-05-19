import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import { getMember } from '@/domain/naming/placeholders/context-access.ts';
import { formatUserTag } from '@/shared/discord-user.ts';
import { memberHighestRoleName, memberHoistRoleName } from '@/shared/member-placeholders.ts';

export default {
  volatile: true,
  tokens: [
    'creator',
    'creator.name',
    'creator.displayName',
    'creator.tag',
    'creator.id',
    'creator.highestRole',
    'creator.hoistRole',
  ],
  resolve(ctx, token) {
    const member = getMember(ctx);
    if (!member) return '';

    switch (token) {
      case 'creator':
      case 'creator.displayName':
        return member.displayName;
      case 'creator.name':
        return member.user.username;
      case 'creator.tag':
        return formatUserTag(member.user);
      case 'creator.id':
        return member.id;
      case 'creator.highestRole':
        return memberHighestRoleName(member);
      case 'creator.hoistRole':
        return memberHoistRoleName(member);
      default:
        return member.displayName;
    }
  },
} satisfies PlaceholderModule;
