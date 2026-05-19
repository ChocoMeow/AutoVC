import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '@/config/load.ts';
import { deployCommands } from '@/discord/deploy-commands.ts';
import { loadCommands } from '@/discord/commands/_loader.ts';
import { createLogger } from '@/shared/logger.ts';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '../..');

const config = await loadConfig(join(root, 'config.json'));
const logger = createLogger(config);
const commandsDir = join(root, 'src/discord/commands');
const commands = await loadCommands(commandsDir);

const result = await deployCommands(config.discord, [...commands.values()], {
  logger,
  force: true,
  fullConfig: config,
});

if (!result.deployed) {
  logger.warn({ result }, 'Command deploy did not run');
  process.exit(1);
}
