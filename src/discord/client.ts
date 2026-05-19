import { Client, GatewayIntentBits, Partials } from 'discord.js';
import type { Config } from '@/config/load.ts';

export function createClient(_config: Config['discord']): Client {
  return new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences,
    ],
    partials: [Partials.Channel, Partials.GuildMember],
  });
}
