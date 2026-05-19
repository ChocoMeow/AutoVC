import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Client, ClientEvents } from 'discord.js';

export interface BotEvent<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
}

/** Type-safe event definition for auto-loaded handlers. */
export function defineEvent<K extends keyof ClientEvents>(event: BotEvent<K>): BotEvent<K> {
  return event;
}

export async function loadEvents(client: Client, dir: string): Promise<void> {
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'));

  for (const file of files) {
    const mod = (await import(join(dir, file))) as { default: BotEvent };
    const event = mod.default;

    const handler = (...args: unknown[]) =>
      event.execute(...(args as ClientEvents[keyof ClientEvents]));

    if (event.once) {
      client.once(event.name, handler);
    } else {
      client.on(event.name, handler);
    }
  }
}
