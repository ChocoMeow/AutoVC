import { REST, Routes } from 'discord.js';
import type { Config } from '@/config/load.ts';
import type { BotCommand } from '@/discord/commands/_loader.ts';
import {
  markCommandsDeployed,
  shouldDeployCommands,
} from '@/discord/command-deploy-state.ts';
import type { Logger } from '@/shared/logger.ts';

export interface DeployResult {
  deployed: boolean;
  skipped: boolean;
  reason?: string;
  count?: number;
  scope?: 'guild' | 'global';
}

export async function deployCommands(
  config: Config['discord'],
  commands: BotCommand[],
  options: {
    logger: Logger;
    force?: boolean;
    fullConfig?: Config;
  },
): Promise<DeployResult> {
  const fullConfig = options.fullConfig;
  if (!options.force && fullConfig && !shouldDeployCommands(fullConfig, commands)) {
    return {
      deployed: false,
      skipped: true,
      reason: `deployCommands is "${fullConfig.discord.deployCommands}" and command definitions unchanged`,
    };
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const body = commands.map((cmd) => cmd.data.toJSON());
  const scope = config.guildId ? 'guild' : 'global';

  if (config.guildId) {
    await rest.put(
      Routes.applicationGuildCommands(config.applicationId, config.guildId),
      { body },
    );
  } else {
    await rest.put(Routes.applicationCommands(config.applicationId), { body });
  }

  if (fullConfig) markCommandsDeployed(fullConfig, commands);

  const message =
    scope === 'guild'
      ? `Registered ${body.length} guild slash commands (${config.guildId})`
      : `Registered ${body.length} global slash commands`;

  options.logger.info({ count: body.length, scope, guildId: config.guildId }, message);

  return { deployed: true, skipped: false, count: body.length, scope };
}
