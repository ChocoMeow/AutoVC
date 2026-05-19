import { getAppContext } from '@/app-context.ts';
import { deployCommands } from '@/discord/deploy-commands.ts';
import { defineEvent } from '@/discord/events/_loader.ts';
import { reconcile } from '@/infra/reconcile.ts';
import { startChannelNameRefreshScheduler } from '@/infra/channel-name-refresh-scheduler.ts';
import { checkBotGuildPermissions } from '@/shared/bot-permissions.ts';
import {
  runStartupVoiceRecovery,
  startVoiceRecoveryScheduler,
} from '@/infra/voice-recovery-scheduler.ts';

export default defineEvent({
  name: 'clientReady',
  once: true,
  async execute(client) {
    const app = getAppContext();
    const { config, logger, commands, discordQueue } = app;

    logger.info({ guilds: client.guilds.cache.size }, 'Bot ready');

    for (const guild of client.guilds.cache.values()) {
      const botCheck = checkBotGuildPermissions(guild);
      if (!botCheck.ok) {
        logger.warn(
          { guildId: guild.id, guildName: guild.name },
          `AutoVC disabled in this server until bot permissions are fixed: ${botCheck.message.replace(/\n/g, ' ')}`,
        );
      }
    }

    await reconcile(app);

    const result = await deployCommands(config.discord, [...commands.values()], {
      logger,
      fullConfig: config,
    });

    if (result.skipped) {
      logger.debug({ reason: result.reason }, 'Slash command deploy skipped');
    }

    await runStartupVoiceRecovery(app, discordQueue);
    startVoiceRecoveryScheduler(app, discordQueue);
    startChannelNameRefreshScheduler(app, discordQueue);
  },
});
