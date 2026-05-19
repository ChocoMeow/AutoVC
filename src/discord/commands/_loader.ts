import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';

export interface BotCommand {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export async function loadCommands(dir: string): Promise<Map<string, BotCommand>> {
  const map = new Map<string, BotCommand>();
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'));

  for (const file of files) {
    const mod = (await import(join(dir, file))) as { default: BotCommand };
    const cmd = mod.default;
    map.set(cmd.data.name, cmd);
  }

  return map;
}
