import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';

export default {
  volatile: true,
  tokens: ['random'],
  resolve(_ctx, _token, arg) {
    if (!arg) return String(Math.floor(Math.random() * 100));

    if (arg === 'emoji') return '🎙️';

    const rangeMatch = arg.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const min = Number(rangeMatch[1]);
      const max = Number(rangeMatch[2]);
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      return String(Math.floor(Math.random() * (hi - lo + 1)) + lo);
    }

    return String(Math.floor(Math.random() * 100));
  },
} satisfies PlaceholderModule;
