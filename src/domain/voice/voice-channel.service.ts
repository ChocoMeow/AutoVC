import { Mutex } from 'async-mutex';
import {
  ChannelType,
  type GuildMember,
  type VoiceChannel,
  type VoiceState,
} from 'discord.js';
import type { AppContext } from '@/app-context.ts';
import { mergeSettings, mergeSettingsForTemp } from '@/domain/settings/settings-merger.ts';
import {
  applyTempChannelPermissions,
  buildCreateOverwrites,
} from '@/domain/voice/temp-channel-permissions.ts';
import { resolveTempChannelParentId } from '@/domain/voice/resolve-temp-category.ts';
import { resolveTempChannelPosition } from '@/domain/voice/temp-channel-position.ts';
import { buildChannelTemplateContext } from '@/domain/naming/build-template-context.ts';
import { postTempVoiceChatMessages } from '@/discord/components/temp-voice-panel.ts';
import { canAutoRenameTempChannel } from '@/infra/channel-name-refresh.ts';
import type { CreatorConfig } from '@/infra/cache/creator-channel-index.ts';
import type { TempChannelMeta } from '@/infra/cache/temp-channel-registry.ts';
import {
  forgetChannelRenameHistory,
  scheduleTempChannelNameRefresh,
} from '@/infra/channel-name-refresh-scheduler.ts';
import { guildTranslator } from '@/i18n/guild-translator.ts';
import { checkBotChannelPermissions, checkBotGuildPermissions } from '@/shared/bot-permissions.ts';

export class VoiceChannelService {
  private readonly mutexes = new Map<string, Mutex>();

  constructor(private readonly app: AppContext) {}

  async handleStateChange(oldState: VoiceState, newState: VoiceState): Promise<void> {
    if (newState.channelId && newState.channelId !== oldState.channelId) {
      await this.handleJoin(newState);
    }

    if (oldState.channelId && oldState.channelId !== newState.channelId) {
      await this.logTempVoiceActivity(oldState, 'leave');
      await this.handleLeave(oldState);
    }
  }

  private async handleJoin(state: VoiceState): Promise<void> {
    const { channelId, member, guild } = state;
    if (!channelId || !member) return;

    const { tempRegistry, creatorIndex } = this.app;

    if (tempRegistry.has(channelId)) {
      tempRegistry.cancelDelete(channelId);
      await this.logTempVoiceActivity(state, 'join');
      this.scheduleNameRefreshIfNeeded(channelId);
      return;
    }

    const creator = creatorIndex.get(channelId);
    if (!creator) return;

    const mutex = this.getMutex(guild.id);
    await mutex.runExclusive(async () => {
      await this.createTempChannel(member, creator);
    });
  }

  private async handleLeave(state: VoiceState): Promise<void> {
    const { channelId, guild, member } = state;
    if (!channelId) return;

    const { tempRegistry } = this.app;
    if (!tempRegistry.has(channelId)) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) return;

    if (channel.members.size > 0) {
      tempRegistry.cancelDelete(channelId);
      const meta = tempRegistry.get(channelId);
      if (meta && member?.id === meta.ownerId) {
        await this.transferTempOwnership(channel, meta);
      }
      this.scheduleNameRefreshIfNeeded(channelId);
      return;
    }

    const meta = tempRegistry.get(channelId);
    if (!meta) return;

    const settings = await this.resolveTempChannelSettings(meta, guild.id);
    const delay = settings?.deleteDelayMs ?? this.app.config.defaults.guild.deleteDelayMs;

