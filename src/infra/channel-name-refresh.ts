import { ChannelType, DiscordAPIError } from 'discord.js';
import { RateLimitError } from '@discordjs/rest';
import type { VoiceChannel } from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import { buildChannelTemplateContext } from '@/domain/naming/build-template-context.ts';
import { mergeSettingsForTemp } from '@/domain/settings/settings-merger.ts';
import type { DiscordTaskQueue } from '@/infra/discord-task-queue.ts';
import type { ChannelRenameLimiter } from '@/infra/channel-rename-limiter.ts';
import { tempChannelNameLocked } from '@/domain/temp-channel-settings.ts';
import type { TempChannelMeta } from '@/infra/cache/temp-channel-registry.ts';

/** False when the owner set a custom name or the template does not need live updates. */
export function canAutoRenameTempChannel(app: AppContext, meta: TempChannelMeta): boolean {
  if (tempChannelNameLocked(meta.settings)) return false;

  const settings = mergeSettingsForTemp(
    app.guildCache,
    app.creatorIndex,
    app.config.defaults.guild,
    meta,
  );
  if (!settings) return false;

  return app.templateEngine.templateNeedsLiveRefresh(settings.channelNameTemplate);
}

export type RefreshStats = {
  scanned: number;
  unchanged: number;
  updated: number;
  skipped: number;
  rateLimited: number;
  failed: number;
};

export async function runChannelNameRefresh(
  app: AppContext,
  queue: DiscordTaskQueue,
  limiter: ChannelRenameLimiter,
): Promise<RefreshStats> {
  const stats: RefreshStats = {
    scanned: 0,
    unchanged: 0,
    updated: 0,
    skipped: 0,
    rateLimited: 0,
    failed: 0,
  };

  const temps = app.tempRegistry.listAll();
  if (!temps.length) return stats;

  const cfg = app.config.channelNameRefresh;
  const pending: { meta: TempChannelMeta; desiredName: string }[] = [];

  for (const meta of temps) {
    stats.scanned++;

    if (!canAutoRenameTempChannel(app, meta)) {
      stats.skipped++;
      continue;
    }

    const result = await resolveDesiredName(app, meta);
    if (result === null) {
      stats.skipped++;
      continue;
    }

    const { channel, desiredName } = result;
    if (channel.name === desiredName) {
      stats.unchanged++;
      continue;
    }

    if (!limiter.canRename(meta.channelId)) {
      stats.rateLimited++;
      const waitMs = limiter.msUntilCanRename(meta.channelId);
      app.logger.debug(
        { channelId: meta.channelId, waitMs },
        'Channel rename deferred — per-channel rate limit',
      );
      continue;
    }

    pending.push({ meta, desiredName });
  }

  for (const { meta, desiredName } of pending) {
    if (!limiter.canRename(meta.channelId)) {
      stats.rateLimited++;
      continue;
    }

    try {
      await queue.enqueue(`rename:${meta.channelId}`, async () => {
        await renameTempChannelIfNeeded(app, meta, desiredName, limiter);
      });
      stats.updated++;
    } catch (err) {
      if (err instanceof RenameRateLimitedError) {
        stats.rateLimited++;
      } else {
        stats.failed++;
        app.logger.warn({ err, channelId: meta.channelId }, 'Failed to refresh channel name');
      }
    }
  }

  return stats;
}

class RenameRateLimitedError extends Error {
  constructor() {
    super('Channel rename rate limit');
    this.name = 'RenameRateLimitedError';
  }
}

function isDiscordRateLimit(err: unknown): boolean {
  return err instanceof RateLimitError || (err instanceof DiscordAPIError && err.status === 429);
}

export async function refreshTempChannelName(
  app: AppContext,
  channelId: string,
  queue: DiscordTaskQueue,
  limiter: ChannelRenameLimiter,
): Promise<void> {
  const meta = app.tempRegistry.get(channelId);
  if (!meta) return;
  if (!canAutoRenameTempChannel(app, meta)) return;

  const result = await resolveDesiredName(app, meta);
  if (!result) return;

  const { channel, desiredName } = result;
  if (channel.name === desiredName) return;
  if (!limiter.canRename(channelId)) return;

  try {
    await queue.enqueue(`rename:${channelId}`, async () => {
      await renameTempChannelIfNeeded(app, meta, desiredName, limiter);
    });
  } catch (err) {
    if (!(err instanceof RenameRateLimitedError)) {
      app.logger.warn({ err, channelId }, 'Failed to refresh channel name');
    }
  }
}

async function renameTempChannelIfNeeded(
  app: AppContext,
  meta: TempChannelMeta,
  desiredName: string,
  limiter: ChannelRenameLimiter,
): Promise<void> {
  const guild = app.client.guilds.cache.get(meta.guildId);
  const channel = guild?.channels.cache.get(meta.channelId);
  if (!channel?.isVoiceBased()) return;
  if (channel.name === desiredName) return;

  if (!limiter.canRename(meta.channelId)) {
    throw new RenameRateLimitedError();
  }

  try {
    const oldName = channel.name;
    await channel.setName(desiredName, app.config.channelNameRefresh.renameReason);
    limiter.recordRename(meta.channelId);

    const guildSettings =
      (await app.guildCache.load(meta.guildId)) ?? app.guildCache.get(meta.guildId);
    if (guildSettings && guild) {
      const owner = guild.members.cache.get(meta.ownerId);
      app.modLogService.logUpdate(
        meta.guildId,
        guildSettings,
        channel,
        'temp',
        oldName,
        desiredName,
        owner,
        meta.creatorChannelId,
      );
    }
  } catch (err) {
    if (isDiscordRateLimit(err)) {
      limiter.recordRename(meta.channelId);
    }
    throw err;
  }
}

async function resolveDesiredName(
  app: AppContext,
  meta: TempChannelMeta,
): Promise<{ channel: VoiceChannel; desiredName: string } | null> {
  const guild = app.client.guilds.cache.get(meta.guildId);
  if (!guild) return null;

  const channel = guild.channels.cache.get(meta.channelId);
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;

  const creator = app.creatorIndex.get(meta.creatorChannelId);
  if (!creator) return null;

  const ctx = await buildChannelTemplateContext(app, meta, channel, creator, {
    forNewChannel: false,
  });
  if (!ctx) return null;

  const desiredName = await app.templateEngine.render(
    ctx.settings.channelNameTemplate,
    ctx,
  );

  return { channel, desiredName };
}
