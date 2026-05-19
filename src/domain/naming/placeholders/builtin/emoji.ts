import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';

export default {
  volatile: true,
  tokens: ['emoji'],
  resolve(ctx, _token) {
    const pool = ctx.settings.emojiPool;
    if (!pool.length) return '🎙️';
    return pool[Math.floor(Math.random() * pool.length)] ?? '🎙️';
  },
} satisfies PlaceholderModule;
