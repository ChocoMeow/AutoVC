import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';
import type { GuildConfigRepository } from '@/infra/repositories/guild-config.repo.ts';

export class GuildConfigCache {
  private readonly cache = new Map<string, GuildSettingsRecord>();

  constructor(private readonly guildConfigRepo: GuildConfigRepository) {}

  get(guildId: string): GuildSettingsRecord | undefined {
    return this.cache.get(guildId);
  }

  async load(guildId: string): Promise<GuildSettingsRecord | null> {
    const cached = this.cache.get(guildId);
    if (cached) return cached;

    const row = await this.guildConfigRepo.findById(guildId);
    if (!row || !row.enabled) return null;

    this.cache.set(guildId, row.settings);
    return row.settings;
  }

  set(guildId: string, settings: GuildSettingsRecord): void {
    this.cache.set(guildId, settings);
  }

  invalidate(guildId: string): void {
    this.cache.delete(guildId);
  }

  purgeGuild(guildId: string): void {
    this.invalidate(guildId);
  }
}
