import type { Guild, GuildBasedChannel, GuildMember, VoiceBasedChannel } from 'discord.js';
import type { ModLogChannelKind } from '@/domain/mod-log/channel-kind.ts';
import type { ModLogEvent } from '@/domain/mod-log/types.ts';
import type { GuildSettingsRecord } from '@/domain/settings/guild-settings.ts';

export type TemplateProfile = 'channel' | 'message';

/** Event-specific slice for moderation log templates. */
export interface ModLogContext {
  event: ModLogEvent;
  channel: GuildBasedChannel;
  channelKind: ModLogChannelKind;
  user?: GuildMember | null;
  creatorChannelId?: string;
  oldName?: string;
  newName?: string;
}

/**
 * Shared context for channel names, greetings, mod logs, and other templated text.
 * Use {@link TemplateProfile} to control post-processing (channel-name sanitization vs plain text).
 */
export interface TemplateContext {
  profile: TemplateProfile;
  guild: Guild;
  settings: GuildSettingsRecord;
  member?: GuildMember | null;
  channel?: VoiceBasedChannel;
  creatorChannel?: VoiceBasedChannel | null;
  memberCountInNewChannel?: number;
  tempChannelOrdinal?: number;
  ownerTempOrdinal?: number;
  modLog?: ModLogContext;
}
