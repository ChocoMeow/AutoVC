import { ChannelType, type Guild } from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import type { DiscordTaskQueue } from '@/infra/discord-task-queue.ts';

export interface VoiceRecoveryStats {
  guilds: number;
  emptyTempsDeleted: number;
  staleTempsCleaned: number;
  creatorJoinsRecovered: number;
  ownerTransfersRecovered: number;
  errors: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function runVoiceRecovery(
  app: AppContext,
  queue: DiscordTaskQueue,
  options: { reason: 'startup' | 'interval' },
): Promise<VoiceRecoveryStats> {
  const { client, logger, creatorIndex, guildConfigRepo } = app;
  const stats: VoiceRecoveryStats = {
    guilds: 0,
    emptyTempsDeleted: 0,
    staleTempsCleaned: 0,
    creatorJoinsRecovered: 0,
    ownerTransfersRecovered: 0,
    errors: 0,
  };

  const guildDelayMs = app.config.recovery.guildDelayMs;
  const guilds = [...client.guilds.cache.values()];

  logger.info(
    { reason: options.reason, guilds: guilds.length, queuePending: queue.pending },
    'Voice recovery sweep started',
  );

  for (let i = 0; i < guilds.length; i++) {
    if (i > 0) await sleep(guildDelayMs);

    const guild = guilds[i]!;
    const guildRow = await guildConfigRepo.findById(guild.id);
    if (!guildRow?.enabled) continue;

    stats.guilds++;

    try {
      await sweepGuild(app, queue, guild, stats);
    } catch (err) {
      stats.errors++;
      logger.error({ err, guildId: guild.id }, 'Guild voice recovery failed');
    }
  }

  logger.info({ ...stats, reason: options.reason }, 'Voice recovery sweep finished');
  return stats;
}

async function sweepGuild(
  app: AppContext,
  queue: DiscordTaskQueue,
  guild: Guild,
  stats: VoiceRecoveryStats,
): Promise<void> {
  const { tempRegistry, creatorIndex, voiceService, logger } = app;

  for (const meta of tempRegistry.listByGuild(guild.id)) {
    const channel = guild.channels.cache.get(meta.channelId);

    if (!channel?.isVoiceBased()) {
      await queue.enqueue(`cleanup-stale:${meta.channelId}`, async () => {
        await voiceService.handleChannelDeleted(meta.channelId, guild.id);
        stats.staleTempsCleaned++;
        logger.debug({ channelId: meta.channelId }, 'Removed stale temp from registry');
      });
      continue;
    }

    if (channel.members.size === 0) {
      await queue.enqueue(`delete-empty:${meta.channelId}`, async () => {
        await voiceService.deleteTempChannel(meta.channelId, guild.id);
        stats.emptyTempsDeleted++;
        logger.debug({ channelId: meta.channelId }, 'Deleted empty temp channel');
      });
      continue;
    }

    if (
      channel.type === ChannelType.GuildVoice &&
      !channel.members.has(meta.ownerId)
    ) {
      await queue.enqueue(`recover-owner:${meta.channelId}`, async () => {
        await voiceService.reconcileTempOwnership(channel, meta);
        stats.ownerTransfersRecovered++;
        logger.info(
          { channelId: meta.channelId, previousOwnerId: meta.ownerId },
          'Recovered temp channel ownership',
        );
      });
    }
  }

  for (const creator of creatorIndex.listByGuild(guild.id)) {
    const creatorChannel = guild.channels.cache.get(creator.channelId);
    if (!creatorChannel?.isVoiceBased()) continue;

    for (const member of creatorChannel.members.values()) {
      if (member.user.bot) continue;
      if (member.voice.channelId !== creator.channelId) continue;
      if (isMemberInRegisteredTemp(app, guild.id, member.id)) continue;

      await queue.enqueue(`recover-creator:${member.id}`, async () => {
        await voiceService.recoverCreatorJoin(member, creator);
        stats.creatorJoinsRecovered++;
        logger.info(
          { guildId: guild.id, userId: member.id, creatorId: creator.channelId },
          'Recovered missed creator join',
        );
      });
    }
  }
}

function isMemberInRegisteredTemp(app: AppContext, guildId: string, userId: string): boolean {
  for (const meta of app.tempRegistry.listByGuild(guildId)) {
    if (meta.ownerId !== userId) continue;
    const guild = app.client.guilds.cache.get(guildId);
    const ch = guild?.channels.cache.get(meta.channelId);
    if (ch?.isVoiceBased() && ch.members.has(userId)) return true;
  }
  return false;
}
