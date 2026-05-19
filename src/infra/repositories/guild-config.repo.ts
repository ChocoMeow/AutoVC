import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseGuildSettings,
  type GuildSettings,
  type GuildSettingsRecord,
} from '@/domain/settings/guild-settings.ts';
import { DatabaseError } from '@/shared/errors.ts';

export interface GuildConfigRow {
  id: string;
  enabled: boolean;
  settings: GuildSettingsRecord;
  created_at: string;
  updated_at: string;
}

export class GuildConfigRepository {
  constructor(
    private readonly db: SupabaseClient,
    private readonly defaultSettings: GuildSettingsRecord,
  ) {}

  async upsert(guildId: string, settings?: Partial<GuildSettings>): Promise<GuildConfigRow> {
    const merged = parseGuildSettings({ ...this.defaultSettings, ...settings }, this.defaultSettings);
    const { data, error } = await this.db
      .from('guild_configs')
      .upsert(
        {
          id: guildId,
          enabled: true,
          settings: merged,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' },
      )
      .select()
      .single();

    if (error) throw new DatabaseError(error.message);
    return this.#mapRow(data);
  }

  async findById(guildId: string): Promise<GuildConfigRow | null> {
    const { data, error } = await this.db
      .from('guild_configs')
      .select()
      .eq('id', guildId)
      .maybeSingle();

    if (error) throw new DatabaseError(error.message);
    if (!data) return null;
    return this.#mapRow(data);
  }

  async updateSettings(
    guildId: string,
    patch: Partial<GuildSettings>,
  ): Promise<GuildSettingsRecord> {
    const existing = await this.findById(guildId);
    const merged = { ...(existing?.settings ?? {}), ...patch };
    const settings = parseGuildSettings(merged, this.defaultSettings);

    const { error } = await this.db
      .from('guild_configs')
      .update({ settings, updated_at: new Date().toISOString() })
      .eq('id', guildId);

    if (error) throw new DatabaseError(error.message);
    return settings;
  }

  #mapRow(row: Record<string, unknown>): GuildConfigRow {
    return {
      id: row.id as string,
      enabled: row.enabled as boolean,
      settings: parseGuildSettings(row.settings ?? {}, this.defaultSettings),
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }
}
