import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '@/config/load.ts';
import type { BotCommand } from '@/discord/commands/_loader.ts';

function hashCommands(commands: BotCommand[]): string {
  const body = commands
    .map((c) => c.data.toJSON())
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function metaPath(config: Config): string {
  const dir = join(process.cwd(), config.logging.directory, '.meta');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'commands-hash.txt');
}

function readStoredHash(config: Config): string | null {
  try {
    return readFileSync(metaPath(config), 'utf8').trim() || null;
  } catch {
    return null;
  }
}

function writeStoredHash(config: Config, hash: string): void {
  writeFileSync(metaPath(config), hash, 'utf8');
}

export function shouldDeployCommands(config: Config, commands: BotCommand[]): boolean {
  const mode = config.discord.deployCommands;

  if (mode === 'never') return false;
  if (mode === 'always') return true;

  const current = hashCommands(commands);
  const stored = readStoredHash(config);
  return current !== stored;
}

export function markCommandsDeployed(config: Config, commands: BotCommand[]): void {
  writeStoredHash(config, hashCommands(commands));
}
