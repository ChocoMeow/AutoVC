import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import type { CreatorChannelRow } from '@/infra/repositories/creator-channel.repo.ts';

export interface CreatorConfig {
  id: string;
  guildId: string;
  channelId: string;
  label: string | null;
  settings: Partial<GuildSettingsRecord>;
}

export class CreatorChannelIndex {
  private readonly byChannelId = new Map<string, CreatorConfig>();

  register(row: CreatorChannelRow): void {
    this.update({
      id: row.id,
      guildId: row.guild_id,
      channelId: row.channel_id,
      label: row.label,
      settings: row.settings,
    });
  }

  /** Update in-memory creator config (cache-only; does not write to DB). */
  update(config: CreatorConfig): void {
    this.byChannelId.set(config.channelId, config);
  }

  unregister(channelId: string): void {
    this.byChannelId.delete(channelId);
  }

  get(channelId: string): CreatorConfig | undefined {
    return this.byChannelId.get(channelId);
  }

  listByGuild(guildId: string): CreatorConfig[] {
    return [...this.byChannelId.values()].filter((c) => c.guildId === guildId);
  }

  rebuild(rows: CreatorChannelRow[]): void {
    this.byChannelId.clear();
    for (const row of rows) this.register(row);
  }

  purgeGuild(guildId: string): void {
    for (const [channelId, config] of this.byChannelId) {
      if (config.guildId === guildId) this.byChannelId.delete(channelId);
    }
  }
}
