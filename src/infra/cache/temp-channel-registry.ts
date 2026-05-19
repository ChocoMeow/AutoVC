import type { TempChannelSettings } from '@/domain/temp-channel-settings.ts';
import { parseTempChannelSettings } from '@/domain/temp-channel-settings.ts';
import type { TempChannelRow } from '@/infra/repositories/temp-channel.repo.ts';

export interface TempChannelMeta {
  channelId: string;
  guildId: string;
  creatorChannelId: string;
  ownerId: string;
  interfaceMessageId?: string;
  settings?: TempChannelSettings;
}

export class TempChannelRegistry {
  private readonly channels = new Map<string, TempChannelMeta>();
  private readonly deleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly deleteGenerations = new Map<string, number>();

  register(meta: TempChannelMeta): void {
    this.channels.set(meta.channelId, { ...meta, settings: meta.settings ?? {} });
    this.cancelDelete(meta.channelId);
  }

  unregister(channelId: string): void {
    this.channels.delete(channelId);
    this.cancelDelete(channelId);
  }

  has(channelId: string): boolean {
    return this.channels.has(channelId);
  }

  get(channelId: string): TempChannelMeta | undefined {
    return this.channels.get(channelId);
  }

  setOwner(channelId: string, ownerId: string): void {
    const meta = this.channels.get(channelId);
    if (meta) meta.ownerId = ownerId;
  }

  setInterfaceMessage(channelId: string, messageId: string): void {
    const meta = this.channels.get(channelId);
    if (meta) meta.interfaceMessageId = messageId;
  }

  setSettings(channelId: string, settings: TempChannelSettings): void {
    const meta = this.channels.get(channelId);
    if (meta) meta.settings = settings;
  }

  listByGuild(guildId: string): TempChannelMeta[] {
    return [...this.channels.values()].filter((m) => m.guildId === guildId);
  }

  countByGuild(guildId: string): number {
    return this.listByGuild(guildId).length;
  }

  countByOwner(guildId: string, ownerId: string): number {
    return this.listByGuild(guildId).filter((m) => m.ownerId === ownerId).length;
  }

  countByCreator(guildId: string, creatorChannelId: string): number {
    return this.listByGuild(guildId).filter((m) => m.creatorChannelId === creatorChannelId)
      .length;
  }

  listAll(): TempChannelMeta[] {
    return [...this.channels.values()];
  }

  registerFromRow(row: TempChannelRow): void {
    this.register({
      channelId: row.channel_id,
      guildId: row.guild_id,
      creatorChannelId: row.creator_channel_id,
      ownerId: row.owner_id,
      settings: parseTempChannelSettings(row.settings),
    });
  }

  cancelDelete(channelId: string): void {
    const timer = this.deleteTimers.get(channelId);
    if (timer) {
      clearTimeout(timer);
      this.deleteTimers.delete(channelId);
    }
    this.deleteGenerations.delete(channelId);
  }

  scheduleDelete(
    channelId: string,
    delayMs: number,
    callback: () => void | Promise<void>,
  ): void {
    this.cancelDelete(channelId);
    const generation = (this.deleteGenerations.get(channelId) ?? 0) + 1;
    this.deleteGenerations.set(channelId, generation);

    const timer = setTimeout(async () => {
      if (this.deleteGenerations.get(channelId) !== generation) return;
      this.deleteTimers.delete(channelId);
      this.deleteGenerations.delete(channelId);
      await callback();
    }, delayMs);

    this.deleteTimers.set(channelId, timer);
  }

  purgeGuild(guildId: string): void {
    for (const [channelId, meta] of this.channels) {
      if (meta.guildId === guildId) {
        this.unregister(channelId);
      }
    }
  }
}
