import type { PlaceholderModule } from '@/domain/naming/placeholders/_registry.ts';

export default {
  volatile: true,
  tokens: ['timestamp'],
  resolve(_ctx, _token, arg) {
    const now = new Date();
    if (arg === 'unix') return String(Math.floor(now.getTime() / 1000));
    if (arg === 'iso') return now.toISOString();
    return now.toTimeString().slice(0, 5);
  },
} satisfies PlaceholderModule;