    tempRegistry.scheduleDelete(channelId, delay, async () => {
      await this.deleteTempChannel(channelId, guild.id);
    });
  }

  async createTempChannel(
    member: GuildMember,
    creator: CreatorConfig,
  ): Promise<void> {
    const { guildCache, tempRegistry, guildConfigRepo, tempRepo, templateEngine, logger } = this.app;

    let guildSettings = guildCache.get(creator.guildId);
    if (!guildSettings) {
      const row = await guildConfigRepo.findById(creator.guildId);
      if (!row?.enabled) return;
      guildSettings = row.settings;
      guildCache.set(creator.guildId, guildSettings);
    }

    const t = guildTranslator(this.app, creator.guildId, guildSettings);
    const guildBotCheck = checkBotGuildPermissions(member.guild, t);
    if (!guildBotCheck.ok) {
      logger.warn(
        { guildId: creator.guildId, userId: member.id, message: guildBotCheck.message },
        'Cannot create temp channel — bot missing guild permissions',
      );
      return;
    }

    const settings = mergeSettings(
      guildSettings,
      creator.settings,
      this.app.config.defaults.guild,
    );

    if (settings.maxChannelsPerUser) {
      const count = await tempRepo.countByOwner(creator.guildId, member.id);
      if (count >= settings.maxChannelsPerUser) {
        logger.debug({ userId: member.id }, 'Max channels per user reached');
        return;
      }
    }

    const creatorChannelRaw = member.guild.channels.cache.get(creator.channelId);
    if (!creatorChannelRaw || creatorChannelRaw.type !== ChannelType.GuildVoice) return;
    const creatorChannel: VoiceChannel = creatorChannelRaw;

    const namingCtx = await buildChannelTemplateContext(
      this.app,
      {
        channelId: 'pending',
        guildId: creator.guildId,
        creatorChannelId: creator.channelId,
        ownerId: member.id,
      },
      creatorChannel,
      creator,
      { forNewChannel: true },
    );
    if (!namingCtx) return;

    const channelName = await templateEngine.render(
      settings.channelNameTemplate,
      namingCtx,
    );

    const parentId = resolveTempChannelParentId(settings, creatorChannel);

    const parentChannel = parentId ? member.guild.channels.cache.get(parentId) : null;
    const channelBotCheck = checkBotChannelPermissions(
      member.guild,
      parentChannel ?? creatorChannel,
      { needsOverwrites: true },
      t,
    );
    if (!channelBotCheck.ok) {
      logger.warn(
        { guildId: creator.guildId, userId: member.id, message: channelBotCheck.message },
        'Cannot create temp channel — bot missing channel permissions',
      );
      return;
    }

    const { tempChannel: tempDefaults } = this.app.config.defaults;
    const permissionOverwrites = buildCreateOverwrites(
      settings,
      member,
      creatorChannel,
      tempDefaults.fallbackOwnerPermissions,
    );

    const position = resolveTempChannelPosition(
      member.guild,
      settings.tempChannelPosition,
      creatorChannel,
      parentId,
    );

    const tempChannel = await member.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildVoice,
      parent: parentId,
      position,
      bitrate: settings.bitrate ? settings.bitrate * 1000 : undefined,
      userLimit: settings.userLimit ?? undefined,
      rtcRegion:
        settings.rtcRegion && settings.rtcRegion !== 'auto'
          ? settings.rtcRegion
          : undefined,
      permissionOverwrites,
      reason: tempDefaults.createReason,
    });

    await applyTempChannelPermissions(
      tempChannel,
      settings,
      member,
      parentId,
      tempDefaults.fallbackOwnerPermissions,
    );

    await member.voice.setChannel(tempChannel);

    await tempRepo.insert({
      channel_id: tempChannel.id,
      guild_id: creator.guildId,
      creator_channel_id: creator.channelId,
      owner_id: member.id,
    });

    tempRegistry.register({
      channelId: tempChannel.id,
      guildId: creator.guildId,
      creatorChannelId: creator.channelId,
      ownerId: member.id,
    });

    logger.info(
      { guildId: creator.guildId, channelId: tempChannel.id, ownerId: member.id },
      'Created temp voice channel',
    );

    this.app.modLogService.logCreate(
      creator.guildId,
      settings,
      tempChannel,
      'temp',
      member,
      creator.channelId,
    );

    void postTempVoiceChatMessages(this.app, tempChannel, member, creator, settings);
  }

  /** Transfer ownership to a specific member in the channel. */
  async transferTempOwnershipTo(channel: VoiceChannel, newOwnerId: string): Promise<boolean> {
    const meta = this.app.tempRegistry.get(channel.id);
    if (!meta) return false;

    const next = channel.members.get(newOwnerId);
    if (!next || next.user.bot || next.id === meta.ownerId) return false;

    await this.transferTempOwnershipToMember(channel, meta, next);
    return true;
  }

  async deleteTempChannel(channelId: string, guildId: string): Promise<void> {
    const { client, tempRegistry, tempRepo, guildCache, logger } = this.app;

    const guild = client.guilds.cache.get(guildId);
    const channel = guild?.channels.cache.get(channelId);
    const meta = tempRegistry.get(channelId);
    const guildSettings = (await guildCache.load(guildId)) ?? guildCache.get(guildId);

    if (channel && meta && guildSettings) {
      const owner = guild?.members.cache.get(meta.ownerId);
      this.app.modLogService.logDelete(
        guildId,
        guildSettings,
        channel,
        'temp',
        owner,
        meta.creatorChannelId,
      );
    }

    tempRegistry.unregister(channelId);
    forgetChannelRenameHistory(channelId);

    if (channel) {
      await channel.delete(this.app.config.defaults.tempChannel.deleteReason).catch((err) => {
        logger.warn({ err, channelId }, 'Failed to delete temp channel');
      });
    }

    await tempRepo.delete(channelId).catch((err) => {
      logger.warn({ err, channelId }, 'Failed to delete temp channel row');
    });
    logger.debug({ channelId }, 'Temp channel removed');
  }

  /** Called during recovery when users are in a creator channel but no temp was created (bot was offline). */
  async recoverCreatorJoin(member: GuildMember, creator: CreatorConfig): Promise<void> {
    if (member.voice.channelId !== creator.channelId) return;

    const mutex = this.getMutex(member.guild.id);
    await mutex.runExclusive(async () => {
      if (member.voice.channelId !== creator.channelId) return;
      await this.createTempChannel(member, creator);
    });
  }

  async handleChannelDeleted(
    channelId: string,
    guildId: string,
    snapshot?: { name: string; type: number },
  ): Promise<void> {
    const { tempRegistry, tempRepo, guildCache, client } = this.app;
    const meta = tempRegistry.get(channelId);
    if (!meta) return;

    const guildSettings = (await guildCache.load(guildId)) ?? guildCache.get(guildId);
    const guild = client.guilds.cache.get(guildId);
    if (guildSettings && guild && snapshot) {
      const owner = guild.members.cache.get(meta.ownerId);
      const stub = {
        id: channelId,
        name: snapshot.name,
        guild,
        toString: () => `<#${channelId}>`,
      } as import('discord.js').VoiceChannel;
      this.app.modLogService.logDelete(
        guildId,
        guildSettings,
        stub,
        'temp',
        owner,
        meta.creatorChannelId,
      );
    }

    tempRegistry.unregister(channelId);
    await tempRepo.delete(channelId).catch(() => undefined);
  }

  private async logTempVoiceActivity(
    state: VoiceState,
    event: 'join' | 'leave',
  ): Promise<void> {
    const { channelId, member, guild } = state;
    if (!channelId || !member) return;

    const meta = this.app.tempRegistry.get(channelId);
    if (!meta) return;

    const channel = guild.channels.cache.get(channelId);
    if (!channel?.isVoiceBased()) return;

    if (event === 'join' && member.id === meta.ownerId && channel.members.size <= 1) {
      return;
    }

    const settings = await this.resolveTempChannelSettings(meta, guild.id);
    if (!settings) return;

    if (event === 'join') {
      this.app.modLogService.logJoin(
        guild.id,
        settings,
        channel,
        member,
        meta.creatorChannelId,
      );
      return;
    }

    this.app.modLogService.logLeave(
      guild.id,
      settings,
      channel,
      member,
      meta.creatorChannelId,
    );
  }

  /** When the stored owner is gone but others remain (e.g. bot was offline). */
  async reconcileTempOwnership(channel: VoiceChannel, meta: TempChannelMeta): Promise<void> {
    if (channel.members.has(meta.ownerId)) return;
    await this.transferTempOwnership(channel, meta);
    scheduleTempChannelNameRefresh(this.app, channel.id);
  }

  private scheduleNameRefreshIfNeeded(channelId: string): void {
    const meta = this.app.tempRegistry.get(channelId);
    if (!meta || !canAutoRenameTempChannel(this.app, meta)) return;
    scheduleTempChannelNameRefresh(this.app, channelId);
  }

  private async transferTempOwnership(
    channel: VoiceChannel,
    meta: TempChannelMeta,
  ): Promise<void> {
    const next = channel.members.find((m) => !m.user.bot);
    if (!next || next.id === meta.ownerId) return;
    await this.transferTempOwnershipToMember(channel, meta, next);
  }

  private async transferTempOwnershipToMember(
    channel: VoiceChannel,
    meta: TempChannelMeta,
    next: GuildMember,
  ): Promise<void> {
    const settings = await this.resolveTempChannelSettings(meta, channel.guild.id);
    if (!settings) return;

    const oldOwnerId = meta.ownerId;
    const { tempRegistry, tempRepo } = this.app;
    tempRegistry.setOwner(channel.id, next.id);
    await tempRepo.updateOwner(channel.id, next.id).catch(() => undefined);

    const creatorRaw = channel.guild.channels.cache.get(meta.creatorChannelId);
    const parentId =
      creatorRaw?.type === ChannelType.GuildVoice ?
        resolveTempChannelParentId(settings, creatorRaw)
      : undefined;

    await channel.permissionOverwrites.delete(oldOwnerId).catch(() => undefined);
    await applyTempChannelPermissions(
      channel,
      settings,
      next,
      parentId,
      this.app.config.defaults.tempChannel.fallbackOwnerPermissions,
    );

    this.app.logger.info(
      { channelId: channel.id, oldOwnerId, newOwnerId: next.id },
      'Transferred temp channel ownership',
    );
  }

  private async resolveTempChannelSettings(
    meta: TempChannelMeta,
    guildId: string,
  ): Promise<ReturnType<typeof mergeSettings> | null> {
    const guildSettings = await this.app.guildCache.load(guildId);
    if (!guildSettings) return null;

    const creator = this.app.creatorIndex.get(meta.creatorChannelId);
    return mergeSettings(
      guildSettings,
      creator?.settings ?? {},
      this.app.config.defaults.guild,
    );
  }

  releaseGuild(guildId: string): void {
    this.mutexes.delete(guildId);
  }

  private getMutex(guildId: string): Mutex {
    let mutex = this.mutexes.get(guildId);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(guildId, mutex);
    }
    return mutex;
  }
}
