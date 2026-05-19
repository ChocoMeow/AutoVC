import type { SupabaseClient } from '@supabase/supabase-js';
import type { TempChannelSettings } from '@/domain/temp-channel-settings.ts';
import { DatabaseError } from '@/shared/errors.ts';

export interface TempChannelRow {
  channel_id: string;
  guild_id: string;
  creator_channel_id: string;
  owner_id: string;
  created_at: string;
  settings?: unknown;
}

export class TempChannelRepository {
  constructor(private readonly db: SupabaseClient) {}

  async insert(row: Omit<TempChannelRow, 'created_at'>): Promise<TempChannelRow> {
    const { data, error } = await this.db
      .from('temp_channels')
      .insert({ settings: {}, ...row })
      .select()
      .single();

    if (error) throw new DatabaseError(error.message);
    return data as TempChannelRow;
  }

  async updateSettings(channelId: string, settings: TempChannelSettings): Promise<void> {
    const { error } = await this.db
      .from('temp_channels')
      .update({ settings })
      .eq('channel_id', channelId);

    if (error) throw new DatabaseError(error.message);
  }

  async updateOwner(channelId: string, ownerId: string): Promise<void> {
    const { error } = await this.db
      .from('temp_channels')
      .update({ owner_id: ownerId })
      .eq('channel_id', channelId);

    if (error) throw new DatabaseError(error.message);
  }

  async delete(channelId: string): Promise<void> {
    const { error } = await this.db
      .from('temp_channels')
      .delete()
      .eq('channel_id', channelId);

    if (error) throw new DatabaseError(error.message);
  }

  async findAll(): Promise<TempChannelRow[]> {
    const rows: TempChannelRow[] = [];
    const pageSize = 500;
    let from = 0;

    while (true) {
      const { data, error } = await this.db
        .from('temp_channels')
        .select()
        .range(from, from + pageSize - 1);

      if (error) throw new DatabaseError(error.message);
      if (!data?.length) break;
      rows.push(...(data as TempChannelRow[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }

    return rows;
  }

  async countByOwner(guildId: string, ownerId: string): Promise<number> {
    const { count, error } = await this.db
      .from('temp_channels')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('owner_id', ownerId);

    if (error) throw new DatabaseError(error.message);
    return count ?? 0;
  }
}
