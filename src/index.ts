import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setAppContext, type AppContext } from '@/app-context.ts';
import { loadConfig } from '@/config/load.ts';
import { createClient } from '@/discord/client.ts';
import { loadCommands } from '@/discord/commands/_loader.ts';
import { loadEvents } from '@/discord/events/_loader.ts';
import { TemplateEngine } from '@/domain/naming/template-engine.ts';
import { buildRegistry } from '@/domain/naming/placeholders/_registry.ts';
import { parseGuildSettings } from '@/domain/settings/guild-settings.ts';
import { ModLogService } from '@/domain/mod-log/mod-log.service.ts';
import { VoiceChannelService } from '@/domain/voice/voice-channel.service.ts';
import { CreatorChannelIndex } from '@/infra/cache/creator-channel-index.ts';
import { GuildConfigCache } from '@/infra/cache/guild-config-cache.ts';
import { TempChannelRegistry } from '@/infra/cache/temp-channel-registry.ts';
import { CreatorChannelRepository } from '@/infra/repositories/creator-channel.repo.ts';
import { GuildConfigRepository } from '@/infra/repositories/guild-config.repo.ts';
import { TempChannelRepository } from '@/infra/repositories/temp-channel.repo.ts';
import { DiscordTaskQueue } from '@/infra/discord-task-queue.ts';
import { getSupabase } from '@/infra/supabase/client.ts';
import { stopChannelNameRefreshScheduler } from '@/infra/channel-name-refresh-scheduler.ts';
import { stopVoiceRecoveryScheduler } from '@/infra/voice-recovery-scheduler.ts';
import { createLogger } from '@/shared/logger.ts';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');

async function main(): Promise<void> {
  const config = await loadConfig(join(root, 'config.json'));

  if (!config.runtime.enableDiscordBot) {
    console.log('Discord bot disabled in config (runtime.enableDiscordBot = false).');
    return;
  }

  const logger = createLogger(config);
  const db = getSupabase(config, logger);

  const guildDefaults = parseGuildSettings({}, config.defaults.guild);
  const guildConfigRepo = new GuildConfigRepository(db, guildDefaults);
  const creatorRepo = new CreatorChannelRepository(db);
  const tempRepo = new TempChannelRepository(db);

  const guildCache = new GuildConfigCache(guildConfigRepo);
  const creatorIndex = new CreatorChannelIndex();
  const tempRegistry = new TempChannelRegistry();

  const placeholderRegistry = await buildRegistry();
  const templateEngine = new TemplateEngine(
    placeholderRegistry,
    logger,
    config.defaults.naming.maxChannelNameLength,
  );

  const client = createClient(config.discord);
  const commandsDir = join(root, 'src/discord/commands');
  const eventsDir = join(root, 'src/discord/events');
  const commands = await loadCommands(commandsDir);

  const discordQueue = new DiscordTaskQueue(
    config.recovery.taskDelayMs,
    logger,
    config.recovery.maxRetries,
  );

  const partialApp = {
    config,
    client,
    logger,
    guildCache,
    creatorIndex,
    tempRegistry,
    guildConfigRepo,
    creatorRepo,
    tempRepo,
    templateEngine,
    discordQueue,
  } as AppContext;

  partialApp.voiceService = new VoiceChannelService(partialApp);
  partialApp.modLogService = new ModLogService(partialApp);
  partialApp.commands = commands;

  setAppContext(partialApp);

  client.on('error', (err) => logger.error({ err }, 'Discord client error'));

  await loadEvents(client, eventsDir);
  await client.login(config.discord.token);

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received — shutting down`);
    stopVoiceRecoveryScheduler();
    stopChannelNameRefreshScheduler();
    client.destroy();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
