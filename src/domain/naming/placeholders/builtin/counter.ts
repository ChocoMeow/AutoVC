import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';
import { resolvePlaceholder } from '@/domain/naming/placeholders/safe-resolve.ts';

export default {
  tokens: ['counter'],
  resolve(ctx, _token, arg) {
    return resolvePlaceholder('1', () => {
      if (arg === 'owner' || arg === 'user') {
        return String(ctx.ownerTempOrdinal ?? 1);
      }
      return String(ctx.tempChannelOrdinal ?? 1);
    });
  },
} satisfies PlaceholderModule;
