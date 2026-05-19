import type { SupabaseClient } from '@supabase/supabase-js';
import { DatabaseError } from '@/shared/errors.ts';
import {
  parseGuildSettingsPatch,
  type GuildSettings,
  type GuildSettingsRecord,
} from '@/domain/settings/guild-settings.ts';

export interface CreatorChannelRow {
  id: string;
  guild_id: string;
  channel_id: string;
  label: string | null;
  settings: Partial<GuildSettingsRecord>;
  created_at: string;
}

export class CreatorChannelRepository {
  constructor(private readonly db: SupabaseClient) {}

  async add(
    guildId: string,
    channelId: string,
    label?: string | null,
    settings: Partial<GuildSettings> = {},
  ): Promise<CreatorChannelRow> {
    const { data, error } = await this.db
      .from('creator_channels')
      .insert({
        guild_id: guildId,
        channel_id: channelId,
        label: label ?? null,
        settings: parseGuildSettingsPatch(settings),
      })
      .select()
      .single();

    if (error) throw new DatabaseError(error.message);
    return this.#mapRow(data);
  }

  async remove(guildId: string, channelId: string): Promise<boolean> {
    const { error, count } = await this.db
      .from('creator_channels')
      .delete({ count: 'exact' })
      .eq('guild_id', guildId)
      .eq('channel_id', channelId);

    if (error) throw new DatabaseError(error.message);
    return (count ?? 0) > 0;
  }

  async findAll(): Promise<CreatorChannelRow[]> {
    const rows: CreatorChannelRow[] = [];
    const pageSize = 500;
    let from = 0;

    while (true) {
      const { data, error } = await this.db
        .from('creator_channels')
        .select()
        .range(from, from + pageSize - 1);

      if (error) throw new DatabaseError(error.message);
      if (!data?.length) break;
      rows.push(...data.map((row) => this.#mapRow(row)));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }

  async findByChannelId(channelId: string): Promise<CreatorChannelRow | null> {
    const { data, error } = await this.db
      .from('creator_channels')
      .select()
      .eq('channel_id', channelId)
      .maybeSingle();

    if (error) throw new DatabaseError(error.message);
    if (!data) return null;
    return this.#mapRow(data);
  }

  async updateSettings(
    guildId: string,
    channelId: string,
    patch: Partial<GuildSettings>,
  ): Promise<Partial<GuildSettingsRecord>> {
    const existing = await this.findByChannelId(channelId);
    const merged = parseGuildSettingsPatch({
      ...(existing?.settings ?? {}),
      ...patch,
    });

    const { error } = await this.db
      .from('creator_channels')
      .update({ settings: merged })
      .eq('guild_id', guildId)
      .eq('channel_id', channelId);

    if (error) throw new DatabaseError(error.message);
    return merged;
  }

  #mapRow(row: Record<string, unknown>): CreatorChannelRow {
    return {
      id: row.id as string,
      guild_id: row.guild_id as string,
      channel_id: row.channel_id as string,
      label: (row.label as string | null) ?? null,
      settings: parseGuildSettingsPatch(row.settings ?? {}),
      created_at: row.created_at as string,
    };
  }
}
